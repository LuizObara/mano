"""Segundo cérebro: o vault do Obsidian dentro do Mano.

"anota que a reunião foi remarcada"   → acrescenta na seção Capturas da nota de hoje
"procura nas notas sobre SIA"         → busca no índice (sem acento, por prefixo)
"lê a nota sobre RenovarTech"         → fala o começo da nota e abre no visor
"o que eu anotei hoje?"               → lê as capturas do dia
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...intents.ptbr import best_match, restore_accents
from ...intents.registry import Reply, Skill, intent
from .vault import Vault, detect_vaults, fold, plain

log = logging.getLogger(__name__)

_RAW_CAPTURE = re.compile(
    r"^\W*(?:(?:(?:fala|ei|oi|o|e ai|ola)\s+)?mano\W*)?"
    r"(?:anota|anote|registra|registre|escreve|escreva|guarda|guarde|salva|salve|nota)\b"
    r"(?:\s+(?:ai|isso))?(?:\s+(?:que|uma nota|na nota|no diario|no meu diario|nas notas|no cerebro))?\s*[:,\-]?\s*"
)


class ConfigIn(BaseModel):
    vault: str


class CaptureIn(BaseModel):
    text: str


def say_sentences(text: str, n: int = 2, limit: int = 320) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text)
    out = " ".join(parts[:n]).strip()
    return out if len(out) <= limit else out[:limit].rsplit(" ", 1)[0] + "…"


class NotesSkill(Skill):
    name = "notas"
    description = "Notas (Obsidian)"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._cfg_path = ctx.settings.data_dir / "notes.json"
        self.vault: Vault | None = None
        self.total = 0
        self._open_vault()

    # ---------- configuração ----------

    def vault_dir(self) -> Path | None:
        if self.ctx.settings.vault_path:
            return Path(self.ctx.settings.vault_path)
        try:
            v = json.loads(self._cfg_path.read_text(encoding="utf-8")).get("vault")
            return Path(v) if v else None
        except (OSError, ValueError):
            return None

    def _open_vault(self) -> None:
        d = self.vault_dir()
        self.vault = Vault(d, self.ctx.settings.db_path) if d and d.is_dir() else None

    def status(self) -> dict:
        v = self.vault
        return {
            "configured": v is not None,
            "vault": str(v.root) if v else None,
            "vault_name": v.root.name if v else None,
            "total": self.total,
            "daily": v.daily_path() if v else None,
        }

    def snapshot(self) -> dict:
        return {"notes": self.status()}

    def obsidian_url(self, rel: str) -> str:
        name = self.vault.root.name
        return f"obsidian://open?vault={quote(name)}&file={quote(rel.removesuffix('.md'))}"

    async def reindex(self) -> None:
        if self.vault is None:
            return
        try:
            res = await asyncio.to_thread(self.vault.reindex)
        except Exception:
            log.exception("falha ao indexar o vault")
            return
        changed = res["changed"] or res["removed"] or res["total"] != self.total
        self.total = res["total"]
        if changed:
            await self.ctx.hub.broadcast("notes", self.snapshot())

    async def start(self) -> None:
        self.ctx.scheduler.add_job(self.reindex, "interval", seconds=60, id="notes-reindex", replace_existing=True,
                                   max_instances=1, coalesce=True)
        await self.reindex()

    # ---------- intenções ----------

    def _not_ready(self) -> Reply | None:
        if self.vault is None:
            return Reply("Ainda não sei onde fica seu vault do Obsidian. Configure na aba Ajustes.")
        return None

    @staticmethod
    def raw_capture_text(raw: str, norm_what: str) -> str:
        """Pega o texto da captura da frase original (com acentos e pontuação)."""
        m = _RAW_CAPTURE.match(fold(raw))
        text = raw[m.end():].strip() if m else ""
        if not text:
            text = restore_accents(norm_what, raw)
        return text[:1].upper() + text[1:]

    @intent(
        "notes.capture",
        patterns=[r"^(?:anota|anote|registra|registre|escreve|escreva|guarda|guarde|salva|salve)(?: ai| isso)?"
                  r"(?: (?:que|uma nota|na nota|no diario|no meu diario|nas notas|no cerebro))?\s*(?P<what>.+)$",
                  r"^nota (?P<what>.+)$"],
        examples=["anota que a reunião foi remarcada pra sexta"],
        priority=3,
    )
    async def capture_intent(self, slots: dict) -> Reply:
        if (r := self._not_ready()) is not None:
            return r
        text = self.raw_capture_text(slots.get("_raw", ""), slots["what"])
        rel = await asyncio.to_thread(self.vault.capture, text)
        await self.reindex()
        return Reply("Anotado.", display=f"Anotado em {Path(rel).stem}: {text}", data={"note": {"path": rel}})

    @intent(
        "notes.today",
        patterns=[r"\bo que (eu )?anotei hoje\b", r"\bminhas (anotacoes|capturas|notas) de hoje\b"],
        examples=["o que eu anotei hoje?"],
        priority=4,
    )
    async def today_intent(self, slots: dict) -> Reply:
        if (r := self._not_ready()) is not None:
            return r
        items = await asyncio.to_thread(self.vault.captures)
        if not items:
            return Reply("Você ainda não anotou nada hoje.")
        return Reply(f"Hoje você anotou: " + "; ".join(items) + ".")

    @intent(
        "notes.search",
        patterns=[r"^(?:procura|procure|busca|busque|pesquisa|pesquise|acha|ache)(?: nas| nas minhas| no meu| no| nos meus| em)?"
                  r" (?:notas|anotacoes|cerebro|segundo cerebro|obsidian|vault)(?: sobre| por| de| do| da)? (?P<q>.+)$",
                  r"\bo que (?:eu )?(?:anotei|escrevi|tenho anotado|sei) sobre (?P<q>.+)$",
                  r"\btenho (?:alguma )?nota sobre (?P<q>.+)$"],
        examples=["procura nas notas sobre lógica de programação", "o que eu anotei sobre SIA?"],
        priority=4,
    )
    async def search_intent(self, slots: dict) -> Reply:
        if (r := self._not_ready()) is not None:
            return r
        q = restore_accents(slots["q"], slots.get("_raw", ""))
        results = await asyncio.to_thread(self.vault.search, q, 8)
        if not results:
            return Reply(f"Não achei nada sobre {q} nas suas notas.")
        n = len(results)
        names = ", ".join(r["title"] for r in results[:3])
        await self.ctx.hub.broadcast("notes.results", {"q": q, "results": results})
        return Reply(f"Achei {n} nota{'s' if n > 1 else ''}. As principais: {names}.", data={"notes": results})

    @intent(
        "notes.read",
        patterns=[r"^(?:le|leia|ler|abre|abra|mostra|mostre|abrir)(?: a| minha| a minha)? nota(?: sobre| do| da| de| chamada)? (?P<q>.+)$"],
        examples=["lê a nota sobre RenovarTech"],
        priority=4,
    )
    async def read_intent(self, slots: dict) -> Reply:
        if (r := self._not_ready()) is not None:
            return r
        q = restore_accents(slots["q"], slots.get("_raw", ""))
        titles = await asyncio.to_thread(self.vault.titles)
        path = best_match(q, titles)
        if path is None:
            found = await asyncio.to_thread(self.vault.search, q, 1)
            path = found[0]["path"] if found else None
        if path is None:
            return Reply(f"Não achei nota sobre {q}.")
        text = plain(await asyncio.to_thread(self.vault.read, path))
        title = Path(path).stem
        await self.ctx.hub.broadcast("notes.open", {"path": path})
        if not text:
            return Reply(f"A nota {title} está vazia.")
        return Reply(f"{title}: {say_sentences(text)}", data={"note": {"path": path}})

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/notes", tags=["notas"])

        def need():
            if self.vault is None:
                raise HTTPException(400, "Vault não configurado")
            return self.vault

        @r.get("")
        async def status():
            return self.status()

        @r.get("/detect")
        async def detect():
            return await asyncio.to_thread(detect_vaults, Path.home())

        @r.post("/config")
        async def config(body: ConfigIn):
            d = Path(body.vault.strip().strip('"'))
            if not d.is_dir():
                raise HTTPException(400, "Pasta não encontrada")
            self._cfg_path.parent.mkdir(parents=True, exist_ok=True)
            self._cfg_path.write_text(json.dumps({"vault": str(d)}, ensure_ascii=False), encoding="utf-8")
            self._open_vault()
            self.total = -1
            await self.reindex()
            return self.status()

        @r.get("/search")
        async def search(q: str = ""):
            v = need()
            if not q.strip():
                return await asyncio.to_thread(v.recent, 20)
            return await asyncio.to_thread(v.search, q, 20)

        @r.get("/tree")
        async def tree():
            return await asyncio.to_thread(need().all_notes)

        @r.get("/file")
        async def read_file(path: str):
            v = need()
            try:
                content = await asyncio.to_thread(v.read, path)
            except (ValueError, FileNotFoundError) as e:
                raise HTTPException(404, "nota não encontrada") from e
            return {"path": path, "title": Path(path).stem, "content": content,
                    "backlinks": await asyncio.to_thread(v.backlinks, path),
                    "obsidian_url": self.obsidian_url(path)}

        @r.get("/resolve")
        async def resolve(link: str):
            p = await asyncio.to_thread(need().find_by_link, link)
            if p is None:
                raise HTTPException(404, "nota não existe")
            return {"path": p}

        @r.post("/capture")
        async def capture(body: CaptureIn):
            v = need()
            if not body.text.strip():
                raise HTTPException(400, "texto vazio")
            rel = await asyncio.to_thread(v.capture, body.text)
            await self.reindex()
            return {"path": rel}

        @r.get("/captures")
        async def captures():
            return await asyncio.to_thread(need().captures)

        return r
