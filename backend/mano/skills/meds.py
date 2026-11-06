"""Remédios: cadastro, doses do dia e alerta que repete até você confirmar.

Cada horário vira uma linha `MedDose` por dia. Um "tick" a cada 20 s olha as doses vencidas:
avisa conforme o alarme "Remédio" (som, voz, tela, notificação), repete até "tomei" e,
depois do limite do alarme, marca como não tomada. Como tudo está no banco, reiniciar o
Mano não perde nada; doses que venceram com o PC desligado viram "não tomada" sem alarde.
"""

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from sqlmodel import select

from ..intents.ptbr import best_match
from ..intents.registry import Reply, Skill, intent
from ..intents.when import say_clock
from ..models import Medication, MedDose

EARLY_WINDOW = timedelta(minutes=45)  # "tomei" vale para dose que vence logo


class MedIn(BaseModel):
    name: str
    dose: str = ""
    times: list[str]
    days: list[int] = [0, 1, 2, 3, 4, 5, 6]
    stock: int | None = None
    low_stock: int = 7
    notes: str = ""

    @field_validator("times")
    @classmethod
    def check_times(cls, v: list[str]) -> list[str]:
        out = []
        for t in v:
            h, m = t.strip().split(":")
            if not (0 <= int(h) <= 23 and 0 <= int(m) <= 59):
                raise ValueError(f"horário inválido: {t}")
            out.append(f"{int(h):02d}:{int(m):02d}")
        if not out:
            raise ValueError("informe ao menos um horário")
        return sorted(set(out))

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("nome vazio")
        return v.strip()


