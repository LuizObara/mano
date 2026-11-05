"""Hábitos v2: tipos, registros, métricas, cobranças e voz."""

import asyncio
import sqlite3
from datetime import date, datetime, timedelta

import pytest

from mano.main import create_app
from mano.models import HabitLog
from mano.skills.habits import fmt_amount, render_message, suggested_fraction
from mano.voice.tts import NullSpeaker
from fastapi.testclient import TestClient

DAY = date(2026, 11, 4)  # uma quarta-feira


def at(hh: int, mm: int = 0) -> datetime:
    return datetime.combine(DAY, datetime.min.time()).replace(hour=hh, minute=mm)


def cmd(client, text):
    r = client.post("/api/command", json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


def habits(client):
    return {h["name"]: h for h in client.get("/api/habits").json()["habits"]}


WATER = {"name": "Água", "kind": "goal", "unit": "ml", "goal": 3000, "quick": [250, 500],
         "reminder": {"enabled": True, "mode": "interval", "every": 30, "start": "08:00", "end": "22:00",
                      "message": "Hora da água! Faltam {faltam}, bebe uns {fração}."}}


@pytest.fixture
def skill(app, client):
    s = app.state.ctx.skill("hábitos")
    s._started = at(7)
    s._last_sent.clear()
    return s


def run(app, coro):
    return asyncio.run_coroutine_threadsafe(coro, app.state.ctx.hub.loop).result(10)


def put_log(app, habit_id, amount, when: datetime):
    with app.state.ctx.db.session() as s:
        s.add(HabitLog(habit_id=habit_id, day=when.date(), amount=amount, at=when))
        s.commit()


# ---------- funções puras ----------

def test_helpers():
    assert fmt_amount(1800, "ml") == "1,8 L"
    assert fmt_amount(250, "ml") == "250 ml"
    assert fmt_amount(12, "páginas") == "12 páginas"
    rem = {"start": "08:00", "end": "22:00", "every": 30}
    assert suggested_fraction(3000, "ml", rem) == 100  # 3 L em 28 avisos ≈ 107 → 100
    assert suggested_fraction(None, "ml", rem) is None
    msg = render_message("Faltam {faltam}, bebe uns {fração} ({fracao})", {"faltam": "1,8 L", "fração": "100 ml"})
    assert msg == "Faltam 1,8 L, bebe uns 100 ml (100 ml)"


# ---------- banco antigo ----------

def test_old_database_gets_new_columns(settings):
    db = settings.data_dir / "mano.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE habit (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, icon VARCHAR NOT NULL, "
              "days VARCHAR NOT NULL, position INTEGER NOT NULL, active BOOLEAN NOT NULL, created_at DATETIME NOT NULL)")
    c.execute("INSERT INTO habit VALUES (1, 'Exercício', '', '0123456', 0, 1, '2026-01-01 08:00:00')")
    c.commit()
    c.close()
    with TestClient(create_app(settings, NullSpeaker())) as client:
        h = habits(client)["Exercício"]
        assert h["kind"] == "check" and h["reminder"]["enabled"] is False
        assert cmd(client, "fiz exercício")["intent"] == "habit.done"
        assert habits(client)["Exercício"]["done_today"] is True


# ---------- tipos e registros ----------

