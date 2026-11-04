"""Tabelas do Mano. Datas em horário local (app de um usuário só, numa máquina só)."""

from datetime import datetime

from sqlmodel import Field, SQLModel


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
