"""Pesquisa rápida.

"o que é fotossíntese?" / "quem foi Machado de Assis?" → resposta falada com o resumo da Wikipedia
"pesquisa preço do dólar"                            → abre a busca do Google no navegador do PC
"""

from __future__ import annotations

import logging
import re
from urllib.parse import quote_plus

import httpx

from ..intents.registry import Reply, Skill, intent
from ..intents.ptbr import restore_accents

log = logging.getLogger(__name__)

WIKI_API = "https://pt.wikipedia.org/w/api.php"


def google_url(q: str) -> str:
    return f"https://www.google.com/search?q={quote_plus(q)}"


def for_speech(text: str, max_sentences: int = 2) -> str:
    """Tira parênteses (datas, pronúncia) e corta em poucas frases para falar."""
    t = re.sub(r"\s*\([^()]*\)", "", text)
    t = re.sub(r"\s*\[[^\]]*\]", "", t)
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])", t.strip())
    return " ".join(sentences[:max_sentences]).strip()


class SearchSkill(Skill):
    name = "pesquisa"
    description = "Pesquisa rápida"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._http: httpx.AsyncClient | None = None

    @property
    def http(self) -> httpx.AsyncClient:
        # criado no primeiro uso: carregar os certificados SSL leva ~1 s nesta máquina
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=6, headers={"User-Agent": self.ctx.settings.http_user_agent})
        return self._http

    @http.setter
    def http(self, client: httpx.AsyncClient) -> None:
        self._http = client

    async def stop(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    async def wiki(self, q: str) -> dict | None:
        r = await self.http.get(WIKI_API, params={
            "action": "query", "format": "json", "formatversion": 2, "redirects": 1,
            "generator": "search", "gsrsearch": q, "gsrlimit": 1,
            "prop": "extracts|pageimages|info", "exintro": 1, "explaintext": 1, "exsentences": 4,
            "piprop": "thumbnail", "pithumbsize": 320, "inprop": "url",
        })
        r.raise_for_status()
        pages = (r.json().get("query") or {}).get("pages") or []
        if not pages or not pages[0].get("extract"):
            return None
        p = pages[0]
        return {
            "title": p["title"], "extract": p["extract"].strip(), "url": p.get("fullurl"),
            "image": (p.get("thumbnail") or {}).get("source"),
        }

    @intent(
        "search.whatis",
        patterns=[r"^(?:o )?que (?:e|eh|sao|significa|quer dizer) (?:um |uma |o |a |os |as )?(?P<q>.+)$",
                  r"^quem (?:e|foi|era|sao|foram) (?:o |a |os |as )?(?P<q>.+)$",
                  r"^(?:me )?(?:fala|conta|explica|explique|diz) (?:sobre|o que e|o que sao|quem foi|quem e) (?:o |a )?(?P<q>.+)$",
                  r"^o que voce sabe sobre (?:o |a )?(?P<q>.+)$"],
        examples=["o que é fotossíntese?", "quem foi Machado de Assis?"],
        priority=1,
    )
    async def whatis_intent(self, slots: dict) -> Reply:
        q = restore_accents(slots["q"], slots.get("_raw", ""))
        link = {"label": f"Pesquisar \"{q}\" no Google", "url": google_url(q)}
        try:
            page = await self.wiki(q)
        except Exception:
            log.exception("falha na Wikipedia")
            return Reply("Não consegui consultar a Wikipedia agora.", data={"link": link})
        if page is None:
            return Reply(f"Não achei nada sobre {q} na Wikipedia.", data={"link": link})
        return Reply(for_speech(page["extract"]), display=page["extract"], data={"card": page, "link": link})

    @intent(
        "search.web",
        patterns=[r"^(?:pesquisa|pesquise|pesquisar|procura|procure|busca|busque|googla|da um google)"
                  r"(?: no google| na internet| na web| sobre| por| pra mim)? (?P<q>.+)$"],
        examples=["pesquisa previsão do tempo"],
        priority=2,
    )
    async def web_intent(self, slots: dict) -> Reply:
        q = restore_accents(slots["q"], slots.get("_raw", ""))
        url = google_url(q)
        try:
            self.ctx.open_url(url)
        except Exception:
            log.exception("não consegui abrir o navegador")
        return Reply(f"Abri a pesquisa por {q} no navegador.", data={"link": {"label": "Abrir de novo", "url": url}})
