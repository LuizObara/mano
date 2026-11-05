"""Hábitos: três tipos, registros, métricas e cobranças que não enchem o saco.

- **check** (sim/não): "fiz exercício" marca o dia (tabela HabitCheck).
- **goal** (com meta): soma registros até a meta do dia ou da semana ("bebi 500 ml de água").
- **free** (livre): registra quanto fez, sem obrigação ("li 20 páginas").

Cobrança (opcional, por hábito): a cada X minutos numa janela de horário ou em horários fixos,
com bip, pop-up no visor, notificação do Windows e/ou fala. Para quando bate a meta, pula se você
registrou há pouco, "agora não" adia, "chega por hoje" silencia, e há uma pausa geral.
"""

from __future__ import annotations

import json
import logging
import math
import re
import struct
import sys
import wave
from collections import Counter
from datetime import date, datetime, time, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlmodel import select

from ..intents.ptbr import best_match, restore_accents
from ..intents.registry import Reply, Skill, intent
from ..models import Habit, HabitCheck, HabitLog, ms

log = logging.getLogger(__name__)

HISTORY_DAYS = 84  # 12 semanas: grades do Início e da aba Hábitos
KINDS = ("check", "goal", "free")
V2_COLUMNS = {  # coluna → DDL, para bancos criados antes dos tipos de hábito
    "kind": "TEXT NOT NULL DEFAULT 'check'",
    "unit": "TEXT NOT NULL DEFAULT ''",
    "goal": "FLOAT",
    "goal_period": "TEXT NOT NULL DEFAULT 'day'",
    "quick": "TEXT NOT NULL DEFAULT ''",
    "reminder": "TEXT NOT NULL DEFAULT ''",
}
VESSELS = {"copo": 250, "copos": 250, "garrafa": 500, "garrafas": 500, "xicara": 200, "xicaras": 200}


def default_reminder(kind: str = "check") -> dict:
    message = {
        "goal": "{nome}: faltam {faltam}. Que tal mais {fração}?",
        "free": "{nome} hoje? Registra quanto você fez.",
        "check": "Lembrete: {nome}.",
    }.get(kind, "Lembrete: {nome}.")
    return {
        "enabled": False, "mode": "interval", "every": 30, "start": "08:00", "end": "22:00", "times": ["19:00"],
        "message": message, "fraction": None,
        "beep": True, "popup": True, "toast": True, "speak": False, "dismiss_min": 3,
        "stop_on_goal": True, "skip_recent": True, "snooze_min": 15, "respect_pause": True,
    }


class ReminderIn(BaseModel):
    enabled: bool = False
    mode: str = "interval"
    every: int = 30
    start: str = "08:00"
    end: str = "22:00"
    times: list[str] = []
    message: str = ""
    fraction: float | None = None
    beep: bool = True
    popup: bool = True
    toast: bool = True
    speak: bool = False
    dismiss_min: int = 3
    stop_on_goal: bool = True
    skip_recent: bool = True
    snooze_min: int = 15
    respect_pause: bool = True


class HabitIn(BaseModel):
    name: str
    icon: str = ""
    days: list[int] = [0, 1, 2, 3, 4, 5, 6]
    kind: str = "check"
    unit: str = ""
    goal: float | None = None
    goal_period: str = "day"
    quick: list[float] = []
    reminder: ReminderIn | None = None


class ToggleIn(BaseModel):
    day: date | None = None
    done: bool | None = None  # None = inverte


class LogIn(BaseModel):
    amount: float
    day: date | None = None
    note: str = ""
    via: str = "visor"


class LogEdit(BaseModel):
    amount: float | None = None
    note: str | None = None


class PauseIn(BaseModel):
    minutes: int  # 0 = retomar; -1 = até amanhã


# ---------- funções puras (testáveis) ----------

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


def best_streak(scheduled: str, done_days: set[date], today: date, span: int = 400) -> int:
    best = cur = 0
    d = today - timedelta(days=span)
    while d <= today:
        if str(d.weekday()) in scheduled:
            if d in done_days:
                cur += 1
                best = max(best, cur)
            elif d != today:
                cur = 0
        d += timedelta(days=1)
    return best