class MedSkill(Skill):
    name = "remédios"
    description = "Remédios"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._day: date | None = None

    # ---------- intenções ----------

    @intent(
        "meds.status",
        patterns=[r"^(ja )?tomei (o |os |a |as |meu |meus |minha |minhas )?(remedio|remedios|medicamentos?)? ?hoje$",
                  r"\b(quais|que|qual|meus) (sao )?(os )?(meus )?(proximo )?remedios?\b",
                  r"\bremedios? de hoje\b", r"\bproximo remedio\b"],
        examples=["quais remédios de hoje?", "já tomei o remédio hoje?"],
        priority=26,
    )
    async def status_intent(self, slots: dict) -> Reply:
        doses = self.today()
        if not doses:
            return Reply("Você não tem remédios marcados para hoje.")
        parts = []
        for d, med in doses:
            when = say_clock(d.scheduled_at)
            label = {"taken": "tomado", "skipped": "pulado", "missed": "não tomado"}.get(d.status)
            if label is None:
                label = "pendente" if d.scheduled_at <= datetime.now() else "ainda vai"
            parts.append(f"{med.name} {when}, {label}")
        return Reply("Hoje: " + "; ".join(parts) + ".")

    @intent(
        "meds.taken",
        patterns=[r"^(ja )?(tomei|tomado|tomamos)\b(?P<rest>.*)$", r"^(pode )?marcar? (como )?tomado\b(?P<rest>.*)$"],
        examples=["tomei", "tomei o remédio"],
        priority=25,
    )
    async def taken_intent(self, slots: dict) -> Reply:
        targets = self._due_for(slots.get("rest", ""), early=True)
        if not targets:
            return Reply("Não tem remédio pendente agora.")
        for d, _ in targets:
            await self.take(d.id)
        names = ", ".join(m.name for _, m in targets)
        return Reply(f"Anotado: {names}.")

    @intent(
        "meds.skip",
        patterns=[r"^(pula|pular|pule|pulei)( o| a| esse| essa| essa dose| esse)? ?(remedio|dose)?\b(?P<rest>.*)$",
                  r"\bnao vou tomar\b(?P<rest>.*)$"],
        examples=["pula o remédio"],
        priority=25,
    )
    async def skip_intent(self, slots: dict) -> Reply:
        targets = self._due_for(slots.get("rest", ""), early=False)
        if not targets:
            return Reply("Não tem remédio pendente agora.")
        for d, _ in targets:
            await self.skip(d.id)
        return Reply("Ok, marquei como pulado: " + ", ".join(m.name for _, m in targets) + ".")

    @intent(
        "meds.snooze",
        patterns=[r"^(adia|adiar|depois|mais tarde|me lembra depois|daqui a pouco)( o remedio)?$"],
        examples=["adia (quando o alerta de remédio está tocando)"],
        priority=25,
    )
    async def snooze_intent(self, slots: dict) -> Reply:
        targets = self._due_for("", early=False)
        if not targets:
            return Reply("Não tem remédio pendente agora.")
        for d, _ in targets:
            await self.snooze(d.id)
        return Reply(f"Te lembro de novo em {self.ctx.alarms.cfg('med').snooze_min} minutos.")

    def _due_for(self, rest: str, *, early: bool) -> list[tuple[MedDose, Medication]]:
        now = datetime.now()
        limit = now + (EARLY_WINDOW if early else timedelta(0))
        pending = [(d, m) for d, m in self.today() if d.status == "pending" and d.scheduled_at <= limit]
        rest = rest.strip()
        if rest and pending:
            mid = best_match(rest, {m.id: m.name for _, m in pending})
            if mid is not None:
                return [(d, m) for d, m in pending if m.id == mid]
        overdue = [(d, m) for d, m in pending if d.scheduled_at <= now]
        if overdue:
            return overdue
        # adiantado: só a próxima dose, não todas do dia
        return pending[:1] if early else []

    # ---------- doses ----------

    def meds(self, include_inactive: bool = False) -> list[Medication]:
        with self.ctx.db.session() as s:
            q = select(Medication).order_by(Medication.name)
            if not include_inactive:
                q = q.where(Medication.active == True)  # noqa: E712
            return list(s.exec(q))

    def ensure_doses(self, day: date, med_id: int | None = None) -> None:
        with self.ctx.db.session() as s:
            q = select(Medication).where(Medication.active == True)  # noqa: E712
            if med_id is not None:
                q = q.where(Medication.id == med_id)
            for med in s.exec(q):
                if str(day.weekday()) not in med.days:
                    continue
                for h, m in med.time_list():
                    at = datetime.combine(day, time(h, m))
                    if at < med.created_at.replace(second=0, microsecond=0):
                        continue  # cadastrado depois desse horário
                    exists = s.exec(select(MedDose).where(MedDose.medication_id == med.id,
                                                          MedDose.scheduled_at == at)).first()
                    if not exists:
                        s.add(MedDose(medication_id=med.id, scheduled_at=at))
            s.commit()

    def today(self, day: date | None = None) -> list[tuple[MedDose, Medication]]:
        day = day or date.today()
        start = datetime.combine(day, time())
        with self.ctx.db.session() as s:
            rows = s.exec(
                select(MedDose, Medication).join(Medication)
                .where(MedDose.scheduled_at >= start, MedDose.scheduled_at < start + timedelta(days=1))
                .order_by(MedDose.scheduled_at)
            )
            return [(d, m) for d, m in rows]

    def _update(self, dose_id: int, **fields) -> tuple[MedDose, Medication] | None:
        with self.ctx.db.session() as s:
            d = s.get(MedDose, dose_id)
            if d is None:
                return None
            for k, v in fields.items():
                setattr(d, k, v)
            s.add(d)
            s.commit()
            s.refresh(d)
            return d, s.get(Medication, d.medication_id)

    async def take(self, dose_id: int) -> MedDose | None:
        res = self._update(dose_id, status="taken", taken_at=datetime.now(), next_reminder_at=None)
        if res is None:
            return None
        self.ctx.alarms.stop("med")
        dose, med = res
        if med.stock is not None:
            with self.ctx.db.session() as s:
                m = s.get(Medication, med.id)
                m.stock = max(0, (m.stock or 0) - 1)
                s.add(m)
                s.commit()
                left = m.stock
            if left in (med.low_stock, 0):  # avisa ao cruzar o limite e ao zerar
                await self.ctx.notify(
                    f"Atenção: restam {left} de {med.name}. Hora de providenciar a receita.",
                    speak=True, title="Estoque de remédio", level="warn",
                )
        await self._push()
        return dose

    async def skip(self, dose_id: int) -> MedDose | None:
        res = self._update(dose_id, status="skipped", next_reminder_at=None)
        self.ctx.alarms.stop("med")
        await self._push()
        return res[0] if res else None

    async def snooze(self, dose_id: int) -> MedDose | None:
        later = datetime.now() + timedelta(minutes=self.ctx.alarms.cfg("med").snooze_min)
        res = self._update(dose_id, next_reminder_at=later)
        self.ctx.alarms.stop("med")
        await self._push()
        return res[0] if res else None

    async def tick(self, now: datetime | None = None) -> None:
        now = now or datetime.now()
        if self._day != now.date():
            self._day = now.date()
            self.ensure_doses(self._day)
        c = self.ctx.alarms.cfg("med")
        give_up = timedelta(seconds=c.stop_after_s)
        alert: list[tuple[MedDose, Medication]] = []
        changed = missed = False
        with self.ctx.db.session() as s:
            rows = s.exec(select(MedDose, Medication).join(Medication)
                          .where(MedDose.status == "pending", MedDose.scheduled_at <= now))
            for d, med in rows:
                if now - d.scheduled_at > give_up:
                    d.status = "missed"
                    d.next_reminder_at = None
                    changed = missed = True
                elif d.next_reminder_at is None or d.next_reminder_at <= now:
                    d.reminders += 1
                    # sem repetição: o próximo "aviso" cai depois do limite, quando a dose vira não tomada
                    d.next_reminder_at = (now + timedelta(seconds=c.every_s) if c.repeat
                                          else d.scheduled_at + give_up + timedelta(seconds=1))
                    alert.append((d, med))
                    changed = True
                s.add(d)
            s.commit()
        if missed and not alert:
            self.ctx.alarms.stop("med")
        if alert:
            first = all(d.reminders == 1 for d, _ in alert)
            names = " e ".join(f"{m.name}{', ' + m.dose if m.dose else ''}" for _, m in alert)
            text = (f"Hora do remédio: {names}. Diga \"tomei\" quando tomar." if first
                    else f"Lembrete: você ainda não tomou {names}.")
            await self.ctx.alarms.ring("med", text, title="Hora do remédio", now=now)
            await self.ctx.hub.broadcast("meds.due", {"doses": [d.public(m) for d, m in alert]})
        if changed:
            await self._push()

    async def _push(self) -> None:
        await self.ctx.hub.broadcast("meds", self.snapshot())

    def snapshot(self) -> dict:
        return {
            "meds": [m.public() for m in self.meds()],
            "doses": [d.public(m) for d, m in self.today()],
            "med_snooze_min": self.ctx.alarms.cfg("med").snooze_min,
        }

    def history(self, days: int) -> list[dict]:
        start = datetime.combine(date.today() - timedelta(days=days - 1), time())
        with self.ctx.db.session() as s:
            rows = s.exec(select(MedDose, Medication).join(Medication)
                          .where(MedDose.scheduled_at >= start).order_by(MedDose.scheduled_at))
            return [d.public(m) for d, m in rows]

    async def start(self) -> None:
        await self.tick()
        self.ctx.scheduler.add_job(self.tick, "interval", seconds=20, id="meds-tick", replace_existing=True)

    # ---------- API ----------

    def _save(self, med_id: int | None, body: MedIn) -> Medication:
        with self.ctx.db.session() as s:
            med = s.get(Medication, med_id) if med_id else Medication(name=body.name)
            if med is None:
                raise HTTPException(404)
            med.name, med.dose, med.notes = body.name, body.dose, body.notes
            med.times = ",".join(body.times)
            med.days = "".join(str(d) for d in sorted(set(body.days)) if 0 <= d <= 6) or "0123456"
            med.stock, med.low_stock = body.stock, body.low_stock
            s.add(med)
            s.commit()
            s.refresh(med)
            # horários mudaram: refaz as doses pendentes de hoje que ainda não venceram
            now = datetime.now()
            for d in s.exec(select(MedDose).where(MedDose.medication_id == med.id, MedDose.status == "pending",
                                                  MedDose.scheduled_at > now)):
                s.delete(d)
            s.commit()
        self.ensure_doses(date.today(), med.id)
        return med

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/meds", tags=["remédios"])

        @r.get("")
        async def list_meds():
            return self.snapshot()

        @r.post("")
        async def create(body: MedIn):
            med = self._save(None, body)
            await self._push()
            return med.public()

        @r.put("/{med_id}")
        async def update(med_id: int, body: MedIn):
            med = self._save(med_id, body)
            await self._push()
            return med.public()

        @r.delete("/{med_id}")
        async def remove(med_id: int):
            with self.ctx.db.session() as s:
                med = s.get(Medication, med_id)
                if med is None:
                    raise HTTPException(404)
                med.active = False  # mantém o histórico
                s.add(med)
                for d in s.exec(select(MedDose).where(MedDose.medication_id == med_id,
                                                      MedDose.status == "pending")):
                    s.delete(d)
                s.commit()
            await self._push()
            return {"ok": True}

        @r.get("/history")
        async def history(days: int = 14):
            return self.history(max(1, min(days, 90)))

        @r.post("/doses/{dose_id}/{action}")
        async def dose_action(dose_id: int, action: str):
            fn = {"take": self.take, "skip": self.skip, "snooze": self.snooze}.get(action)
            if fn is None:
                raise HTTPException(400, "ação inválida")
            d = await fn(dose_id)
            if d is None:
                raise HTTPException(404)
            return d.public()

        return r
