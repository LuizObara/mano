import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import select

from .commands import handle_command
from .config import Settings
from .context import Ctx
from .db import Database
from .events import Hub
from .intents.fallback import Fallback
from .intents.registry import Registry
from .llm import LLM
from .models import CommandLog
from .skills import ALL_SKILLS
from .voice.service import VoiceService
from .voice.tts import Speaker, make_speaker

log = logging.getLogger("mano")


class CommandIn(BaseModel):
    text: str
    speak: bool = True
    source: str = "text"


def create_app(settings: Settings | None = None, speaker: Speaker | None = None) -> FastAPI:
    settings = settings or Settings()
    hub = Hub()
    ctx = Ctx(
        settings=settings,
        db=Database(settings.db_path),
        hub=hub,
        scheduler=AsyncIOScheduler(),
        speaker=speaker or make_speaker(
            settings.tts_enabled, settings.tts_voice, settings.tts_rate,
            on_state=lambda state: ctx.set_voice_state(state),
        ),
    )
    registry = Registry()
    ctx.registry = registry
    ctx.llm = LLM(settings)
    ctx.fallback = Fallback(ctx.llm, registry)
    for skill_cls in ALL_SKILLS:
        registry.add(skill_cls(ctx))
    voice = VoiceService(ctx)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        hub.loop = asyncio.get_running_loop()
        ctx.scheduler.start()
        for skill in registry.skills:
            await skill.start()
        await voice.start()
        log.info("Mano no ar em http://%s:%s", settings.host, settings.port)
        yield
        await voice.stop()
        for skill in registry.skills:
            await skill.stop()
        ctx.scheduler.shutdown(wait=False)
        ctx.speaker.stop()

    app = FastAPI(title="Mano", lifespan=lifespan)
    app.state.ctx = ctx
    app.state.voice = voice

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    @app.post("/api/command")
    async def command(body: CommandIn):
        return await handle_command(ctx, body.text, source=body.source, speak=body.speak)

    @app.get("/api/skills")
    async def skills():
        return registry.catalog()

    @app.get("/api/history")
    async def history(limit: int = 20):
        with ctx.db.session() as s:
            rows = s.exec(select(CommandLog).order_by(CommandLog.id.desc()).limit(limit))
            return [r.public() for r in rows]

    @app.get("/api/voice")
    async def voice_status():
        return {**voice.status(), "state": ctx.voice_state}

    @app.post("/api/voice/listen")
    async def voice_listen():
        return {"ok": voice.listen_now(), **voice.status()}

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        await hub.connect(websocket)
        hello = {"type": "hello", "voice": ctx.voice_state, "voice_status": voice.status()}
        for skill in registry.skills:
            hello.update(skill.snapshot())
        await websocket.send_json(hello)
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("type") == "command":
                    await handle_command(ctx, msg.get("text", ""), source="text", speak=msg.get("speak", True))
        except WebSocketDisconnect:
            hub.disconnect(websocket)

    for skill in registry.skills:
        router = skill.router()
        if router:
            app.include_router(router)

    @app.get("/", include_in_schema=False)
    async def root(request: Request):
        # o login do Google (app para computador) volta para a raiz: /?code=...&state=...
        google = ctx.skill("google")
        if google and "state" in request.query_params:
            resp = await google.handle_root_callback(request.query_params)
            if resp is not None:
                return resp
        index = settings.frontend_dist / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"mano": "ok", "frontend": "não compilado (rode npm run build em frontend/)"})

    _mount_frontend(app, settings)
    return app


def _mount_frontend(app: FastAPI, settings: Settings) -> None:
    dist = settings.frontend_dist
    if not (dist / "index.html").exists():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        file = (dist / path).resolve()
        if path and file.is_file() and dist.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(dist / "index.html")
