"""Timers com nome ("timer de 10 minutos pro arroz").

Os timers ficam no SQLite; ao reiniciar o Mano, os que ainda estão correndo são reagendados.
Quando acabam, ficam "tocando" (aviso na tela + voz repetida) até você dispensar.
"""

import re
from datetime import datetime, timedelta

from apscheduler.jobstores.base import JobLookupError
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from ..intents.ptbr import parse_duration, say_duration
from ..intents.registry import Reply, Skill, intent
from ..models import Timer

# "time"/"taimer": o modelo de voz em português não conhece a palavra "timer"
TIMER_WORD = r"(timer|timers|time|times|taimer|temporizador|temporizadores|cronometro|alarme|alarmes)"
_STOP = {"o", "a", "os", "as", "de", "do", "da", "por", "em", "com", "e", "1", "pra", "pro", "para", "no", "na"}
_LABEL_RE = re.compile(r"\b(?:pro|pra|para|do|da|dos|das|no|na)\s+(?:o |a |os |as )?(?P<label>.+)$")
_TRAILING_STOP = re.compile(r"(\s+(de|por|em|com|e|o|a))+$")
_LEADING_NOISE = re.compile(
    r"^(?:(?:por favor|coloca|coloque|cria|crie|inicia|inicie|faz|faca|marca|marque|liga|ligue|bota|"
    r"bote|poe|ponha|define|programa|me|um|uma|1|novo|nova|de|por|em|daqui a|daqui|"
    r"avisa|avise|chama|chame|lembra|lembre)\s+)*"
)


def _clean_label(text: str) -> str | None:
    m = _LABEL_RE.search(text)
    if m:
        label = _TRAILING_STOP.sub("", m.group("label")).strip()
        return label or None
    # a voz às vezes engole a preposição ("10 minutos o arroz")
    words = [w for w in text.split() if w not in _STOP]
    return " ".join(words) if 1 <= len(words) <= 3 else None


class TimerIn(BaseModel):
    seconds: int
    label: str | None = None


class ExtendIn(BaseModel):
    seconds: int = Field(gt=0, le=24 * 3600)


