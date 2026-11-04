"""Datas e horas faladas em PT-BR → datetime.

Trabalha sobre o texto já normalizado (sem acento, números em dígitos):
  "daqui a 20 minutos", "em 1 hora e meia"            → relativo
  "as 8", "as 8 e meia", "as 20:15", "as 7 da noite"   → hora
  "amanha", "depois de amanha", "segunda", "hoje"      → dia
  "meio dia", "meia noite"
Sem dia explícito, vale a próxima ocorrência ("às 8" à 1h da manhã → 8h de hoje; às 9h → 20h de hoje).
"""

import re
from datetime import datetime, time, timedelta

from .ptbr import parse_duration

WEEKDAYS = {"segunda": 0, "terca": 1, "quarta": 2, "quinta": 3, "sexta": 4, "sabado": 5, "domingo": 6}
WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]

_UNIT = r"(?:horas?|hr|h|minutos?|mins?|segundos?|segs?|s)"
_REL_RE = re.compile(
    rf"\b(?:daqui a|daqui|em|dentro de)\s+(?P<dur>(?:\d+(?:[.,]\d+)?\s*{_UNIT}\b(?:\s+e\s+mei[ao])?(?:\s+e\s+(?=\d))?)+|meia hora)"
)
_DAY_RE = re.compile(
    r"\b(?P<day>depois de amanha|amanha|hoje|(?:na |no |nesta |neste |proxima |proximo )?"
    r"(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:\s*feira)?)\b"
)
_PERIOD = r"(?:\s+(?:horas?\s+)?(?P<period>da manha|de manha|da tarde|de tarde|da noite|de noite|da madrugada))?"
_MIN = r"(?:\s+e\s+(?P<m3>\d{1,2}|meia)(?:\s+minutos?)?)?"
_TIME_PREFIXED = re.compile(
    rf"\b(?:as|pelas|a|para as|pras|la pelas)\s+(?P<h>\d{{1,2}})(?::(?P<m>\d{{2}})|\s*h\s*(?P<m2>\d{{2}})?|\s+horas?)?{_MIN}{_PERIOD}\b"
)
_TIME_BARE = re.compile(
    rf"\b(?P<h>\d{{1,2}})(?::(?P<m>\d{{2}})|\s*h\s*(?P<m2>\d{{2}})?|\s+horas)\b{_MIN}{_PERIOD}"
)
_NOON_RE = re.compile(r"\b(?:ao |as |a )?(?P<which>meio dia|meia noite)\b")


def _strip(text: str, m: re.Match) -> str:
    return re.sub(r"\s+", " ", text[: m.start()] + " " + text[m.end() :]).strip()


def parse_when(text: str, now: datetime | None = None) -> tuple[datetime | None, str]:
    """Retorna (quando, texto sem a parte de tempo). `quando` é None se não achar tempo."""
    now = now or datetime.now()

    m = _REL_RE.search(text)
    if m:
        seconds, _ = parse_duration(m.group("dur"))
        if seconds > 0:
            return now + timedelta(seconds=seconds), _strip(text, m)

    rest = text
    day_offset: int | None = None
    said_today = False
    m = _DAY_RE.search(rest)
    if m:
        word = m.group("day")
        said_today = word == "hoje"
        if word == "hoje":
            day_offset = 0
        elif word == "amanha":
            day_offset = 1
        elif word == "depois de amanha":
            day_offset = 2
        else:
            wd = next(v for k, v in WEEKDAYS.items() if k in word)
            day_offset = (wd - now.weekday()) % 7
        rest = _strip(rest, m)

    hour = minute = None
    explicit_period = False
    m = _NOON_RE.search(rest)
    if m:
        hour, minute, explicit_period = (12 if m.group("which") == "meio dia" else 0), 0, True
        rest = _strip(rest, m)
    else:
        m = _TIME_PREFIXED.search(rest) or _TIME_BARE.search(rest)
        if m and int(m.group("h")) <= 23:
            hour = int(m.group("h"))
            mm = m.group("m") or m.group("m2") or m.group("m3")
            minute = 30 if mm == "meia" else int(mm or 0)
            period = m.group("period")
            if period:
                explicit_period = True
                if ("tarde" in period or "noite" in period) and hour < 12:
                    hour += 12
                elif "manha" in period and hour == 12:
                    hour = 0
            elif hour > 12 or hour == 0:
                explicit_period = True
            rest = _strip(rest, m)
            if minute > 59:
                return None, text

    if hour is None and day_offset is None:
        return None, text

    if hour is None:
        hour, minute, explicit_period = 9, 0, True  # "amanhã" sem hora → 9h

    if day_offset is not None:
        if not explicit_period and 1 <= hour <= 6:
            hour += 12  # "amanhã às 3" → 15h
        day = now.date() + timedelta(days=day_offset)
        when = datetime.combine(day, time(hour, minute))
        if when <= now and said_today:
            return None, text  # "hoje às 8" já passou
        if when <= now:  # dia da semana de hoje com hora passada → semana que vem
            when += timedelta(days=7)
        return when, rest

    candidates = [hour] if explicit_period or hour >= 12 else [hour, hour + 12]
    today = now.date()
    for h in candidates:
        when = datetime.combine(today, time(h, minute))
        if when > now:
            return when, rest
    return datetime.combine(today + timedelta(days=1), time(hour, minute)), rest


def say_clock(dt: datetime) -> str:
    """'às 8 e meia', 'à 1 hora', 'ao meio-dia', 'às 20 e 15'."""
    h, m = dt.hour, dt.minute
    if h == 12 and m == 0:
        return "ao meio-dia"
    if h == 0 and m == 0:
        return "à meia-noite"
    prefix = "à" if h == 1 else "às"
    if m == 0:
        return f"{prefix} {h} hora{'s' if h != 1 else ''}"
    if m == 30:
        return f"{prefix} {h} e meia"
    return f"{prefix} {h} e {m}"


def say_when(dt: datetime, now: datetime | None = None) -> str:
    now = now or datetime.now()
    days = (dt.date() - now.date()).days
    if days == 0:
        day = "hoje"
    elif days == 1:
        day = "amanhã"
    elif days == 2:
        day = "depois de amanhã"
    elif days < 7:
        day = WEEKDAY_NAMES[dt.weekday()]
    else:
        day = dt.strftime("%d/%m")
    return f"{day} {say_clock(dt)}"
