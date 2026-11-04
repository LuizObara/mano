from datetime import datetime

import pytest

from mano.intents.ptbr import normalize
from mano.intents.when import parse_when, say_clock, say_when

NOW = datetime(2026, 11, 4, 10, 0)  # quarta-feira, 10h


@pytest.mark.parametrize("text,expected,rest", [
    ("daqui a 20 minutos", datetime(2026, 11, 4, 10, 20), ""),
    ("ligar pro joao em 1 hora e meia", datetime(2026, 11, 4, 11, 30), "ligar pro joao"),
    ("as 8", datetime(2026, 11, 4, 20, 0), ""),  # 8h já passou → 20h
    ("as 11", datetime(2026, 11, 4, 11, 0), ""),
    ("as 8 e meia da manha", datetime(2026, 11, 5, 8, 30), ""),
    ("as 7 da noite", datetime(2026, 11, 4, 19, 0), ""),
    ("as 20:15", datetime(2026, 11, 4, 20, 15), ""),
    ("as 9h30", datetime(2026, 11, 4, 21, 30), ""),
    ("amanha as 3", datetime(2026, 11, 5, 15, 0), ""),
    ("amanha", datetime(2026, 11, 5, 9, 0), ""),
    ("pagar o boleto amanha as 10", datetime(2026, 11, 5, 10, 0), "pagar o boleto"),
    ("sexta as 18 horas", datetime(2026, 11, 6, 18, 0), ""),
    ("na quarta feira as 9", datetime(2026, 11, 11, 9, 0), ""),  # hoje é quarta, 9h já passou
    ("ao meio dia", datetime(2026, 11, 4, 12, 0), ""),
    ("depois de amanha a meia noite", datetime(2026, 11, 6, 0, 0), ""),
])
def test_parse_when(text, expected, rest):
    when, left = parse_when(text, NOW)
    assert when == expected
    assert left == rest


def test_with_spoken_numbers():
    when, rest = parse_when(normalize("tomar água às oito e meia da noite"), NOW)
    assert when == datetime(2026, 11, 4, 20, 30)
    assert rest == "tomar agua"


@pytest.mark.parametrize("text", ["comprar pao", "hoje as 8 da manha", "timer de 10"])
def test_no_time(text):
    assert parse_when(text, NOW)[0] is None


def test_say():
    assert say_clock(datetime(2026, 1, 1, 8, 30)) == "às 8 e meia"
    assert say_clock(datetime(2026, 1, 1, 1, 0)) == "à 1 hora"
    assert say_clock(datetime(2026, 1, 1, 12, 0)) == "ao meio-dia"
    assert say_when(datetime(2026, 11, 5, 20, 0), NOW) == "amanhã às 20 horas"
    assert say_when(datetime(2026, 11, 6, 9, 5), NOW) == "depois de amanhã às 9 e 5"
