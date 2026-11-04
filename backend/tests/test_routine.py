"""Remédios, hábitos e lembretes."""

import time
from datetime import date, datetime, timedelta

import pytest
from sqlmodel import select

import mano.skills.meds as meds_mod
from mano.models import Medication, MedDose
from mano.skills.habits import streak

TODAY = date.today()


class Clock:
    """Relógio controlável para o módulo de remédios."""

    def __init__(self):
        self.now = datetime.combine(TODAY, datetime.min.time()).replace(hour=7)

    def at(self, h, m=0):
        self.now = self.now.replace(hour=h, minute=m)


@pytest.fixture
def clock(monkeypatch):
    c = Clock()

    class FakeDT(datetime):
        @classmethod
        def now(cls, tz=None):
            return c.now

    monkeypatch.setattr(meds_mod, "datetime", FakeDT)
    return c


def cmd(client, text):
    r = client.post("/api/command", json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


def meds_skill(app):
    return next(s for s in app.state.ctx.registry.skills if s.name == "remédios")


def add_med(client, app, **kw):
    body = {"name": "Ritalina", "dose": "10 mg", "times": ["08:00", "20:00"], "stock": 8, "low_stock": 7, **kw}
    r = client.post("/api/meds", json=body)
    assert r.status_code == 200, r.text
    # finge que foi cadastrado ontem, para gerar as doses de hoje inteiras
    db = app.state.ctx.db
    with db.session() as s:
        med = s.get(Medication, r.json()["id"])
        med.created_at = med.created_at - timedelta(days=1)
        s.add(med)
        s.commit()
    meds_skill(app).ensure_doses(TODAY)
    return r.json()


def doses(app):
    with app.state.ctx.db.session() as s:
        return list(s.exec(select(MedDose).order_by(MedDose.scheduled_at)))


def run(app, coro):
    """Roda uma corrotina no loop do app (o TestClient roda o loop em outra thread)."""
    import asyncio

    return asyncio.run_coroutine_threadsafe(coro, app.state.ctx.hub.loop).result(5)


# ---------- remédios ----------

def test_med_alert_repeats_until_taken(client, app, speaker, clock):
    add_med(client, app)
    skill = meds_skill(app)
    assert [d.scheduled_at.hour for d in doses(app)] == [8, 20]

    clock.at(8, 1)
    run(app, skill.tick())
    assert speaker.said[-1].startswith("Hora do remédio: Ritalina, 10 mg")
    n = len(speaker.said)

    clock.at(8, 3)
    run(app, skill.tick())
    assert len(speaker.said) == n  # ainda não deu 5 min

    clock.at(8, 7)
    run(app, skill.tick())
    assert "ainda não tomou Ritalina" in speaker.said[-1]

    out = cmd(client, "Mano, tomei o remédio")
    assert out["intent"] == "meds.taken"
    assert out["speech"] == "Anotado: Ritalina."
    d = doses(app)
    assert d[0].status == "taken" and d[1].status == "pending"
    # estoque: 8 → 7 = limite → avisa
    assert any("restam 7 de Ritalina" in s for s in speaker.said)

    clock.at(8, 20)
    n = len(speaker.said)
    run(app, skill.tick())
    assert len(speaker.said) == n  # não repete dose já tomada


def test_med_missed_after_give_up(client, app, speaker, clock):
    add_med(client, app, times=["08:00"])
    clock.at(10, 30)  # > 2 h depois, ex.: PC estava desligado
    run(app, meds_skill(app).tick())
    assert doses(app)[0].status == "missed"
    assert not any("Hora do remédio" in s for s in speaker.said)


def test_med_skip_and_status(client, app, clock):
    add_med(client, app, name="Sertralina", dose="50 mg", times=["09:00"])
    add_med(client, app, name="Ritalina", times=["08:00"])
    clock.at(9, 5)
    run(app, meds_skill(app).tick())
    out = cmd(client, "pula o remédio sertralina")
    assert "Sertralina" in out["speech"]
    out = cmd(client, "já tomei o remédio hoje?")
    assert out["intent"] == "meds.status"
    assert "Ritalina às 8 horas, pendente" in out["speech"]
    assert "Sertralina às 9 horas, pulado" in out["speech"]


def test_med_taken_early(client, app, clock):
    add_med(client, app, times=["08:00", "20:00"])
    clock.at(7, 40)
    out = cmd(client, "tomei")
    assert out["speech"] == "Anotado: Ritalina."
    assert [d.status for d in doses(app)] == ["taken", "pending"]
    clock.at(7, 45)
    assert cmd(client, "tomei")["speech"] == "Não tem remédio pendente agora."


def test_med_snooze_api(client, app, clock):
    add_med(client, app, times=["08:00"])
    clock.at(8, 1)
    run(app, meds_skill(app).tick())
    dose_id = doses(app)[0].id
    assert client.post(f"/api/meds/doses/{dose_id}/snooze").status_code == 200
    assert doses(app)[0].next_reminder_at == datetime.combine(TODAY, datetime.min.time()).replace(hour=8, minute=11)


def test_med_validation(client):
    r = client.post("/api/meds", json={"name": "X", "times": ["25:00"]})
    assert r.status_code == 422


# ---------- hábitos ----------

def test_streak():
    t = date(2026, 11, 4)  # quarta
    every = "0123456"
    done = {t - timedelta(days=i) for i in range(1, 4)}
    assert streak(every, done, t) == 3  # hoje em aberto não quebra
    assert streak(every, done | {t}, t) == 4
    assert streak(every, {t - timedelta(days=2)}, t) == 0
    weekdays = "01234"  # seg–sex: o fim de semana não quebra
    mon, fri = date(2026, 11, 2), date(2026, 10, 30)
    assert streak(weekdays, {mon, fri}, mon) == 2


def test_habits_by_voice(client):
    client.post("/api/habits", json={"name": "Exercício", "icon": "🏃"})
    client.post("/api/habits", json={"name": "Leitura"})
    out = cmd(client, "fiz exercicio")
    assert out["speech"].startswith("Boa! Marquei Exercício")
    out = cmd(client, "quais hábitos faltam?")
    assert out["speech"] == "Faltam 1 de 2: Leitura."
    cmd(client, "marca leitura como feita")
    assert "Todos os hábitos" in cmd(client, "quais hábitos faltam")["speech"]
    cmd(client, "desmarca exercicio")
    snap = client.get("/api/habits").json()["habits"]
    assert [h["done_today"] for h in snap] == [False, True]
    assert cmd(client, "fiz yoga")["speech"].startswith("Não achei")


# ---------- lembretes ----------

def test_reminder_parsing(client):
    out = cmd(client, "Mano, me lembra de pagar o boleto amanhã às 10")
    assert out["intent"] == "reminder.create"
    r = out["data"]["reminder"]
    assert r["text"] == "pagar o boleto"
    due = datetime.fromtimestamp(r["due_at"] / 1000)
    assert due == datetime.combine(TODAY + timedelta(days=1), datetime.min.time()).replace(hour=10)
    assert "amanhã às 10 horas" in out["speech"]

    out = cmd(client, "me lembra de tomar água")
    assert out["speech"].startswith("Pra quando?") and "tomar água" in out["speech"]

    out = cmd(client, "quais são meus lembretes")
    assert "pagar o boleto" in out["speech"]
    out = cmd(client, "cancela o lembrete do boleto")
    assert out["speech"] == "Lembrete cancelado."


def test_reminder_fires_and_ok_dismisses(client, speaker):
    out = cmd(client, "me lembra em 1 segundo de tirar o bolo do forno")
    assert out["intent"] == "reminder.create"
    deadline = time.time() + 5
    while time.time() < deadline and not any("Lembrete: tirar o bolo" in s for s in speaker.said):
        time.sleep(0.1)
    assert any("Lembrete: tirar o bolo do forno" in s for s in speaker.said)
    assert client.get("/api/reminders").json()["reminders"][0]["status"] == "fired"
    assert cmd(client, "ok")["speech"] == "Beleza."
    assert client.get("/api/reminders").json()["reminders"] == []


def test_me_avisa_still_timer(registry):
    assert registry.parse("me avisa em meia hora").intent.name == "timer.start"
