"""YouTube: busca com yt-dlp (sem chave de API) e toca no player do visor.

"abre o vídeo de receita de pão no youtube" → toca o 1º resultado no visor.
"pesquisa no youtube aula de violão"        → mostra os resultados no visor.
Sem nenhuma tela aberta, abre no navegador do PC.
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
from urllib.parse import quote_plus

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..intents.ptbr import restore_accents
from ..intents.registry import Reply, Skill, intent

log = logging.getLogger(__name__)

_WORDS = re.compile(r"\b(youtube|video|videos)\b")
_SEARCH_VERB = re.compile(r"^(?:pesquisa|pesquise|procura|procure|busca|busque)\b")
_NOISE = re.compile(
    r"\b(?:abre|abrir|abra|toca|tocar|coloca|coloque|poe|bota|mostra|mostrar|me mostra|quero ver|assistir|assiste|ver|"
    r"pesquisa|pesquise|procura|procure|busca|busque|no youtube|do youtube|youtube|um video|1 video|o video|uns videos|"
    r"os videos|videos|video|ai)\b"
)


class PlayIn(BaseModel):
    id: str
    title: str = ""


def parse_youtube(text: str) -> dict | None:
    if not _WORDS.search(text):
        return None
    search = bool(_SEARCH_VERB.match(text))
    q = _NOISE.sub(" ", text)
    q = re.sub(r"\s+", " ", q).strip()
    q = re.sub(r"^(?:(?:de|do|da|sobre|com|que|um|uma|1|o|a|os|as)(?:\s+|$))+", "", q).strip()
    q = re.sub(r"(?:\s+|^)(?:no|na|em|o|a)$", "", q).strip()
    return {"q": q, "search": search}


class YouTubeSkill(Skill):
    name = "youtube"
    description = "Vídeos (YouTube)"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._ydl = None
        self._lock = threading.Lock()
        self.searcher = self._search_sync  # trocado nos testes

    def _search_sync(self, q: str, n: int) -> list[dict]:
        import yt_dlp

        with self._lock:
            if self._ydl is None:
                self._ydl = yt_dlp.YoutubeDL({
                    "quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "skip_download": True,
                    "http_headers": {"Accept-Language": "pt-BR,pt;q=0.9"},
                })
            info = self._ydl.extract_info(f"ytsearch{n}:{q}", download=False)
        out = []
        for e in info.get("entries") or []:
            if not e or not e.get("id"):
                continue
            out.append({
                "id": e["id"], "title": e.get("title") or "", "channel": e.get("channel") or e.get("uploader") or "",
                "duration": e.get("duration"), "thumb": f"https://i.ytimg.com/vi/{e['id']}/mqdefault.jpg",
            })
        return out

    async def search(self, q: str, n: int = 6) -> list[dict]:
        return await asyncio.to_thread(self.searcher, q, n)

    async def show(self, video: dict) -> None:
        spotify = self.ctx.skill("spotify")
        if spotify:
            await spotify.pause_if_playing()
        if self.ctx.hub.clients:
            await self.ctx.hub.broadcast("youtube", {"video": video})
        else:
            await asyncio.to_thread(self.ctx.open_url, f"https://www.youtube.com/watch?v={video['id']}")

    # ---------- intenções ----------

    def match(self, text: str) -> dict | None:
        return parse_youtube(text)

    @intent("youtube.play", matcher="match", priority=13,
            examples=["abre um vídeo de receita de pão no YouTube", "pesquisa no YouTube aula de violão"])
    async def play_intent(self, slots: dict) -> Reply:
        q = restore_accents(slots["q"], slots.get("_raw", ""))
        if not q:
            await asyncio.to_thread(self.ctx.open_url, "https://www.youtube.com")
            return Reply("Abrindo o YouTube.")
        try:
            results = await self.search(q, 6 if slots["search"] else 1)
        except Exception:
            log.exception("falha na busca do YouTube")
            return Reply("Não consegui buscar no YouTube agora.",
                         data={"link": {"label": "Abrir a busca no YouTube",
                                        "url": f"https://www.youtube.com/results?search_query={quote_plus(q)}"}})
        if not results:
            return Reply(f"Não achei vídeos de {q}.")
        if slots["search"]:
            await self.ctx.hub.broadcast("youtube.results", {"q": q, "results": results})
            return Reply(f"Achei estes vídeos de {q}.", data={"youtube_results": results})
        v = results[0]
        await self.show(v)
        return Reply(f"Abrindo {v['title']}.", data={"video": v})

    @intent("youtube.close",
            patterns=[r"^(fecha|fechar|feche|tira|sai do)( o)? (video|youtube|player)$"],
            examples=["fecha o vídeo"], priority=31)
    async def close_intent(self, slots: dict) -> Reply:
        await self.ctx.hub.broadcast("youtube.close", {})
        return Reply("Fechado.")

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/youtube", tags=["youtube"])

        @r.get("/search")
        async def search(q: str):
            if not q.strip():
                raise HTTPException(400)
            return await self.search(q.strip(), 8)

        @r.post("/play")
        async def play(body: PlayIn):
            await self.show({"id": body.id, "title": body.title,
                             "thumb": f"https://i.ytimg.com/vi/{body.id}/mqdefault.jpg"})
            return {"ok": True}

        return r
