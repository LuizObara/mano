"""Hábitos: checklist diário, sequência (streak) e histórico.

"Mano, fiz exercício" marca; "desmarca leitura" desfaz; "quais hábitos faltam?" lista.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..intents.ptbr import best_match
from ..intents.registry import Reply, Skill, intent
from ..models import Habit, HabitCheck

HISTORY_DAYS = 35


class HabitIn(BaseModel):
    name: str
    icon: str = ""
    days: list[int] = [0, 1, 2, 3, 4, 5, 6]


class ToggleIn(BaseModel):
    day: date | None = None
    done: bool | None = None  # None = inverte


def streak(scheduled: str, done_days: set[date], today: date) -> int:
    """Dias seguidos cumpridos, contando só os dias em que o hábito vale.
    Hoje ainda em aberto não quebra a sequência."""
    n = 0
    d = today
    if str(d.weekday()) in scheduled and d not in done_days:
        d -= timedelta(days=1)
    for _ in range(400):
        if str(d.weekday()) in scheduled:
            if d not in done_days:
                break
            n += 1
        d -= timedelta(days=1)
    return n


class HabitSkill(Skill):
    name = "hábitos"
    description = "Hábitos"

    # ---------- intenções ----------

    @intent(
        "habit.done",
        patterns=[r"^(ja )?(fiz|fizemos|terminei|completei|conclui|cumpri)( o| a| os| as| meu| minha)? (?P<what>.+)$",
                  r"^marca(r)? (o |a )?(?P<what>.+?) como (feito|feita|concluido|concluida)$"],
        examples=["fiz exercício", "marca leitura como feita"],
        priority=5,
    )
    async def done_intent(self, slots: dict) -> Reply:
        h = self._find(slots["what"])
        if h is None:
            return Reply(f"Não achei o hábito \"{slots['what']}\". Cadastre na aba Hábitos.")
        self.set_done(h.id, date.today(), True)
        await self._push()
        s = self._streak(h)
        extra = f" Sequência de {s} dias!" if s >= 2 else ""
        return Reply(f"Boa! Marquei {h.name}.{extra}")

    @intent(
        "habit.undo",
        patterns=[r"^desmarca(r)?( o| a)? (?P<what>.+)$", r"^nao fiz( o| a)? (?P<what>.+)$"],
        examples=["desmarca leitura"],
        priority=5,
    )
    async def undo_intent(self, slots: dict) -> Reply:
        h = self._find(slots["what"])
        if h is None:
            return Reply(f"Não achei o hábito \"{slots['what']}\".")
        self.set_done(h.id, date.today(), False)
        await self._push()
        return Reply(f"Desmarquei {h.name}.")

    @intent(
        "habit.pending",
        patterns=[r"\b(quais|que) habitos\b", r"\bhabitos (de hoje|faltam|que faltam)\b", r"\bo que falta (fazer )?hoje\b"],
        examples=["quais hábitos faltam?"],
        priority=5,
    )
    async def pending_intent(self, slots: dict) -> Reply:
        today = date.today()
        items = [h for h in self.habits() if str(today.weekday()) in h.days]
        if not items:
            return Reply("Você ainda não cadastrou hábitos.")
        done = self._done_on(today)
        missing = [h.name for h in items if h.id not in done]
        if not missing:
            return Reply("Todos os hábitos de hoje estão feitos. Mandou bem!")
        return Reply(f"Faltam {len(missing)} de {len(items)}: " + ", ".join(missing) + ".")

    # ---------- serviço ----------

    def habits(self) -> list[Habit]:
        with self.ctx.db.session() as s:
            return list(s.exec(select(Habit).where(Habit.active == True)  # noqa: E712
                               .order_by(Habit.position, Habit.id)))

    def _find(self, what: str) -> Habit | None:
        hs = self.habits()
        hid = best_match(what, {h.id: h.name for h in hs})
        return next((h for h in hs if h.id == hid), None)

    def _done_on(self, day: date) -> set[int]:
        with self.ctx.db.session() as s:
            return set(s.exec(select(HabitCheck.habit_id).where(HabitCheck.day == day)))

    def _checks(self, habit_id: int, since: date) -> set[date]:
        with self.ctx.db.session() as s:
            return set(s.exec(select(HabitCheck.day).where(HabitCheck.habit_id == habit_id, HabitCheck.day >= since)))

    def _streak(self, h: Habit) -> int:
        today = date.today()
        return streak(h.days, self._checks(h.id, today - timedelta(days=400)), today)

    def set_done(self, habit_id: int, day: date, done: bool) -> None:
        with self.ctx.db.session() as s:
            existing = s.exec(select(HabitCheck).where(HabitCheck.habit_id == habit_id, HabitCheck.day == day)).first()
            if done and not existing:
                s.add(HabitCheck(habit_id=habit_id, day=day, at=datetime.now()))
            elif not done and existing:
                s.delete(existing)
            s.commit()

    def snapshot(self) -> dict:
        today = date.today()
        since = today - timedelta(days=HISTORY_DAYS - 1)
        out = []
        for h in self.habits():
            checks = self._checks(h.id, today - timedelta(days=400))
            out.append({
                "id": h.id, "name": h.name, "icon": h.icon, "days": [int(d) for d in h.days],
                "today_scheduled": str(today.weekday()) in h.days,
                "done_today": today in checks,
                "streak": streak(h.days, checks, today),
                "history": sorted(d.isoformat() for d in checks if d >= since),
            })
        return {"habits": out, "habits_today": today.isoformat()}

    async def _push(self) -> None:
        await self.ctx.hub.broadcast("habits", self.snapshot())

    async def start(self) -> None:
        # vira o dia → telas atualizam o checklist
        self.ctx.scheduler.add_job(self._push, "cron", hour=0, minute=0, second=5, id="habits-midnight",
                                   replace_existing=True)

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/habits", tags=["hábitos"])

        @r.get("")
        async def list_habits():
            return self.snapshot()

        @r.post("")
        async def create(body: HabitIn):
            if not body.name.strip():
                raise HTTPException(400, "nome vazio")
            with self.ctx.db.session() as s:
                pos = len(self.habits())
                h = Habit(name=body.name.strip(), icon=body.icon.strip(), position=pos,
                          days="".join(str(d) for d in sorted(set(body.days)) if 0 <= d <= 6) or "0123456")
                s.add(h)
                s.commit()
            await self._push()
            return {"ok": True}

        @r.delete("/{habit_id}")
        async def remove(habit_id: int):
            with self.ctx.db.session() as s:
                h = s.get(Habit, habit_id)
                if h is None:
                    raise HTTPException(404)
                h.active = False
                s.add(h)
                s.commit()
            await self._push()
            return {"ok": True}

        @r.post("/{habit_id}/toggle")
        async def toggle(habit_id: int, body: ToggleIn):
            day = body.day or date.today()
            if day > date.today():
                raise HTTPException(400, "não dá para marcar o futuro")
            done = body.done if body.done is not None else habit_id not in self._done_on(day)
            self.set_done(habit_id, day, done)
            await self._push()
            return {"ok": True, "done": done}

        return r