def test_goal_habit_sums_until_goal(client):
    r = client.post("/api/habits", json=WATER)
    assert r.status_code == 200, r.text
    hid = r.json()["id"]
    client.post(f"/api/habits/{hid}/log", json={"amount": 1000})
    h = habits(client)["Água"]
    assert h["today_amount"] == 1000 and not h["done_today"] and h["quick"] == [250, 500]
    assert h["suggested_fraction"] == 100
    client.post(f"/api/habits/{hid}/log", json={"amount": 2000})
    h = habits(client)["Água"]
    assert h["done_today"] and h["streak"] == 1 and len(h["today_logs"]) == 2
    # registrar ontem e corrigir
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post(f"/api/habits/{hid}/log", json={"amount": 3100, "day": yesterday})
    h = habits(client)["Água"]
    assert h["amounts"][yesterday] == 3100 and h["streak"] == 2
    log_id = h["today_logs"][0]["id"]
    assert client.patch(f"/api/habits/logs/{log_id}", json={"amount": 500}).status_code == 200
    assert habits(client)["Água"]["today_amount"] == 2500
    assert client.delete(f"/api/habits/logs/{log_id}").status_code == 200
    assert habits(client)["Água"]["today_amount"] == 2000
    assert client.post(f"/api/habits/{hid}/log", json={"amount": 100, "day": "2999-01-01"}).status_code == 400


def test_free_habit_with_weekly_goal_and_note(client):
    hid = client.post("/api/habits", json={"name": "Leitura", "kind": "goal", "unit": "páginas", "goal": 100,
                                           "goal_period": "week"}).json()["id"]
    client.post(f"/api/habits/{hid}/log", json={"amount": 10, "note": "O Hobbit"})
    h = habits(client)["Leitura"]
    assert h["done_today"]  # meta semanal: registrar no dia já conta
    assert h["week_amount"] == 10 and h["last_note"] == "O Hobbit"


def test_update_and_validation(client):
    hid = client.post("/api/habits", json={"name": "Meditar"}).json()["id"]
    body = {"name": "Meditar", "kind": "goal", "unit": "min", "goal": 10,
            "reminder": {"enabled": True, "mode": "fixed", "times": ["07:30"]}}
    assert client.put(f"/api/habits/{hid}", json=body).status_code == 200
    h = habits(client)["Meditar"]
    assert h["kind"] == "goal" and h["reminder"]["times"] == ["07:30"] and h["reminder"]["message"]
    assert client.put(f"/api/habits/{hid}", json={**body, "kind": "x"}).status_code == 400
    bad = {**body, "reminder": {"enabled": True, "times": ["25h"]}}
    assert client.put(f"/api/habits/{hid}", json=bad).status_code == 400


# ---------- cobrança ----------

def test_interval_reminders_follow_the_window(app, client, skill):
    hid = client.post("/api/habits", json=WATER).json()["id"]
    skill._last_sent.clear()
    assert run(app, skill.tick(at(7, 50))) == []  # fora da janela
    sent = run(app, skill.tick(at(8, 0)))
    assert len(sent) == 1 and sent[0]["message"] == "Hora da água! Faltam 3 L, bebe uns 100 ml."
    assert sent[0]["quick"][0] == 100 and sent[0]["expires_at"] - sent[0]["at"] == 3 * 60 * 1000
    assert run(app, skill.tick(at(8, 10))) == []  # mesmo horário não repete
    assert len(run(app, skill.tick(at(8, 30)))) == 1
    # bebeu às 8:50: o aviso das 9:00 é pulado
    put_log(app, hid, 300, at(8, 50))
    assert run(app, skill.tick(at(9, 0))) == []
    assert skill._stats[(hid, DAY)]["skipped"] == 1
    assert len(run(app, skill.tick(at(9, 30)))) == 1
    # bateu a meta: para por hoje
    put_log(app, hid, 2700, at(9, 40))
    assert run(app, skill.tick(at(10, 0))) == []


def test_reminders_respect_pause_snooze_and_silence(app, client, skill):
    hid = client.post("/api/habits", json=WATER).json()["id"]
    skill._last_sent.clear()
    skill.set_pause(60, now=at(8, 5))  # até 9:05
    assert run(app, skill.tick(at(8, 30))) == []
    assert run(app, skill.tick(at(9, 0))) == []
    assert len(run(app, skill.tick(at(9, 30)))) == 1  # pausa acabou
    h = skill.get(hid)
    skill.snooze(h, now=at(9, 31))
    assert run(app, skill.tick(at(9, 40))) == []
    assert len(run(app, skill.tick(at(9, 47)))) == 1  # "agora não" adiou 15 min
    skill.silence_today(hid, DAY)
    assert run(app, skill.tick(at(10, 0))) == []
    skill.set_pause(0)


