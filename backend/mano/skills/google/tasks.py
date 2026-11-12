"""Google Tasks: lista padrão (sincroniza com o celular). Adicionar, listar e concluir por voz."""

from __future__ import annotations

import asyncio
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...intents.ptbr import best_match, restore_accents
from ...intents.registry import Reply, intent
from ...intents.when import parse_when
from .account import GoogleFeature, to_local, to_rfc3339

API = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks"
DONE_DAYS = 84  # concluídas que vêm junto (mapa de 12 semanas da aba Calendário)

_LEAD = re.compile(r"^(?:(?:de|para|pra|que|a|o)\s+)+")


class TaskIn(BaseModel):
    title: str
    due: date | None = None
    notes: str | None = None


class TaskPatch(BaseModel):
    """Só os campos enviados mudam; `due: null` tira a data."""

    title: str | None = None
    due: date | None = None
    notes: str | None = None


def due_iso(d: date | None) -> str | None:
    return f"{d.isoformat()}T00:00:00.000Z" if d else None  # a API só guarda a data


class TasksSkill(GoogleFeature):
    name = "tarefas"
    description = "Tarefas (Google)"
    key = "tasks"
    poll_s = 300

    def empty(self) -> dict:
        return {"tasks": [], "done": [], "error": None, "updated": None}

    async def fetch(self) -> dict:
        since = datetime.combine(date.today() - timedelta(days=DONE_DAYS), datetime.min.time())
        open_, closed = await asyncio.gather(
            self.account.request("GET", API, params={"showCompleted": "false", "maxResults": 100}),
            self.account.request("GET", API, params={"showCompleted": "true", "showHidden": "true",
                                                     "completedMin": to_rfc3339(since), "maxResults": 100}),
        )
        tasks = []
        for t in open_.get("items", []):
            if not t.get("title"):
                continue
            tasks.append({"id": t["id"], "title": t["title"], "notes": t.get("notes"),
                          "due": t["due"][:10] if t.get("due") else None, "position": t.get("position", "")})
        # com prazo primeiro (mais cedo antes), depois a ordem da lista
        tasks.sort(key=lambda t: (t["due"] is None, t["due"] or "", t["position"]))
        done = []
        for t in closed.get("items", []):
            if t.get("status") != "completed" or not t.get("title") or not t.get("completed"):
                continue
            done.append({"id": t["id"], "title": t["title"], "due": t["due"][:10] if t.get("due") else None,
                         "completed": to_local(t["completed"]).date().isoformat()})
        done.sort(key=lambda t: t["completed"], reverse=True)
        return {"tasks": tasks, "done": done}

    def tasks(self) -> list[dict]:
        return self.data.get("tasks", [])

    async def add(self, title: str, due: date | None = None, notes: str | None = None) -> dict:
        body = {"title": title}
        if due:
            body["due"] = due_iso(due)
        if notes:
            body["notes"] = notes
        t = await self.account.request("POST", API, json=body)
        await self.refresh()
        return t

    async def complete(self, task_id: str) -> None:
        await self.account.request("PATCH", f"{API}/{task_id}", json={"status": "completed"})
        await self.refresh()

    async def reopen(self, task_id: str) -> None:
        await self.account.request("PATCH", f"{API}/{task_id}", json={"status": "needsAction", "completed": None})
        await self.refresh()

    async def update(self, task_id: str, changes: dict) -> None:
        body = {}
        if "title" in changes:
            body["title"] = (changes["title"] or "").strip() or "(sem título)"
        if "due" in changes:
            body["due"] = due_iso(changes["due"])
        if "notes" in changes:
            body["notes"] = changes["notes"] or ""
        if body:
            await self.account.request("PATCH", f"{API}/{task_id}", json=body)
        await self.refresh()

    async def delete(self, task_id: str) -> None:
        await self.account.request("DELETE", f"{API}/{task_id}")
        await self.refresh()

    # ---------- intenções ----------

    @intent(
        "tasks.add",
        patterns=[r"^(?:adiciona|adicione|anota|anote|cria|crie|coloca|coloque|poe|bota|inclui|inclua)"
                  r"(?: uma| a| 1)? (?:nova )?tarefa (?P<what>.+)$",
                  r"^(?:adiciona|adicione|coloca|coloque|poe|bota|inclui|anota) (?P<what>.+?) (?:na|nas|a) "
                  r"(?:minha |minhas )?(?:lista de )?tarefas$"],
        examples=["adiciona tarefa comprar pão", "coloca pagar internet nas tarefas"],
        priority=9,
    )
    async def add_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        what = _LEAD.sub("", slots["what"]).strip()
        when, rest = parse_when(what)
        if when is not None and rest:
            what = rest
        title = restore_accents(what, slots.get("_raw", ""))
        title = title[:1].upper() + title[1:]
        await self.add(title, when.date() if when else None)
        due = ""
        if when:
            delta = (when.date() - date.today()).days
            due = " para hoje" if delta == 0 else " para amanhã" if delta == 1 else f" para {when:%d/%m}"
        return Reply(f"Anotei a tarefa {title}{due}.")

    @intent(
        "tasks.list",
        patterns=[r"\b(quais|minhas|lista de|ver as|le as) (sao )?(as )?(minhas )?tarefas\b",
                  r"\bo que (eu )?tenho (pra|para|que) fazer\b", r"^tarefas$"],
        examples=["quais são minhas tarefas?"],
        priority=9,
    )
    async def list_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        await self.refresh()
        ts = self.tasks()
        if not ts:
            return Reply("Sua lista de tarefas está vazia.")
        today = date.today().isoformat()
        late = [t for t in ts if t["due"] and t["due"] < today]
        head = f"Você tem {len(ts)} tarefa{'s' if len(ts) > 1 else ''}"
        head += f", {len(late)} atrasada{'s' if len(late) > 1 else ''}" if late else ""
        return Reply(f"{head}: " + "; ".join(t["title"] for t in ts[:5]) + ("…" if len(ts) > 5 else "."))

    @intent(
        "tasks.done",
        patterns=[r"^(?:conclui|concluir|completa|completei|terminei|fiz|finalizei|marca|risca)(?: a)? tarefa "
                  r"(?P<what>.+?)(?: como (?:feita|concluida))?$",
                  r"^(?:risca|tira) (?P<what>.+?) da (?:lista de )?tarefas$"],
        examples=["conclui a tarefa comprar pão"],
        priority=9,
    )
    async def done_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        if self.data.get("updated") is None:
            await self.refresh()
        ts = self.tasks()
        tid = best_match(_LEAD.sub("", slots["what"]), {i: t["title"] for i, t in enumerate(ts)})
        if tid is None:
            return Reply(f"Não achei a tarefa {slots['what']}.")
        await self.complete(ts[tid]["id"])
        return Reply(f"Feito: {ts[tid]['title']}.")

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/tasks", tags=["tarefas"])

        @r.get("")
        async def get_tasks():
            return self.data

        def need():
            if self.not_ready() is not None:
                raise HTTPException(400, "Conta Google não conectada")

        @r.post("")
        async def add(body: TaskIn):
            need()
            if not body.title.strip():
                raise HTTPException(400, "título vazio")
            t = await self.add(body.title.strip(), body.due, body.notes)
            return {"id": t.get("id")}

        @r.patch("/{task_id}")
        async def update(task_id: str, body: TaskPatch):
            need()
            await self.update(task_id, body.model_dump(include=body.model_fields_set))
            return {"ok": True}

        @r.delete("/{task_id}")
        async def delete(task_id: str):
            need()
            await self.delete(task_id)
            return {"ok": True}

        @r.post("/{task_id}/complete")
        async def complete(task_id: str):
            need()
            await self.complete(task_id)
            return {"ok": True}

        @r.post("/{task_id}/reopen")
        async def reopen(task_id: str):
            need()
            await self.reopen(task_id)
            return {"ok": True}

        return r

