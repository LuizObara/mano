import pytest

from mano.intents.ptbr import normalize, parse_duration, say_duration, words_to_numbers


@pytest.mark.parametrize("text,expected", [
    ("vinte e cinco minutos", "25 minutos"),
    ("cento e vinte segundos", "120 segundos"),
    ("dez", "10"),
    ("vinte e quinze", "20 e 15"),
    ("uma hora e meia", "1 hora e meia"),
])
def test_words_to_numbers(text, expected):
    assert words_to_numbers(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("Mano, que horas são?", "que horas sao"),
    ("Fala Mano coloca um timer de dez minutos", "coloca 1 timer de 10 minutos"),
    ("mano", ""),
    ("Manoel chegou", "manoel chegou"),
])
def test_normalize(text, expected):
    assert normalize(text) == expected


@pytest.mark.parametrize("text,seconds", [
    ("10 minutos", 600),
    ("1 hora e 30 minutos", 5400),
    ("1 minuto e meio", 90),
    ("meia hora", 1800),
    ("1 hora e meia", 5400),
    ("45 segundos", 45),
    ("2h", 7200),
    ("sem duracao", 0),
])
def test_parse_duration(text, seconds):
    assert parse_duration(text)[0] == seconds


def test_say_duration():
    assert say_duration(5400) == "1 hora e 30 minutos"
    assert say_duration(61) == "1 minuto e 1 segundo"
    assert say_duration(3600) == "1 hora"


@pytest.mark.parametrize("text,intent,slots", [
    ("que horas são?", "clock.time", {}),
    ("Mano, que dia é hoje", "clock.date", {}),
    ("timer de 10 minutos pro arroz", "timer.start", {"seconds": 600, "label": "arroz"}),
    ("fala mano coloca um timer de dez minutos para o feijão", "timer.start", {"seconds": 600, "label": "feijao"}),
    ("timer do macarrão de oito minutos", "timer.start", {"seconds": 480, "label": "macarrao"}),
    ("cria um temporizador de uma hora e meia", "timer.start", {"seconds": 5400, "label": None}),
    ("me avisa em meia hora", "timer.start", {"seconds": 1800, "label": None}),
    # como o Vosk transcreve de verdade
    ("fala mano coloca um time de dez minutos o arroz", "timer.start", {"seconds": 600, "label": "arroz"}),
    ("time de cinco minutos", "timer.start", {"seconds": 300, "label": None}),
    ("coloca um timer de 10 minutos", "timer.start", {"seconds": 600, "label": None}),
    ("cancela o timer do arroz", "timer.cancel", {}),
    ("cancela todos os timers", "timer.cancel", {}),
    ("quanto tempo falta?", "timer.list", {}),
    ("para", "alerts.dismiss", {}),
    ("para o alarme", "alerts.dismiss", {}),
    ("o que você sabe fazer", "help", {}),
])
def test_registry_routes(registry, text, intent, slots):
    m = registry.parse(text)
    assert m is not None, text
    assert m.intent.name == intent
    for k, v in slots.items():
        assert m.slots.get(k) == v


def test_unknown(registry):
    assert registry.parse("faz um bolo de chocolate") is None
    assert registry.parse("timer") is None  # sem duração não é timer.start
    assert registry.parse("meu time ganhou") is None