def test_fixed_time_reminder_only_if_not_done(app, client, skill):
    hid = client.post("/api/habits", json={"name": "Exercício", "reminder": {"enabled": True, "mode": "fixed",
                                                                            "times": ["19:00"]}}).json()["id"]
    sent = run(app, skill.tick(at(19, 2)))
    assert len(sent) == 1 and sent[0]["message"] == "Lembrete: Exercício."
    assert run(app, skill.tick(at(19, 5))) == []
    skill.set_done(hid, DAY + timedelta(days=1), True)
    skill._fixed_sent.clear()
    nxt = at(19, 1) + timedelta(days=1)
    assert run(app, skill.tick(nxt)) == []  # já marcado no dia: não cobra


def test_reminder_endpoints(client, skill):
    hid = client.post("/api/habits", json=WATER).json()["id"]
    assert client.post(f"/api/habits/{hid}/snooze").json()["ok"]
    assert client.post(f"/api/habits/{hid}/silence").json()["ok"]
    assert habits(client)["Água"]["silenced_today"] is True
    r = client.post("/api/habits/pause", json={"minutes": -1}).json()
    assert r["until"] and client.get("/api/habits").json()["habits_paused_until"]
    assert client.post("/api/habits/pause", json={"minutes": 0}).json()["until"] is None
    assert client.post(f"/api/habits/{hid}/test").json()["message"].startswith("Hora da água!")


# ---------- voz ----------

@pytest.mark.parametrize("text,intent", [
    ("bebi 500 ml de água", "habit.log"),
    ("bebi um copo de água", "habit.log"),
    ("bebi meio litro", "habit.log"),
    ("li 20 páginas", "habit.log"),
    ("registra 10 minutos de meditação", "habit.log"),
    ("quanto de água eu bebi hoje?", "habit.progress"),
    ("quantas páginas eu li essa semana?", "habit.progress"),
    ("pausa os lembretes de água", "habit.silence"),
    ("chega de lembrete por hoje", "habit.pause"),
    ("pausa as cobranças por 2 horas", "habit.pause"),
    ("pausa a música", "spotify.pause"),
    ("fiz exercício", "habit.done"),
])
def test_routes(registry, text, intent):
    m = registry.parse(text)
    assert m and m.intent.name == intent, (text, m and m.intent.name)


def test_voice_logging_and_progress(client):
    client.post("/api/habits", json=WATER)
    client.post("/api/habits", json={"name": "Leitura", "kind": "free", "unit": "páginas"})
    assert "Anotei 500 ml" in cmd(client, "bebi 500 ml de água")["speech"]
    cmd(client, "bebi um copo de água")
    cmd(client, "bebi 1,5 litros de água")
    out = cmd(client, "quanto de água eu bebi hoje?")["speech"]
    assert "2,2 L" in out and "Faltam 750 ml" in out  # 500 + 250 + 1500
    cmd(client, "li 20 páginas do Hobbit")
    leitura = habits(client)["Leitura"]
    assert leitura["today_amount"] == 20 and leitura["last_note"] == "Hobbit"
    assert habits(client)["Água"]["today_logs"][0]["via"] == "voz"
    assert "páginas" in cmd(client, "quantas páginas eu li essa semana?")["speech"]
    assert "quantidade" in cmd(client, "fiz leitura")["speech"]
    assert "até amanhã" in cmd(client, "pausa os lembretes de água")["speech"]
    assert habits(client)["Água"]["silenced_today"]
    assert "Remédios continuam" in cmd(client, "pausa as cobranças por 2 horas")["speech"]
    assert "faltam 750 ml" in cmd(client, "quais hábitos faltam?")["speech"]
