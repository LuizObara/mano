"""Google Tasks: lista padrão (sincroniza com o celular). Adicionar, listar e concluir por voz."""

from __future__ import annotations

import re
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...intents.ptbr import best_match, restore_accents
from ...intents.registry import Reply, intent
from ...intents.when import parse_when
from .account import GoogleFeature

API = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks"

_LEAD = re.compile(r"^(?:(?:de|para|pra|que|a|o)\s+)+")


class TaskIn(BaseModel):
    title: str
    due: date | None = None


class TasksSkill(GoogleFeature):
    name = "tarefas"
    description = "Tarefas (Google)"
    key = "tasks"
    poll_s = 300

    def empty(self) -> dict:
        return {"tasks": [], "error": None, "updated": None}

    async def fetch(self) -> dict:
        data = await self.account.request("GET", API, params={"showCompleted": "false", "maxResults": 100})
        tasks = []
        for t in data.get("items", []):
            if not t.get("title"):
                continue
            tasks.append({"id": t["id"], "title": t["title"], "notes": t.get("notes"),
                          "due": t["due"][:10] if t.get("due") else None, "position": t.get("position", "")})
        # com prazo primeiro (mais cedo antes), depois a ordem da lista
        tasks.sort(key=lambda t: (t["due"] is None, t["due"] or "", t["position"]))
        return {"tasks": tasks}

    def tasks(self) -> list[dict]:
        return self.data.get("tasks", [])

    async def add(self, title: str, due: date | None = None) -> dict:
        body = {"title": title}
        if due:
            body["due"] = f"{due.isoformat()}T00:00:00.000Z"  # a API só guarda a data
        t = await self.account.request("POST", API, json=body)
        await self.refresh()
        return t

    async def complete(self, task_id: str) -> None:
        await self.account.request("PATCH", f"{API}/{task_id}", json={"status": "completed"})
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

        @r.post("")
        async def add(body: TaskIn):
            if self.not_ready() is not None:
                raise HTTPException(400, "Conta Google não conectada")
            if not body.title.strip():
                raise HTTPException(400, "título vazio")
            t = await self.add(body.title.strip(), body.due)
            return {"id": t.get("id")}

        @r.post("/{task_id}/complete")
        async def complete(task_id: str):
            if self.not_ready() is not None:
                raise HTTPException(400, "Conta Google não conectada")
            await self.complete(task_id)
            return {"ok": True}

        return r

