"""Painel do modelo local (Ollama): status, escolha do modelo, download e teste rápido."""

from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..intents.registry import Skill
from ..llm import LLMUnavailable, tidy


class LLMConfigIn(BaseModel):
    enabled: bool | None = None
    fallback: bool | None = None
    model: str | None = None  # "" = automático


class PullIn(BaseModel):
    model: str


class LLMSkill(Skill):
    name = "llm"
    description = "Modelo local"

    @property
    def llm(self):
        return self.ctx.llm

    async def push(self) -> None:
        await self.ctx.hub.broadcast("llm", {"llm": self.llm.status()})

    def snapshot(self) -> dict:
        return {"llm": self.llm.status()}

    async def start(self) -> None:
        self.llm.on_change = self.push
        if self.llm.enabled:
            asyncio.create_task(self._check())
        self.ctx.scheduler.add_job(self._check, "interval", seconds=60, id="llm-check", replace_existing=True,
                                   max_instances=1, coalesce=True)

    async def _check(self) -> None:
        if not self.llm.enabled or self.llm.busy or self.llm.pull:
            return
        before = (self.llm.reachable, self.llm.model)
        await self.llm.refresh()
        if (self.llm.reachable, self.llm.model) != before:
            await self.push()

    async def stop(self) -> None:
        if self.llm._http is not None:
            await self.llm._http.aclose()

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/llm", tags=["llm"])

        @r.get("")
        async def status():
            if self.llm.enabled:
                await self.llm.refresh()
            return self.llm.status()

        @r.post("/config")
        async def config(body: LLMConfigIn):
            values = body.model_dump(exclude_none=True)
            if "model" in values:
                values["model"] = values["model"].strip() or None  # None = automático
            self.llm.save_config(**values)
            if self.llm.enabled:
                await self.llm.refresh()
            await self.push()
            return self.llm.status()

        @r.post("/pull")
        async def pull(body: PullIn):
            if self.llm.pull and self.llm.pull.get("status") != "erro":
                raise HTTPException(409, "Já tem um download em andamento.")
            if not await self.llm.refresh():
                raise HTTPException(400, "O Ollama não está rodando.")

            async def run():
                try:
                    await self.llm.pull_model(body.model.strip())
                except Exception:
                    pass

            asyncio.create_task(run())
            return {"ok": True}

        @r.post("/test")
        async def test():
            t = time.monotonic()
            try:
                text = await self.llm.generate("Diga, em uma frase curta e simpática em português, que está funcionando.",
                                               max_tokens=40, label="teste", interactive=True, temperature=0.7)
            except LLMUnavailable as e:
                raise HTTPException(400, str(e)) from e
            return {"text": tidy(text), "seconds": round(time.monotonic() - t, 1), "model": self.llm.model}

        return r
