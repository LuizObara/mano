"""Utilitários de linguagem PT-BR para o parser de comandos.

O reconhecimento de voz devolve números por extenso ("dez minutos"), então tudo passa por
`normalize`, que tira acentos/pontuação, remove a palavra de ativação e converte números.
"""

import re
import unicodedata

WAKE_PREFIXES = ("fala mano", "e ai mano", "ei mano", "oi mano", "ola mano", "o mano", "mano")

NUMBERS = {
    "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5,
    "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10, "onze": 11, "doze": 12, "treze": 13,
    "catorze": 14, "quatorze": 14, "quinze": 15, "dezesseis": 16, "dezasseis": 16, "dezessete": 17,
    "dezoito": 18, "dezenove": 19, "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50,
    "sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90, "cem": 100, "cento": 100,
    "duzentos": 200, "trezentos": 300,
}


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def _trailing_zeros(n: int) -> int:
    z = 0
    while n and n % 10 == 0:
        n //= 10
        z += 1
    return z


def words_to_numbers(text: str) -> str:
    """'vinte e cinco minutos' -> '25 minutos'; 'cento e vinte' -> '120'."""
    tokens = text.split()
    out: list[str] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok not in NUMBERS:
            out.append(tok)
            i += 1
            continue
        total = last = NUMBERS[tok]
        j = i + 1
        while j + 1 < len(tokens) and tokens[j] == "e" and tokens[j + 1] in NUMBERS:
            nxt = NUMBERS[tokens[j + 1]]
            if not (0 < nxt < 10 ** _trailing_zeros(last)):
                break
            total += nxt
            last = nxt
            j += 2
        out.append(str(total))
        i = j
    return " ".join(out)


def normalize(text: str) -> str:
    t = strip_accents(text.lower())
    t = re.sub(r"[^\w\s:]", " ", t)  # mantém ':' para horários tipo 8:30
    t = re.sub(r"\s+", " ", t).strip()
    for prefix in WAKE_PREFIXES:
        if t == prefix:
            return ""
        if t.startswith(prefix + " "):
            t = t[len(prefix) + 1 :]
            break
    return words_to_numbers(t)


_UNIT_S = {
    "h": 3600, "hr": 3600, "hora": 3600, "horas": 3600,
    "min": 60, "mins": 60, "minuto": 60, "minutos": 60,
    "s": 1, "seg": 1, "segs": 1, "segundo": 1, "segundos": 1,
}
_DURATION_RE = re.compile(
    r"\b(?P<n>\d+(?:[.,]\d+)?)\s*(?P<unit>horas?|hr|h|minutos?|mins?|segundos?|segs?|s)\b(?P<half>\s+e\s+mei[ao])?"
)
_HALF_HOUR_RE = re.compile(r"\bmeia\s+hora\b")


def parse_duration(text: str) -> tuple[int, str]:
    """Soma todas as durações do texto. Retorna (segundos, texto sem as durações).

    '1 hora e 30 minutos' -> 5400; '1 minuto e meio' -> 90; 'meia hora' -> 1800.
    """
    total = 0.0

    def take(m: re.Match) -> str:
        nonlocal total
        unit = _UNIT_S[m.group("unit")]
        value = float(m.group("n").replace(",", "."))
        if m.group("half"):
            value += 0.5
        total += value * unit
        return " "

    rest = _DURATION_RE.sub(take, text)

    def take_half(_m: re.Match) -> str:
        nonlocal total
        total += 1800
        return " "

    rest = _HALF_HOUR_RE.sub(take_half, rest)
    # "1 hora e 30 minutos" deixa um "e" solto entre as partes
    rest = re.sub(r"\s+", " ", rest).strip()
    return int(round(total)), rest


def say_duration(seconds: int) -> str:
    """5400 -> '1 hora e 30 minutos'."""
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    parts = []
    if h:
        parts.append(f"{h} hora" + ("s" if h > 1 else ""))
    if m:
        parts.append(f"{m} minuto" + ("s" if m > 1 else ""))
    if s or not parts:
        parts.append(f"{s} segundo" + ("s" if s != 1 else ""))
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " e " + parts[-1]