class TimerSkill(Skill):
    name = "timers"
    description = "Timers"

    # ---------- intenções ----------

    def match_start(self, text: str) -> dict | None:
        has_word = re.search(rf"\b{TIMER_WORD}\b", text)
        reminder = re.search(r"\bme (avisa|avise|chama|chame)\b.*\b(em|daqui)\b", text)
        if not (has_word or reminder):
            return None
        seconds, rest = parse_duration(text)
        if seconds <= 0:
            return None
        rest = re.sub(rf"\b{TIMER_WORD}\b", " ", rest)
        rest = re.sub(r"\s+", " ", rest).strip()
        rest = _LEADING_NOISE.sub("", rest)
        return {"seconds": seconds, "label": _clean_label(rest)}

    @intent(
        "timer.start",
        matcher="match_start",
        examples=["timer de 10 minutos pro arroz", "me avisa em meia hora"],
        priority=10,
    )
    async def start_intent(self, slots: dict) -> Reply:
        t = await self.create(slots["seconds"], slots.get("label"))
        if t.label:
            speech = f"Ok, timer de {say_duration(t.duration_s)} para {t.label}."
        else:
            speech = f"Ok, timer de {say_duration(t.duration_s)}."
        return Reply(speech, data={"timer": t.public()})

    async def dismiss_alerts(self) -> int:  # "para" (ver skills/alerts.py)
        return await self.dismiss_all()

    def snapshot(self) -> dict:
        return {"timers": [t.public() for t in self.active()]}

    @intent(
        "timer.cancel",
        patterns=[rf"\b(cancela|cancelar|cancele|para|parar|pare|desliga|apaga|apague|remove|tira|zera)"
                  rf"( o| os| a|(?P<all> todos os| todos))? {TIMER_WORD}\b(?P<rest>.*)$"],
        examples=["cancela o timer do arroz", "cancela todos os timers"],
        priority=20,
    )
    async def cancel_intent(self, slots: dict) -> Reply:
        rest = slots.get("rest", "").strip()
        label = _clean_label(rest) if rest else None
        everything = slots.get("all") is not None
        running = self.active()
        if not running:
            return Reply("Não tem nenhum timer ativo.")
        if label:
            targets = [t for t in running if t.label and label in t.label]
            if not targets:
                return Reply(f"Não achei timer de {label}.")
        elif everything or len(running) == 1:
            targets = running
        else:
            names = ", ".join(t.label or say_duration(t.duration_s) for t in running)
            return Reply(f"Tem {len(running)} timers: {names}. Qual deles? Ou diga \"cancela todos os timers\".")
        for t in targets:
            await self.cancel(t.id)
        if len(targets) == 1:
            t = targets[0]
            return Reply(f"Timer do {t.label} cancelado." if t.label else "Timer cancelado.")
        return Reply(f"{len(targets)} timers cancelados.")

    @intent(
        "timer.list",
        patterns=[r"\bquanto tempo (falta|resta|ainda)", r"\b(quais|que|meus) (sao )?(os )?timers\b",
                  rf"\btem (algum )?{TIMER_WORD}\b", r"^timers$"],
        examples=["quanto tempo falta?"],
        priority=15,
    )
    async def list_intent(self, slots: dict) -> Reply:
        running = [t for t in self.active() if t.status == "running"]
        if not running:
            return Reply("Nenhum timer correndo.")
        now = datetime.now()
        parts = []
        for t in running:
            left = max(0, int((t.ends_at - now).total_seconds()))
            parts.append(f"{('o ' + t.label) if t.label else 'um timer'} com {say_duration(left)}")
        return Reply("Tem " + "; ".join(parts) + ".")

    # ---------- serviço ----------

    def active(self) -> list[Timer]:
        with self.ctx.db.session() as s:
            return list(s.exec(select(Timer).where(Timer.status.in_(["running", "ringing"])).order_by(Timer.ends_at)))

    async def create(self, seconds: int, label: str | None = None) -> Timer:
        now = datetime.now()
        t = Timer(label=label, duration_s=seconds, created_at=now, ends_at=now + timedelta(seconds=seconds))
        with self.ctx.db.session() as s:
            s.add(t)
            s.commit()
            s.refresh(t)
        self._schedule(t)
        await self._push()
        return t

    def _schedule(self, t: Timer) -> None:
        self.ctx.scheduler.add_job(self._fire, "date", run_date=t.ends_at, args=[t.id],
                                   id=f"timer-{t.id}", replace_existing=True, misfire_grace_time=None)

    def _unschedule(self, timer_id: int) -> None:
        for job_id in (f"timer-{timer_id}", f"ring-{timer_id}"):
            try:
                self.ctx.scheduler.remove_job(job_id)
            except JobLookupError:
                pass

    def _set_status(self, timer_id: int, status: str) -> Timer | None:
        with self.ctx.db.session() as s:
            t = s.get(Timer, timer_id)
            if t is None:
                return None
            t.status = status
            s.add(t)
            s.commit()
            s.refresh(t)
            return t

    async def _fire(self, timer_id: int) -> None:
        t = self._set_status(timer_id, "ringing")
        if t is None:
            return
        await self._push()
        await self.ctx.hub.broadcast("timer.ringing", {"timer": t.public()})
        await self.ctx.alarms.ring("timer", self._ring_text(t), title=t.label or "Timer", notice=False)
        c = self.ctx.alarms.cfg("timer")
        # sem repetição, o job só confere o limite de tempo para desligar o contínuo
        self.ctx.scheduler.add_job(
            self._ring_again, "interval", seconds=c.every_s if c.repeat else 15, args=[timer_id],
            id=f"ring-{timer_id}", replace_existing=True,
        )

    async def _ring_again(self, timer_id: int) -> None:
        with self.ctx.db.session() as s:
            t = s.get(Timer, timer_id)
        if t is None or t.status != "ringing":
            self._unschedule(timer_id)
            return
        c = self.ctx.alarms.cfg("timer")
        if (datetime.now() - t.ends_at).total_seconds() > c.stop_after_s:
            await self.dismiss(timer_id)
            return
        if c.repeat:
            await self.ctx.alarms.ring("timer", self._ring_text(t), title=t.label or "Timer", notice=False)

    @staticmethod
    def _ring_text(t: Timer) -> str:
        return f"Ei! O timer do {t.label} terminou." if t.label else "Ei! Seu timer terminou."

    async def cancel(self, timer_id: int) -> Timer | None:
        self._unschedule(timer_id)
        t = self._set_status(timer_id, "cancelled")
        self._silence_if_idle()
        await self._push()
        return t

    async def dismiss(self, timer_id: int) -> Timer | None:
        self._unschedule(timer_id)
        t = self._set_status(timer_id, "done")
        self._silence_if_idle()
        await self._push()
        return t

    async def extend(self, timer_id: int, seconds: int) -> Timer | None:
        """Mais tempo: correndo, soma ao que falta; tocando, para de tocar e conta de novo esse tanto."""
        now = datetime.now()
        with self.ctx.db.session() as s:
            t = s.get(Timer, timer_id)
            if t is None:
                return None
            if t.status not in ("running", "ringing"):
                raise HTTPException(400, "esse timer já acabou")
            if t.status == "ringing":
                t.status = "running"
                t.ends_at = now + timedelta(seconds=seconds)
                t.duration_s = seconds
            else:
                t.ends_at = t.ends_at + timedelta(seconds=seconds)
                t.duration_s += seconds
            s.add(t)
            s.commit()
            s.refresh(t)
        self._unschedule(timer_id)
        self._schedule(t)
        self._silence_if_idle()
        await self._push()
        return t

    async def dismiss_all(self) -> int:
        ringing = [t for t in self.active() if t.status == "ringing"]
        for t in ringing:
            await self.dismiss(t.id)
        return len(ringing)

    def _silence_if_idle(self) -> None:
        if not any(t.status == "ringing" for t in self.active()):
            self.ctx.alarms.stop("timer")

    async def _push(self) -> None:
        await self.ctx.hub.broadcast("timers", {"timers": [t.public() for t in self.active()]})

    async def start(self) -> None:
        """Reagenda timers depois de um reinício."""
        now = datetime.now()
        for t in self.active():
            if t.status == "running" and t.ends_at > now:
                self._schedule(t)
            elif (now - t.ends_at).total_seconds() < self.ctx.alarms.cfg("timer").stop_after_s:
                await self._fire(t.id)
            else:
                self._set_status(t.id, "done")

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/timers", tags=["timers"])

        @r.get("")
        async def list_timers():
            return [t.public() for t in self.active()]

        @r.post("")
        async def create_timer(body: TimerIn):
            if body.seconds <= 0:
                raise HTTPException(400, "duração inválida")
            return (await self.create(body.seconds, body.label)).public()

        @r.post("/{timer_id}/cancel")
        async def cancel_timer(timer_id: int):
            t = await self.cancel(timer_id)
            if t is None:
                raise HTTPException(404)
            return t.public()

        @r.post("/{timer_id}/extend")
        async def extend_timer(timer_id: int, body: ExtendIn):
            t = await self.extend(timer_id, body.seconds)
            if t is None:
                raise HTTPException(404)
            return t.public()

        @r.post("/{timer_id}/dismiss")
        async def dismiss_timer(timer_id: int):
            t = await self.dismiss(timer_id)
            if t is None:
                raise HTTPException(404)
            return t.public()

        return r
