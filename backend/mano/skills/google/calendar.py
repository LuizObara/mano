"""Google Agenda: compromissos dos próximos dias, aviso antes de começar e criação por voz."""

from __future__ import annotations

import asyncio
import re
from datetime import date, datetime, time, timedelta
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...intents.ptbr import restore_accents
from ...intents.registry import Reply, intent
from ...intents.when import WEEKDAY_NAMES, parse_when, say_clock, say_when
from .account import GoogleFeature, ms, to_local, to_rfc3339

API = "https://www.googleapis.com/calendar/v3"
DAYS_AHEAD = 7

_CREATE = re.compile(
    r"^(?P<verb>marca|marque|agenda|agende|cria|crie|coloca|coloque|bota|poe|adiciona)\s+"
    r"(?:(?:um|uma|1|o|a)\s+)?(?P<rest>.+)$"
)
_IN_AGENDA = re.compile(r"\s*\b(?:na|no|pra|para a|para o)\s+(?:minha\s+|meu\s+)?(?:agenda|calendario)\b\s*")
_KIND = re.compile(r"^(?:(?:um|uma|1)\s+)?(?:evento|compromisso)\s+(?:de\s+|com\s+)?")


class EventIn(BaseModel):
    title: str
    start: datetime
    minutes: int = 60


def day_label(d: date, today: date) -> str:
    delta = (d - today).days
    if delta == 0:
        return "hoje"
    if delta == 1:
        return "amanhã"
    return WEEKDAY_NAMES[d.weekday()]


