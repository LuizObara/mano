"""Tabelas do Mano. Datas em horário local (app de um usuário só, numa máquina só)."""

from datetime import date, datetime

from sqlmodel import Field, SQLModel, UniqueConstraint


def ms(dt: datetime | None) -> int | None:
    return int(dt.timestamp() * 1000) if dt else None


class Medication(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    dose: str = ""  # texto livre: "10 mg", "1 comprimido"
    times: str = "08:00"  # "08:00,20:00"
    days: str = "0123456"  # dias da semana (0 = segunda)
    stock: int | None = None  # comprimidos restantes (opcional)
    low_stock: int = 7  # avisa quando chegar nisso
    notes: str = ""
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)

    def time_list(self) -> list[tuple[int, int]]:
        out = []
        for t in self.times.split(","):
            t = t.strip()
            if t:
                h, m = t.split(":")
                out.append((int(h), int(m)))
        return sorted(out)

    def public(self) -> dict:
        return {
            "id": self.id, "name": self.name, "dose": self.dose,
            "times": [f"{h:02d}:{m:02d}" for h, m in self.time_list()],
            "days": [int(d) for d in self.days], "stock": self.stock, "low_stock": self.low_stock,
            "notes": self.notes, "active": self.active,
        }


class MedDose(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("medication_id", "scheduled_at"),)

    id: int | None = Field(default=None, primary_key=True)
    medication_id: int = Field(foreign_key="medication.id", index=True)
    scheduled_at: datetime = Field(index=True)
    status: str = "pending"  # pending | taken | skipped | missed
    taken_at: datetime | None = None
    reminders: int = 0
    next_reminder_at: datetime | None = None

    def public(self, med: Medication | None = None) -> dict:
        return {
            "id": self.id, "medication_id": self.medication_id,
            "name": med.name if med else None, "dose": med.dose if med else None,
            "scheduled_at": ms(self.scheduled_at), "status": self.status,
            "taken_at": ms(self.taken_at), "reminders": self.reminders,
        }


class Habit(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    icon: str = ""  # emoji opcional
    days: str = "0123456"
    position: int = 0
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)


class HabitCheck(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("habit_id", "day"),)

    id: int | None = Field(default=None, primary_key=True)
    habit_id: int = Field(foreign_key="habit.id", index=True)
    day: date = Field(index=True)
    at: datetime = Field(default_factory=datetime.now)


class Reminder(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    text: str
    due_at: datetime = Field(index=True)
    status: str = "pending"  # pending | fired | done | cancelled
    created_at: datetime = Field(default_factory=datetime.now)

    def public(self) -> dict:
        return {"id": self.id, "text": self.text, "due_at": ms(self.due_at), "status": self.status}


class Timer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    label: str | None = None
    duration_s: int
    created_at: datetime = Field(default_factory=datetime.now)
    ends_at: datetime
    status: str = "running"  # running | ringing | done | cancelled

    def public(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "duration_s": self.duration_s,
            "ends_at": int(self.ends_at.timestamp() * 1000),
            "status": self.status,
        }


class CommandLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    at: datetime = Field(default_factory=datetime.now)
    source: str  # text | voice | ui
    text: str
    intent: str | None = None
    reply: str = ""

    def public(self) -> dict:
        return {
            "id": self.id,
            "at": int(self.at.timestamp() * 1000),
            "source": self.source,
            "text": self.text,
            "intent": self.intent,
            "reply": self.reply,
        }
