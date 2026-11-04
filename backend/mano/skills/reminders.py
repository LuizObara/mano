"""Lembretes avulsos: "me lembra de pagar o boleto amanhã às 10"."""

import re
from datetime import datetime

from apscheduler.jobstores.base import JobLookupError
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..intents.ptbr import best_match, restore_accents
from ..intents.registry import Reply, Skill, intent
from ..intents.when import parse_when, say_when
from ..models import Reminder

_ASK = re.compile(r"^(?:me )?(?:lembra|lembre|lembrar|avisa|avise|recorda)(?: me)?\b(?P<rest>.*)$")
_LEAD = re.compile(r"^(?:(?:de|que|da|do|para|pra|pro|o|a)\s+)+")


class ReminderIn(BaseModel):
    text: str
    due_at: datetime


class ReminderSkill(Skill):
    name = "lembretes"
    description = "Lembretes"

    # ---------- intenções ----------

    def match_create(self, text: str) -> dict | None:
        m = _ASK.match(text)
        if not m:
            return None
        when, rest = parse_when(m.group("rest").strip())
        what = _LEAD.sub("", rest).strip()
        if not what:
            return None  # "me avisa em 10 minutos" → é timer
        return {"what": what, "when": when}

    @intent(
        "reminder.create",
        matcher="match_create",
        examples=["me lembra de pagar o boleto amanhã às 10", "me lembra em 20 minutos de tirar o bolo"],
        priority=12,
    )
    async def create_intent(self, slots: dict) -> Reply:
        what = restore_accents(slots["what"], slots.get("_raw", ""))
        when = slots.get("when")
        if when is None:
            return Reply(f"Pra quando? Diga por exemplo: me lembra de {what} amanhã às 9.")
        r = await self.create(what, when)
        return Reply(f"Combinado: {say_when(r.due_at)} eu te lembro de {what}.", data={"reminder": r.public()})

    @intent(
        "reminder.list",
        patterns=[r"\b(quais|meus|tem) (sao )?(os )?(meus )?lembretes\b", r"^lembretes$"],
        examples=["quais são meus lembretes?"],
        priority=12,
    )
    async def list_intent(self, slots: dict) -> Reply:
        items = [r for r in self.active() if r.status == "pending"]
        if not items:
            return Reply("Nenhum lembrete marcado.")
        parts = [f"{r.text}, {say_when(r.due_at)}" for r in items[:5]]
        more = f" e mais {len(items) - 5}" if len(items) > 5 else ""
        return Reply(f"Você tem {len(items)} lembrete{'s' if len(items) > 1 else ''}: " + "; ".join(parts) + more + ".")

    @intent(
        "reminder.cancel",
        patterns=[r"\b(cancela|cancelar|apaga|apague|remove|esquece|tira)( o| os| todos os)? lembretes?\b(?P<rest>.*)$"],
        examples=["cancela o lembrete do boleto"],
        priority=21,
    )
    async def cancel_intent(self, slots: dict) -> Reply:
        items = [r for r in self.active() if r.status == "pending"]
        if not items:
            return Reply("Nenhum lembrete para cancelar.")
        rest = _LEAD.sub("", slots.get("rest", "").strip())
        if rest:
            rid = best_match(rest, {r.id: r.text for r in items})
            if rid is None:
                return Reply(f"Não achei lembrete de {rest}.")
            targets = [r for r in items if r.id == rid]
        elif len(items) == 1 or "todos" in slots.get("_raw", "").lower():
            targets = items
        else:
            return Reply(f"Tem {len(items)} lembretes. Qual? Ex.: cancela o lembrete do {items[0].text}.")
        for r in targets:
            await self.set_status(r.id, "cancelled")
        return Reply("Lembrete cancelado." if len(targets) == 1 else f"{len(targets)} lembretes cancelados.")

    # ---------- serviço ----------

    def active(self) -> list[Reminder]:
        with self.ctx.db.session() as s:
            return list(s.exec(select(Reminder).where(Reminder.status.in_(["pending", "fired"]))
                               .order_by(Reminder.due_at)))

    async def create(self, text: str, due_at: datetime) -> Reminder:
        r = Reminder(text=text, due_at=due_at)
        with self.ctx.db.session() as s:
            s.add(r)
            s.commit()
            s.refresh(r)
        self._schedule(r)
        await self._push()
        return r

    def _schedule(self, r: Reminder) -> None:
        self.ctx.scheduler.add_job(self._fire, "date", run_date=r.due_at, args=[r.id], id=f"reminder-{r.id}",
                                   replace_existing=True, misfire_grace_time=None)

    async def set_status(self, rid: int, status: str) -> Reminder | None:
        try:
            self.ctx.scheduler.remove_job(f"reminder-{rid}")
        except JobLookupError:
            pass
        with self.ctx.db.session() as s:
            r = s.get(Reminder, rid)
            if r is None:
                return None
            r.status = status
            s.add(r)
            s.commit()
            s.refresh(r)
        await self._push()
        return r

    async def _fire(self, rid: int, late: bool = False) -> None:
        r = await self.set_status(rid, "fired")
        if r is None:
            return
        prefix = "Lembrete atrasado" if late else "Lembrete"
        await self.ctx.notify(f"{prefix}: {r.text}.", title="Lembrete", level="alert")

    async def dismiss_alerts(self) -> int:
        fired = [r for r in self.active() if r.status == "fired"]
        for r in fired:
            await self.set_status(r.id, "done")
        return len(fired)

    def snapshot(self) -> dict:
        return {"reminders": [r.public() for r in self.active()]}

    async def _push(self) -> None:
        await self.ctx.hub.broadcast("reminders", self.snapshot())

    async def start(self) -> None:
        now = datetime.now()
        for r in self.active():
            if r.status != "pending":
                continue
            if r.due_at > now:
                self._schedule(r)
            else:  # venceu com o Mano desligado: avisa agora
                await self._fire(r.id, late=True)

    # ---------- API ----------

    def router(self) -> APIRouter:
        rt = APIRouter(prefix="/api/reminders", tags=["lembretes"])

        @rt.get("")
        async def list_reminders():
            return self.snapshot()

        @rt.post("")
        async def create(body: ReminderIn):
            due = body.due_at.replace(tzinfo=None) if body.due_at.tzinfo is None else \
                body.due_at.astimezone().replace(tzinfo=None)
            if not body.text.strip() or due <= datetime.now():
                raise HTTPException(400, "texto vazio ou horário no passado")
            return (await self.create(body.text.strip(), due)).public()

        @rt.post("/{rid}/{action}")
        async def action(rid: int, action: str):
            status = {"cancel": "cancelled", "done": "done"}.get(action)
            if status is None:
                raise HTTPException(400, "ação inválida")
            r = await self.set_status(rid, status)
            if r is None:
                raise HTTPException(404)
            return r.public()

        return rt
