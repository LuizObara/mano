from datetime import datetime

from ..intents.registry import Reply, Skill, intent

WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
          "setembro", "outubro", "novembro", "dezembro"]


def say_time(now: datetime) -> str:
    h, m = now.hour, now.minute
    verb = "É" if h in (0, 1) else "São"
    hours = "meia-noite" if h == 0 else ("1 hora" if h == 1 else f"{h} horas")
    if m == 0:
        return f"{verb} {hours}."
    return f"{verb} {hours} e {m} minuto{'s' if m > 1 else ''}."


def say_date(now: datetime) -> str:
    return f"Hoje é {WEEKDAYS[now.weekday()]}, {now.day} de {MONTHS[now.month - 1]} de {now.year}."


class ClockSkill(Skill):
    name = "relógio"
    description = "Hora e data"

    @intent(
        "clock.time",
        patterns=[r"\b(que|quais) horas?\b", r"^horas?$", r"\bhora certa\b", r"\bme (diz|fala) a hora\b"],
        examples=["que horas são?"],
    )
    async def time(self, slots: dict) -> Reply:
        now = datetime.now()
        return Reply(say_time(now), display=now.strftime("%H:%M"))

    @intent(
        "clock.date",
        patterns=[r"\b(que|qual) (dia|data)\b", r"\bdata de hoje\b", r"\bdia (e )?hoje\b"],
        examples=["que dia é hoje?"],
    )
    async def date(self, slots: dict) -> Reply:
        return Reply(say_date(datetime.now()))