class CalendarSkill(GoogleFeature):
    name = "agenda"
    description = "Agenda (Google)"
    key = "calendar"
    poll_s = 300

    def __init__(self, ctx):
        super().__init__(ctx)
        self._warned: set[str] = set()

    def empty(self) -> dict:
        return {"events": [], "error": None, "updated": None}

    # ---------- dados ----------

    async def fetch(self) -> dict:
        start = datetime.combine(date.today(), time())
        end = start + timedelta(days=DAYS_AHEAD + 1)
        cals = (await self.account.request("GET", f"{API}/users/me/calendarList",
                                           params={"minAccessRole": "reader"})).get("items", [])
        cals = [c for c in cals if c.get("selected", c.get("primary", False))]

        async def events_of(cal: dict) -> list[dict]:
            data = await self.account.request(
                "GET", f"{API}/calendars/{quote(cal['id'], safe='')}/events",
                params={"timeMin": to_rfc3339(start), "timeMax": to_rfc3339(end), "singleEvents": "true",
                        "orderBy": "startTime", "maxResults": 100},
            )
            out = []
            for e in data.get("items", []):
                if e.get("status") == "cancelled":
                    continue
                if any(a.get("self") and a.get("responseStatus") == "declined" for a in e.get("attendees", [])):
                    continue
                s, en = e.get("start", {}), e.get("end", {})
                all_day = "date" in s
                st = datetime.combine(date.fromisoformat(s["date"]), time()) if all_day else to_local(s["dateTime"])
                et = datetime.combine(date.fromisoformat(en["date"]), time()) if all_day else to_local(en["dateTime"])
                out.append({
                    "id": e["id"], "title": e.get("summary") or "(sem título)", "start": ms(st), "end": ms(et),
                    "all_day": all_day, "location": e.get("location"), "link": e.get("htmlLink"),
                    "calendar": cal.get("summaryOverride") or cal.get("summary"),
                    "color": cal.get("backgroundColor"), "meet": e.get("hangoutLink"),
                })
            return out

        lists = await asyncio.gather(*(events_of(c) for c in cals))
        events = sorted((e for lst in lists for e in lst), key=lambda e: (e["start"], not e["all_day"]))
        return {"events": events}

    def events(self) -> list[dict]:
        return self.data.get("events", [])

    def _on(self, d: date) -> list[dict]:
        lo = ms(datetime.combine(d, time()))
        hi = ms(datetime.combine(d + timedelta(days=1), time()))
        return [e for e in self.events() if e["start"] < hi and e["end"] > lo]

    # ---------- aviso antes do compromisso ----------

    async def heads_up(self, now: datetime | None = None) -> None:
        now = now or datetime.now()
        lead = timedelta(minutes=self.ctx.settings.event_heads_up_min)
        for e in self.events():
            if e["all_day"]:
                continue
            start = datetime.fromtimestamp(e["start"] / 1000)
            key = f"{e['id']}@{e['start']}"
            if now < start <= now + lead and key not in self._warned:
                self._warned.add(key)
                mins = max(1, round((start - now).total_seconds() / 60))
                where = f", em {e['location']}" if e.get("location") else ""
                await self.ctx.notify(f"Daqui a {mins} minutos: {e['title']}{where}.", title="Agenda", level="alert")

    async def start(self) -> None:
        await super().start()
        self.ctx.scheduler.add_job(self.heads_up, "interval", seconds=60, id="calendar-heads-up",
                                   replace_existing=True, max_instances=1)

    # ---------- intenções ----------

    def _say_events(self, evs: list[dict], today: date) -> str:
        parts = []
        for e in evs:
            st = datetime.fromtimestamp(e["start"] / 1000)
            parts.append(f"{e['title']}, o dia todo" if e["all_day"] else f"{e['title']} {say_clock(st)}")
        return "; ".join(parts)

    @intent(
        "calendar.day",
        patterns=[r"\b(minha )?agenda (de |pra |para )?(?P<day>hoje|amanha|da semana|semana)?\b",
                  r"\bo que (eu )?tenho (marcado )?(pra |para )?(?P<day>hoje|amanha)\b",
                  r"\b(meus )?(compromissos|reunioes|eventos) (de |pra |para )?(?P<day>hoje|amanha|da semana)\b",
                  r"\btenho (algum )?(compromisso|reuniao|evento) (?P<day>hoje|amanha)\b"],
        examples=["qual minha agenda de hoje?", "o que eu tenho amanhã?"],
        priority=6,
    )
    async def day_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        if self.data.get("updated") is None:
            await self.refresh()
        today = date.today()
        day = slots.get("day") or "hoje"
        if "semana" in day:
            evs = [e for e in self.events() if e["start"] >= ms(datetime.now())][:8]
            if not evs:
                return Reply("Nada na agenda nos próximos dias.")
            by_day: dict[str, list[dict]] = {}
            for e in evs:
                by_day.setdefault(day_label(datetime.fromtimestamp(e["start"] / 1000).date(), today), []).append(e)
            return Reply(" ".join(f"{d.capitalize()}: {self._say_events(lst, today)}." for d, lst in by_day.items()))
        d = today + timedelta(days=1 if day == "amanha" else 0)
        evs = self._on(d)
        label = "Amanhã" if day == "amanha" else "Hoje"
        if not evs:
            return Reply(f"{label} você não tem nada na agenda.")
        n = len(evs)
        return Reply(f"{label} você tem {n} compromisso{'s' if n > 1 else ''}: {self._say_events(evs, today)}.")

    @intent(
        "calendar.next",
        patterns=[r"\bproximo (compromisso|evento|reuniao)\b", r"\bqual (e )?(a )?minha proxima reuniao\b"],
        examples=["qual meu próximo compromisso?"],
        priority=7,
    )
    async def next_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        now = ms(datetime.now())
        nxt = next((e for e in self.events() if not e["all_day"] and e["start"] >= now), None)
        if nxt is None:
            return Reply("Você não tem compromissos nos próximos dias.")
        st = datetime.fromtimestamp(nxt["start"] / 1000)
        return Reply(f"Seu próximo compromisso é {nxt['title']}, {say_when(st)}.")

    def match_create(self, text: str) -> dict | None:
        m = _CREATE.match(text)
        if not m:
            return None
        rest = m.group("rest")
        in_agenda = bool(_IN_AGENDA.search(rest))
        has_kind = bool(re.match(r"^(?:(?:um|uma|1)\s+)?(?:evento|compromisso|reuniao|consulta)\b", rest))
        if not (in_agenda or has_kind or m.group("verb") in ("marca", "marque", "agenda", "agende")):
            return None
        rest = _IN_AGENDA.sub(" ", rest).strip()
        when, title = parse_when(rest)
        if when is None:
            return None
        title = _KIND.sub("", title).strip()
        if not title or re.search(r"\b(timer|alarme|como feit[oa])\b", title):
            return None
        return {"title": title, "when": when}

    @intent(
        "calendar.create",
        matcher="match_create",
        examples=["marca dentista sexta às 10", "coloca na agenda reunião com a Ana amanhã às 15"],
        priority=11,
    )
    async def create_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        title = restore_accents(slots["title"], slots.get("_raw", ""))
        title = title[:1].upper() + title[1:]
        await self.create(title, slots["when"])
        return Reply(f"Marquei {title} {say_when(slots['when'])}.")

    async def create(self, title: str, start: datetime, minutes: int = 60) -> dict:
        ev = await self.account.request("POST", f"{API}/calendars/primary/events", json={
            "summary": title,
            "start": {"dateTime": to_rfc3339(start)},
            "end": {"dateTime": to_rfc3339(start + timedelta(minutes=minutes))},
        })
        await self.refresh()
        return ev

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/calendar", tags=["agenda"])

        @r.get("")
        async def get_events():
            return self.data

        @r.post("/events")
        async def create(body: EventIn):
            if self.not_ready() is not None:
                raise HTTPException(400, "Conta Google não conectada")
            start = body.start.astimezone().replace(tzinfo=None) if body.start.tzinfo else body.start
            ev = await self.create(body.title.strip() or "(sem título)", start, max(5, body.minutes))
            return {"id": ev.get("id")}

        return r
