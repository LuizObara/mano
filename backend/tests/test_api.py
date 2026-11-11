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


def test_history_page_filters_and_pages(client):
    for text in ["que horas são", "faz um bolo", "que dia é hoje", "voa até a lua"]:
        cmd(client, text)
    page = client.get("/api/history/page", params={"limit": 3}).json()
    assert page["total"] == 4
    assert [e["text"] for e in page["items"]] == ["voa até a lua", "que dia é hoje", "faz um bolo"]
    rest = client.get("/api/history/page", params={"limit": 3, "offset": 3}).json()
    assert [e["text"] for e in rest["items"]] == ["que horas são"]
    errs = client.get("/api/history/page", params={"kind": "erro"}).json()
    assert errs["total"] == 2 and all(e["intent"] is None for e in errs["items"])
    assert client.get("/api/history/page", params={"kind": "voz"}).json()["total"] == 0
    assert client.get("/api/history/page", params={"kind": "texto"}).json()["total"] == 4
    found = client.get("/api/history/page", params={"q": "BOLO"}).json()
    assert [e["text"] for e in found["items"]] == ["faz um bolo"]


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


def test_timer_extend_running_and_ringing(client, speaker):
    t = client.post("/api/timers", json={"seconds": 600, "label": "bolo"}).json()
    r = client.post(f"/api/timers/{t['id']}/extend", json={"seconds": 60})
    assert r.status_code == 200, r.text
    assert r.json()["duration_s"] == 660 and r.json()["ends_at"] - t["ends_at"] == 60_000

    # tocando: "+5 min" volta a contar do zero e para de tocar
    ring = cmd(client, "timer de 1 segundo pro teste")["data"]["timer"]
    deadline = time.time() + 5
    while time.time() < deadline and client.get("/api/timers").json()[0]["status"] != "ringing":
        time.sleep(0.1)
    r = client.post(f"/api/timers/{ring['id']}/extend", json={"seconds": 300})
    assert r.json()["status"] == "running" and r.json()["duration_s"] == 300
    assert all(x["status"] == "running" for x in client.get("/api/timers").json())

    client.post(f"/api/timers/{t['id']}/cancel")
    assert client.post(f"/api/timers/{t['id']}/extend", json={"seconds": 60}).status_code == 400
    assert client.post(f"/api/timers/{t['id']}/extend", json={"seconds": 0}).status_code == 422
    assert client.post("/api/timers/9999/extend", json={"seconds": 60}).status_code == 404


def test_timer_survives_restart(settings):
    app1 = create_app(settings, speaker=NullSpeaker())
    with TestClient(app1) as c:
        c.post("/api/timers", json={"seconds": 600, "label": "bolo"})
    app2 = create_app(settings, speaker=NullSpeaker())
    with TestClient(app2) as c:
        timers = c.get("/api/timers").json()
        assert [t["label"] for t in timers] == ["bolo"]
        assert app2.state.ctx.scheduler.get_job(f"timer-{timers[0]['id']}") is not None


def test_mic_mute_is_saved_and_reported(settings):
    app = create_app(settings, NullSpeaker())
    with TestClient(app) as c:
        assert c.get("/api/voice").json()["muted"] is False
        r = c.post("/api/voice/mute", json={"muted": True})
        assert r.status_code == 200 and r.json()["muted"] is True
        assert c.post("/api/voice/listen").json()["ok"] is False
    # continua mudo depois de reiniciar
    with TestClient(create_app(settings, NullSpeaker())) as c:
        assert c.get("/api/voice").json()["muted"] is True
        assert c.post("/api/voice/mute", json={"muted": False}).json()["muted"] is False


def test_frontend_cache_headers(settings):
    """Depois de recompilar o visor, a página tem que ser revalidada (senão o navegador mostra a versão antiga)."""
    dist = settings.frontend_dist
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text('<script src="/assets/index-abc.js"></script>', encoding="utf-8")
    (dist / "assets" / "index-abc.js").write_text("1", encoding="utf-8")
    (dist / "sw.js").write_text("//", encoding="utf-8")
    with TestClient(create_app(settings, speaker=NullSpeaker())) as c:
        for path in ("/", "/remedios", "/sw.js"):
            r = c.get(path)
            assert r.status_code == 200 and r.headers["cache-control"] == "no-cache", path
        r = c.get("/assets/index-abc.js")
        assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