def fmt_num(x: float) -> str:
    """1.5 → '1,5'; 2.0 → '2'."""
    s = f"{x:.1f}".rstrip("0").rstrip(".") if abs(x - round(x)) > 1e-9 else str(int(round(x)))
    return s.replace(".", ",")


def fmt_amount(x: float, unit: str) -> str:
    """Quantidade com unidade, em litros quando passa de 1000 ml."""
    if unit.lower() == "ml" and x >= 1000:
        return f"{fmt_num(round(x / 1000, 1))} L"
    if unit.lower() in ("l", "litro", "litros"):
        return f"{fmt_num(x)} L"
    return f"{fmt_num(x)} {unit}".strip()


def hm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def window_slots(rem: dict) -> int:
    """Quantos avisos cabem na janela (para sugerir a fração da meta)."""
    start, end = hm(rem.get("start", "08:00")), hm(rem.get("end", "22:00"))
    minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
    return max(1, minutes // max(5, int(rem.get("every", 30))))


def suggested_fraction(goal: float | None, unit: str, rem: dict) -> float | None:
    if not goal:
        return None
    raw = goal / window_slots(rem)
    step = 50 if unit.lower() == "ml" else 1
    return max(step, round(raw / step) * step)


def render_message(template: str, values: dict[str, str]) -> str:
    out = template
    for key, val in values.items():
        out = out.replace("{" + key + "}", val)
    out = out.replace("{fracao}", values.get("fração", ""))
    return re.sub(r"\s+", " ", out).strip()


def make_chime(path: Path) -> Path:
    """Bip curto de duas notas, mais suave que o da ativação de voz."""
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    rate = 16000
    frames = bytearray()
    for freq in (880, 1175):
        n = int(rate * 0.13)
        for i in range(n):
            env = min(1.0, i / 300) * min(1.0, (n - i) / 900)
            frames += struct.pack("<h", int(0.25 * 32767 * env * math.sin(2 * math.pi * freq * i / rate)))
        frames += b"\x00\x00" * int(rate * 0.04)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    return path


class HabitSkill(Skill):
    name = "hábitos"
    description = "Hábitos"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._cfg_path = ctx.settings.data_dir / "habits.json"
        self.paused_until: datetime | None = None
        self._started = datetime.now()
        self._last_sent: dict[int, datetime] = {}
        self._snooze: dict[int, datetime] = {}
        self._silenced: dict[int, date] = {}
        self._fixed_sent: set[tuple[int, date, str]] = set()
        self._stats: dict[tuple[int, date], Counter] = {}
        self._chime: Path | None = None

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
        if h.kind != "check":
            return Reply(f"{h.name} é por quantidade. Diga, por exemplo, \"registra 10 {h.unit or 'vezes'} de {h.name.lower()}\".")
        self.set_done(h.id, date.today(), True)
        self._answered(h.id)
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
        missing = []
        for h in items:
            amount = self.amount_on(h, today)
            if not self.is_done(h, amount):
                if h.kind == "goal" and h.goal and h.goal_period == "day":
                    missing.append(f"{h.name} (faltam {fmt_amount(h.goal - amount, h.unit)})")
                else:
                    missing.append(h.name)
        if not missing:
            return Reply("Todos os hábitos de hoje estão feitos. Mandou bem!")
        return Reply(f"Faltam {len(missing)} de {len(items)}: " + ", ".join(missing) + ".")

    @intent(
        "habit.log",
        matcher="match_log",
        examples=["bebi 500 ml de água", "bebi um copo de água", "li 20 páginas", "registra 10 minutos de meditação"],
        priority=6,
    )
    async def log_intent(self, slots: dict) -> Reply:
        h = self._find_for_log(slots.get("what"), slots.get("kind_hint"))
        if h is None:
            what = slots.get("what") or "esse hábito"
            return Reply(f"Não achei um hábito para \"{what}\". Cadastre na aba Hábitos.")
        amount = self._convert(slots["amount"], slots.get("unit", ""), h.unit)
        note = restore_accents(slots["note"], slots["_raw"]) if slots.get("note") else ""
        self.add_log(h, amount, date.today(), note=note, via="voz")
        await self._push()
        return Reply(self._progress_line(h, prefix=f"Anotei {fmt_amount(amount, h.unit)}."))

    def match_log(self, text: str) -> dict | None:
        m = re.match(r"^bebi (?P<amount>\d+)(?: (?P<dec>\d))? ?(?P<unit>ml|mililitros?|l|litros?)(?: (?:de |d )(?P<what>.+))?$", text)
        if m:
            amount = float(m["amount"] + ("." + m["dec"] if m["dec"] else ""))
            return {"amount": amount, "unit": "l" if m["unit"].startswith("l") else "ml",
                    "what": m["what"], "kind_hint": "agua"}
        m = re.match(r"^bebi meio litro(?: (?:de |d )(?P<what>.+))?$", text)
        if m:
            return {"amount": 500.0, "unit": "ml", "what": m["what"], "kind_hint": "agua"}
        m = re.match(r"^bebi (?P<n>\d+) (?P<vessel>copos?|garrafas?|xicaras?)(?: (?:de |d )(?P<what>.+))?$", text)
        if m:
            return {"amount": float(int(m["n"]) * VESSELS[m["vessel"]]), "unit": "ml", "what": m["what"], "kind_hint": "agua"}
        m = re.match(r"^li (?P<amount>\d+) (?:paginas?|pags?)(?: (?:de|do|da|dos|das) (?P<note>.+))?$", text)
        if m:
            return {"amount": float(m["amount"]), "unit": "paginas", "what": None, "note": m["note"], "kind_hint": "paginas"}
        m = re.match(r"^registra(?:r)? (?P<amount>\d+)(?: (?P<dec>\d))? (?P<unit>[a-z]+) (?:de|em|no|na) (?P<what>.+)$", text)
        if m:
            amount = float(m["amount"] + ("." + m["dec"] if m["dec"] else ""))
            return {"amount": amount, "unit": m["unit"], "what": m["what"], "kind_hint": None}
        return None

    @intent(
        "habit.progress",
        patterns=[r"^quant[oa]s? (?:de )?(?P<what>[a-z ]+?) (?:eu )?(?:ja )?(?:bebi|li|fiz)(?P<week> (?:essa|esta|nessa|nesta) semana)?(?: hoje)?$"],
        examples=["quanto de água eu bebi hoje?", "quantas páginas eu li essa semana?"],
        priority=7,
    )
    async def progress_intent(self, slots: dict) -> Reply:
        what = slots["what"]
        hint = "agua" if "agua" in what else "paginas" if "pagina" in what else None
        h = self._find_for_log(what, hint)
        if h is None or h.kind == "check":
            return Reply(f"Não achei um hábito por quantidade para \"{what}\".")
        if slots.get("week"):
            return Reply(f"Nesta semana: {fmt_amount(self.week_amount(h, date.today()), h.unit)} de {h.name.lower()}.")
        return Reply(self._progress_line(h, prefix="Hoje"))

    @intent(
        "habit.silence",
        patterns=[r"^(?:pausa|para|silencia|desliga) (?:os |as )?(?:lembretes?|cobrancas?|avisos?) d[aeo]s? (?P<what>.+?)(?: por hoje| hoje)?$"],
        examples=["pausa os lembretes de água"],
        priority=8,
    )
    async def silence_intent(self, slots: dict) -> Reply:
        h = self._find(slots["what"])
        if h is None:
            return Reply(f"Não achei o hábito \"{slots['what']}\".")
        self.silence_today(h.id)
        await self._push()
        return Reply(f"Certo, sem lembretes de {h.name.lower()} até amanhã.")

    @intent(
        "habit.pause",
        patterns=[r"^chega de (?:lembretes?|cobrancas?)(?P<today> por hoje)?$",
                  r"^(?:pausa|para|silencia) (?:os |as |todos os |todas as )?(?:lembretes?|cobrancas?)(?: dos habitos)?"
                  r"(?: por (?P<n>\d+) (?P<u>horas?|minutos?))?$"],
        examples=["chega de lembrete por hoje", "pausa as cobranças por 2 horas"],
        priority=8,
    )
    async def pause_intent(self, slots: dict) -> Reply:
        if slots.get("today"):
            minutes = -1
        elif slots.get("n"):
            minutes = int(slots["n"]) * (60 if slots["u"].startswith("hora") else 1)
        else:
            minutes = 60
        until = self.set_pause(minutes)
        await self._push()
        if minutes == -1:
            return Reply("Combinado, nenhum hábito te cobra até amanhã. Remédios continuam avisando.")
        return Reply(f"Pausei as cobranças até as {until:%H:%M}. Remédios continuam avisando.")

    # ---------- dados ----------

    def habits(self) -> list[Habit]:
        with self.ctx.db.session() as s:
            return list(s.exec(select(Habit).where(Habit.active == True)  # noqa: E712
                               .order_by(Habit.position, Habit.id)))

    def get(self, habit_id: int) -> Habit:
        with self.ctx.db.session() as s:
            h = s.get(Habit, habit_id)
        if h is None or not h.active:
            raise HTTPException(404, "hábito não encontrado")
        return h

    def reminder_of(self, h: Habit) -> dict:
        rem = default_reminder(h.kind)
        try:
            rem.update(json.loads(h.reminder or "{}"))
        except ValueError:
            pass
        return rem

    def quick_of(self, h: Habit) -> list[float]:
        return [float(x) for x in h.quick.split(",") if x.strip()] if h.quick else []

    def _find(self, what: str) -> Habit | None:
        hs = self.habits()
        hid = best_match(what, {h.id: h.name for h in hs})
        return next((h for h in hs if h.id == hid), None)

    def _find_for_log(self, what: str | None, hint: str | None) -> Habit | None:
        hs = [h for h in self.habits() if h.kind != "check"]
        if what:
            hid = best_match(what, {h.id: h.name for h in hs})
            found = next((h for h in hs if h.id == hid), None)
            if found:
                return found
        for h in hs:
            unit, name = h.unit.lower(), h.name.lower()
            if hint == "agua" and (unit in ("ml", "l") or "agua" in name or "água" in name):
                return h
            if hint == "paginas" and (unit.startswith("pág") or unit.startswith("pag") or "leitura" in name):
                return h
        return None

    @staticmethod
    def _convert(amount: float, said: str, unit: str) -> float:
        said, unit = said.lower(), unit.lower()
        if said == "l" and unit == "ml":
            return amount * 1000
        if said == "ml" and unit in ("l", "litro", "litros"):
            return amount / 1000
        return amount

    def _done_on(self, day: date) -> set[int]:
        with self.ctx.db.session() as s:
            return set(s.exec(select(HabitCheck.habit_id).where(HabitCheck.day == day)))

    def _checks(self, habit_id: int, since: date) -> set[date]:
        with self.ctx.db.session() as s:
            return set(s.exec(select(HabitCheck.day).where(HabitCheck.habit_id == habit_id, HabitCheck.day >= since)))

    def amounts(self, h: Habit, since: date) -> dict[date, float]:
        """Total por dia a partir de `since` (sim/não conta 1 no dia marcado)."""
        if h.kind == "check":
            return {d: 1.0 for d in self._checks(h.id, since)}
        out: dict[date, float] = {}
        with self.ctx.db.session() as s:
            for lg in s.exec(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.day >= since)):
                out[lg.day] = out.get(lg.day, 0.0) + lg.amount
        return out

    def amount_on(self, h: Habit, day: date) -> float:
        return self.amounts(h, day).get(day, 0.0)

    def week_amount(self, h: Habit, day: date) -> float:
        monday = day - timedelta(days=day.weekday())
        return sum(v for d, v in self.amounts(h, monday).items() if d <= day)

    def is_done(self, h: Habit, amount: float) -> bool:
        """O dia conta como cumprido? (meta semanal: basta ter registrado no dia)"""
        if h.kind == "goal" and h.goal and h.goal_period == "day":
            return amount >= h.goal - 1e-9
        return amount > 0

    def done_days(self, h: Habit, since: date) -> set[date]:
        return {d for d, v in self.amounts(h, since).items() if self.is_done(h, v)}

    def _streak(self, h: Habit) -> int:
        today = date.today()
        return streak(h.days, self.done_days(h, today - timedelta(days=400)), today)

    def logs_on(self, h: Habit, day: date) -> list[dict]:
        if h.kind == "check":
            with self.ctx.db.session() as s:
                c = s.exec(select(HabitCheck).where(HabitCheck.habit_id == h.id, HabitCheck.day == day)).first()
            return [{"id": None, "at": ms(c.at), "amount": 1, "note": "", "via": "visor"}] if c else []
        with self.ctx.db.session() as s:
            rows = s.exec(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.day == day).order_by(HabitLog.at))
            return [{"id": r.id, "at": ms(r.at), "amount": r.amount, "note": r.note, "via": r.via} for r in rows]

    def last_record_at(self, h: Habit, day: date) -> datetime | None:
        with self.ctx.db.session() as s:
            if h.kind == "check":
                c = s.exec(select(HabitCheck).where(HabitCheck.habit_id == h.id, HabitCheck.day == day)).first()
                return c.at if c else None
            r = s.exec(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.day == day)
                       .order_by(HabitLog.at.desc())).first()  # type: ignore[union-attr]
            return r.at if r else None

    def last_note(self, h: Habit) -> str:
        with self.ctx.db.session() as s:
            r = s.exec(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.note != "")
                       .order_by(HabitLog.at.desc())).first()  # type: ignore[union-attr]
            return r.note if r else ""

    def set_done(self, habit_id: int, day: date, done: bool) -> None:
        with self.ctx.db.session() as s:
            existing = s.exec(select(HabitCheck).where(HabitCheck.habit_id == habit_id, HabitCheck.day == day)).first()
            if done and not existing:
                s.add(HabitCheck(habit_id=habit_id, day=day, at=datetime.now()))
            elif not done and existing:
                s.delete(existing)
            s.commit()

    def add_log(self, h: Habit, amount: float, day: date, note: str = "", via: str = "visor") -> HabitLog:
        at = datetime.now() if day == date.today() else datetime.combine(day, time(12, 0))
        with self.ctx.db.session() as s:
            lg = HabitLog(habit_id=h.id, day=day, amount=amount, at=at, note=note.strip(), via=via)
            s.add(lg)
            s.commit()
            s.refresh(lg)
        if via == "lembrete":
            self._answered(h.id)
        return lg

    def _progress_line(self, h: Habit, prefix: str) -> str:
        today = date.today()
        amount = self.amount_on(h, today)
        if h.kind == "goal" and h.goal and h.goal_period == "day":
            if amount >= h.goal:
                return f"{prefix} {fmt_amount(amount, h.unit)} de {h.name.lower()}: meta batida!"
            return f"{prefix} {fmt_amount(amount, h.unit)} de {fmt_amount(h.goal, h.unit)}. Faltam {fmt_amount(h.goal - amount, h.unit)}."
        week = self.week_amount(h, today)
        line = f"{prefix} {fmt_amount(amount, h.unit)}"
        if h.kind == "goal" and h.goal:
            return f"{line}; na semana, {fmt_amount(week, h.unit)} de {fmt_amount(h.goal, h.unit)}."
        return f"{line}; na semana, {fmt_amount(week, h.unit)}."

    # ---------- cobrança ----------

    def _load_cfg(self) -> dict:
        try:
            return json.loads(self._cfg_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def set_pause(self, minutes: int, now: datetime | None = None) -> datetime | None:
        now = now or datetime.now()
        if minutes == 0:
            self.paused_until = None
        elif minutes < 0:
            self.paused_until = datetime.combine(now.date() + timedelta(days=1), time(0, 0))
        else:
            self.paused_until = now + timedelta(minutes=minutes)
        self._cfg_path.parent.mkdir(parents=True, exist_ok=True)
        cfg = {**self._load_cfg(), "paused_until": self.paused_until.isoformat() if self.paused_until else None}
        self._cfg_path.write_text(json.dumps(cfg), encoding="utf-8")
        return self.paused_until

    def silence_today(self, habit_id: int, day: date | None = None) -> None:
        self._silenced[habit_id] = day or date.today()
        self._count(habit_id, "silenced")

    def snooze(self, h: Habit, now: datetime | None = None) -> datetime:
        now = now or datetime.now()
        until = now + timedelta(minutes=int(self.reminder_of(h).get("snooze_min", 15)))
        self._snooze[h.id] = until
        self._count(h.id, "later")
        return until

    def _count(self, habit_id: int, key: str, day: date | None = None) -> None:
        self._stats.setdefault((habit_id, day or date.today()), Counter())[key] += 1

    def _answered(self, habit_id: int) -> None:
        last = self._last_sent.get(habit_id)
        if last and datetime.now() - last < timedelta(minutes=30):
            self._count(habit_id, "answered")

    def _values(self, h: Habit, rem: dict, day: date) -> dict[str, str]:
        amount = self.amount_on(h, day) if h.goal_period == "day" else self.week_amount(h, day)
        goal = h.goal or 0
        fraction = rem.get("fraction") or suggested_fraction(h.goal, h.unit, rem) or 0
        return {
            "nome": h.name,
            "feito": fmt_amount(amount, h.unit),
            "meta": fmt_amount(goal, h.unit) if goal else "",
            "faltam": fmt_amount(max(0.0, goal - amount), h.unit) if goal else "",
            "fração": fmt_amount(fraction, h.unit) if fraction else "",
        }

    def next_reminder(self, h: Habit, now: datetime) -> datetime | None:
        """Quando o próximo aviso deve tocar (ignora pausa e silêncio; só para mostrar no visor)."""
        rem = self.reminder_of(h)
        if not rem["enabled"] or str(now.weekday()) not in h.days:
            return None
        today = now.date()
        if h.id in self._snooze and self._snooze[h.id] > now:
            return self._snooze[h.id]
        if rem["mode"] == "fixed":
            for t in sorted(rem.get("times") or []):
                dt = datetime.combine(today, hm(t))
                if dt > now:
                    return dt
            return None
        start, end = datetime.combine(today, hm(rem["start"])), datetime.combine(today, hm(rem["end"]))
        every = timedelta(minutes=max(5, int(rem["every"])))
        if now < start:
            return start
        nxt = start + every * (int((now - start) / every) + 1)
        return nxt if nxt <= end else None

    async def tick(self, now: datetime | None = None) -> list[dict]:
        """Roda a cada 30 s: decide quem avisar agora. Retorna os avisos enviados (para os testes)."""
        now = now or datetime.now()
        today = now.date()
        sent = []
        if self.paused_until and now >= self.paused_until:
            self.paused_until = None
        for h in self.habits():
            rem = self.reminder_of(h)
            if not rem["enabled"] or str(today.weekday()) not in h.days:
                continue
            if rem.get("respect_pause", True) and self.paused_until and now < self.paused_until:
                continue
            if self._silenced.get(h.id) == today:
                continue
            amount = self.amount_on(h, today)
            done = self.is_done(h, amount)
            if done and (h.kind != "goal" or rem.get("stop_on_goal", True)):
                continue
            if h.id in self._snooze:
                if now < self._snooze[h.id]:
                    continue
                del self._snooze[h.id]
                sent.append(await self.remind(h, rem, now))
                continue
            if rem["mode"] == "fixed":
                for t in rem.get("times") or []:
                    at = datetime.combine(today, hm(t))
                    key = (h.id, today, t)
                    if at <= now < at + timedelta(minutes=10) and key not in self._fixed_sent:
                        self._fixed_sent.add(key)
                        sent.append(await self.remind(h, rem, now))
                continue
            start, end = datetime.combine(today, hm(rem["start"])), datetime.combine(today, hm(rem["end"]))
            if not (start <= now <= end):
                continue
            every = timedelta(minutes=max(5, int(rem["every"])))
            # avisos alinhados à janela (8:00, 8:30, 9:00...); horários que passaram antes de o Mano
            # subir (ou de o hábito ser salvo) não tocam atrasados
            slot = start + every * int((now - start) / every)
            if slot <= self._last_sent.get(h.id, self._started):
                continue
            last_rec = self.last_record_at(h, today)
            if rem.get("skip_recent", True) and last_rec and now - last_rec < every:
                self._last_sent[h.id] = now
                self._count(h.id, "skipped", today)
                continue
            sent.append(await self.remind(h, rem, now))
        return sent

    async def remind(self, h: Habit, rem: dict, now: datetime) -> dict:
        self._last_sent[h.id] = now
        self._count(h.id, "sent", now.date())
        values = self._values(h, rem, now.date())
        text_ = render_message(rem.get("message") or default_reminder(h.kind)["message"], values)
        quick = self.quick_of(h)
        fraction = rem.get("fraction") or suggested_fraction(h.goal, h.unit, rem)
        if h.kind == "goal" and fraction:
            quick = [fraction] + [q for q in quick if q != fraction]
        payload = {
            "habit_id": h.id, "name": h.name, "icon": h.icon, "kind": h.kind, "unit": h.unit,
            "message": text_, "quick": quick[:2], "at": ms(now),
            "expires_at": ms(now + timedelta(minutes=max(1, int(rem.get("dismiss_min", 3))))),
            "amount": self.amount_on(h, now.date()), "goal": h.goal if h.goal_period == "day" else None,
        }
        if rem.get("popup", True):
            await self.ctx.hub.broadcast("habit.remind", payload)
        if rem.get("beep", True):
            self._beep()
        if rem.get("toast", True) and self.ctx.settings.toast_enabled:
            from ..notify import toast

            toast(h.name, text_, silent=True)
        if rem.get("speak"):
            self.ctx.speaker.say(text_)
        log.info("lembrete de hábito: %s", text_)
        return payload

    def _beep(self) -> None:
        if not self.ctx.settings.sound_enabled or sys.platform != "win32":
            return
        try:
            import winsound

            self._chime = self._chime or make_chime(self.ctx.settings.data_dir / "sounds" / "habit.wav")
            winsound.PlaySound(str(self._chime), winsound.SND_FILENAME | winsound.SND_ASYNC)
        except Exception:
            log.exception("não consegui tocar o bip")

    # ---------- snapshot ----------

    def public(self, h: Habit, today: date, now: datetime) -> dict:
        since = today - timedelta(days=HISTORY_DAYS - 1)
        long_done = self.done_days(h, today - timedelta(days=400))
        amounts = self.amounts(h, since)
        rem = self.reminder_of(h)
        nxt = self.next_reminder(h, now)
        stats = self._stats.get((h.id, today), Counter())
        return {
            "id": h.id, "name": h.name, "icon": h.icon, "days": [int(d) for d in h.days],
            "kind": h.kind, "unit": h.unit, "goal": h.goal, "goal_period": h.goal_period,
            "quick": self.quick_of(h), "reminder": rem,
            "suggested_fraction": suggested_fraction(h.goal, h.unit, rem) if h.kind == "goal" else None,
            "today_scheduled": str(today.weekday()) in h.days,
            "done_today": today in long_done,
            "today_amount": amounts.get(today, 0.0),
            "week_amount": self.week_amount(h, today),
            "today_logs": self.logs_on(h, today),
            "last_note": self.last_note(h) if h.kind != "check" else "",
            "streak": streak(h.days, long_done, today),
            "best_streak": best_streak(h.days, long_done, today),
            "history": sorted(d.isoformat() for d in long_done if d >= since),
            "amounts": {d.isoformat(): v for d, v in sorted(amounts.items())},
            "next_reminder": ms(nxt) if nxt and not self._silenced.get(h.id) == today else None,
            "silenced_today": self._silenced.get(h.id) == today,
            "remind_today": {k: stats.get(k, 0) for k in ("sent", "answered", "skipped", "later")},
        }

    def snapshot(self) -> dict:
        today, now = date.today(), datetime.now()
        paused = self.paused_until if self.paused_until and self.paused_until > now else None
        return {"habits": [self.public(h, today, now) for h in self.habits()], "habits_today": today.isoformat(),
                "habits_paused_until": ms(paused)}

    async def _push(self) -> None:
        await self.ctx.hub.broadcast("habits", self.snapshot())

    def _migrate(self) -> None:
        with self.ctx.db.engine.begin() as c:
            cols = {row[1] for row in c.execute(text("PRAGMA table_info(habit)"))}
            for col, ddl in V2_COLUMNS.items():
                if col not in cols:
                    c.execute(text(f"ALTER TABLE habit ADD COLUMN {col} {ddl}"))

    async def start(self) -> None:
        self._migrate()
        until = self._load_cfg().get("paused_until")
        if until:
            self.paused_until = datetime.fromisoformat(until)
        # vira o dia → telas atualizam o checklist
        self.ctx.scheduler.add_job(self._push, "cron", hour=0, minute=0, second=5, id="habits-midnight",
                                   replace_existing=True)
        self.ctx.scheduler.add_job(self._tick_and_push, "interval", seconds=30, id="habits-remind",
                                   replace_existing=True)

    async def _tick_and_push(self) -> None:
        if await self.tick():
            await self._push()

    # ---------- API ----------

    def _save(self, habit_id: int | None, body: HabitIn) -> Habit:
        if not body.name.strip():
            raise HTTPException(400, "nome vazio")
        if body.kind not in KINDS:
            raise HTTPException(400, "tipo inválido")
        rem = default_reminder(body.kind)
        if body.reminder is not None:
            rem.update(body.reminder.model_dump())
            if not rem["message"].strip():
                rem["message"] = default_reminder(body.kind)["message"]
            for t in [rem["start"], rem["end"], *rem["times"]]:
                try:
                    hm(t)
                except ValueError as e:
                    raise HTTPException(400, f"horário inválido: {t}") from e
        with self.ctx.db.session() as s:
            h = s.get(Habit, habit_id) if habit_id else Habit(name=body.name, position=len(self.habits()))
            if h is None:
                raise HTTPException(404)
            h.name, h.icon = body.name.strip(), body.icon.strip()
            h.days = "".join(str(d) for d in sorted(set(body.days)) if 0 <= d <= 6) or "0123456"
            h.kind, h.unit = body.kind, body.unit.strip() if body.kind != "check" else ""
            h.goal = body.goal if body.kind == "goal" and body.goal and body.goal > 0 else None
            h.goal_period = body.goal_period if body.goal_period in ("day", "week") else "day"
            h.quick = ",".join(fmt_num(q).replace(",", ".") for q in body.quick if q > 0) if body.kind != "check" else ""
            h.reminder = json.dumps(rem, ensure_ascii=False)
            s.add(h)
            s.commit()
            s.refresh(h)
        self._last_sent[h.id] = datetime.now()  # acabou de configurar: o próximo aviso é no próximo horário
        return h

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/habits", tags=["hábitos"])

        @r.get("")
        async def list_habits():
            return self.snapshot()

        @r.post("")
        async def create(body: HabitIn):
            h = self._save(None, body)
            await self._push()
            return {"ok": True, "id": h.id}

        @r.put("/{habit_id}")
        async def update(habit_id: int, body: HabitIn):
            self.get(habit_id)
            self._save(habit_id, body)
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
            if done and day == date.today():
                self._answered(habit_id)
            await self._push()
            return {"ok": True, "done": done}

        @r.post("/{habit_id}/log")
        async def add(habit_id: int, body: LogIn):
            h = self.get(habit_id)
            day = body.day or date.today()
            if day > date.today():
                raise HTTPException(400, "não dá para registrar no futuro")
            if h.kind == "check":
                self.set_done(h.id, day, body.amount > 0)
            elif body.amount <= 0:
                raise HTTPException(400, "quantidade precisa ser positiva")
            else:
                self.add_log(h, body.amount, day, note=body.note, via=body.via)
            await self._push()
            return {"ok": True}

        @r.get("/{habit_id}/logs")
        async def day_logs(habit_id: int, day: date):
            return self.logs_on(self.get(habit_id), day)

        @r.patch("/logs/{log_id}")
        async def edit_log(log_id: int, body: LogEdit):
            with self.ctx.db.session() as s:
                lg = s.get(HabitLog, log_id)
                if lg is None:
                    raise HTTPException(404)
                if body.amount is not None:
                    if body.amount <= 0:
                        raise HTTPException(400, "quantidade precisa ser positiva")
                    lg.amount = body.amount
                if body.note is not None:
                    lg.note = body.note.strip()
                s.add(lg)
                s.commit()
            await self._push()
            return {"ok": True}

        @r.delete("/logs/{log_id}")
        async def delete_log(log_id: int):
            with self.ctx.db.session() as s:
                lg = s.get(HabitLog, log_id)
                if lg is None:
                    raise HTTPException(404)
                s.delete(lg)
                s.commit()
            await self._push()
            return {"ok": True}

        @r.post("/{habit_id}/snooze")
        async def snooze(habit_id: int):
            until = self.snooze(self.get(habit_id))
            await self._push()
            return {"ok": True, "until": ms(until)}

        @r.post("/{habit_id}/silence")
        async def silence(habit_id: int):
            self.silence_today(self.get(habit_id).id)
            await self._push()
            return {"ok": True}

        @r.post("/{habit_id}/test")
        async def test_reminder(habit_id: int):
            h = self.get(habit_id)
            return await self.remind(h, self.reminder_of(h), datetime.now())

        @r.post("/pause")
        async def pause(body: PauseIn):
            until = self.set_pause(body.minutes)
            await self._push()
            return {"ok": True, "until": ms(until)}

        return r
