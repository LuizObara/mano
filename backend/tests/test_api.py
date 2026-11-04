import time

from mano.main import create_app
from mano.voice.tts import NullSpeaker
from fastapi.testclient import TestClient


def cmd(client, text):
    r = client.post("/api/command", json={"text": text})
    assert r.status_code == 200
    return r.json()


def test_command_logs_and_speaks(client, speaker):
    out = cmd(client, "que horas são")
    assert out["intent"] == "clock.time"
    assert speaker.said and speaker.said[-1].startswith(("São", "É"))
    hist = client.get("/api/history").json()
    assert hist[0]["text"] == "que horas são"


def test_unknown_command(client):
    out = cmd(client, "faz um bolo")
    assert out["intent"] is None
    assert "Não entendi" in out["speech"]


def test_timer_rings_and_dismiss(client, speaker):
    out = cmd(client, "timer de 1 segundo pro teste")
    tid = out["data"]["timer"]["id"]
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        deadline = time.time() + 5
        while time.time() < deadline:
            msg = ws.receive_json()
            if msg["type"] == "timer.ringing":
                break
        else:
            raise AssertionError("timer não tocou")
    assert any("teste terminou" in s for s in speaker.said)
    assert client.get("/api/timers").json()[0]["status"] == "ringing"
    out = cmd(client, "para")
    assert out["speech"] == "Beleza."
    assert client.get("/api/timers").json() == []
    assert tid


def test_cancel_disambiguates(client):
    cmd(client, "timer de 10 minutos pro arroz")
    cmd(client, "timer de 20 minutos pro feijão")
    out = cmd(client, "cancela o timer")
    assert "Qual deles" in out["speech"]
    out = cmd(client, "cancela o timer do arroz")
    assert out["speech"] == "Timer do arroz cancelado."
    assert [t["label"] for t in client.get("/api/timers").json()] == ["feijao"]
    out = cmd(client, "cancela todos os timers")
    assert client.get("/api/timers").json() == []


def test_timer_survives_restart(settings):
    app1 = create_app(settings, speaker=NullSpeaker())
    with TestClient(app1) as c:
        c.post("/api/timers", json={"seconds": 600, "label": "bolo"})
    app2 = create_app(settings, speaker=NullSpeaker())
    with TestClient(app2) as c:
        timers = c.get("/api/timers").json()
        assert [t["label"] for t in timers] == ["bolo"]
        assert app2.state.ctx.scheduler.get_job(f"timer-{timers[0]['id']}") is not None
