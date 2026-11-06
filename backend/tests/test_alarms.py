"""Ajustes de alarme: som, volume, estilo, voz, repetição, horário silencioso, teste e sons próprios."""

import asyncio
import base64
import io
import math
import struct
import wave
from datetime import datetime, timedelta

import pytest

from mano.alarms import BUILTIN, Alarms, QuietCfg, wav_duration
from mano.main import create_app
from tests.test_routine import add_med, clock, doses, meds_skill, run  # noqa: F401  (clock é fixture)


def alarms(app) -> Alarms:
    return app.state.ctx.alarms


def wav_bytes(seconds=0.3, width=2) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(width)
        w.setframerate(8000)
        n = int(8000 * seconds)
        if width == 2:
            w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(i / 3))) for i in range(n)))
        else:
            w.writeframes(bytes(128 for _ in range(n)))
    return buf.getvalue()


def test_defaults_follow_env(client, settings):
    r = client.get("/api/alarms").json()
    assert set(r["kinds"]) == {"timer", "med", "reminder", "habit"}
    assert r["kinds"]["timer"]["style"] == "loop"
    assert r["kinds"]["med"]["every_s"] == settings.med_repeat_min * 60
    assert r["kinds"]["med"]["stop_after_s"] == settings.med_give_up_min * 60
    assert r["kinds"]["med"]["snooze_min"] == settings.med_snooze_min
    assert r["kinds"]["reminder"]["repeat"] is False
    assert {s["id"] for s in r["sounds"]} >= set(BUILTIN)
    assert r["quiet"]["enabled"] is False


def test_update_validates_and_persists(client, settings):
    r = client.put("/api/alarms/reminder", json={"sound": "sino", "volume": 35, "repeat": True, "every_s": 120})
    assert r.status_code == 200, r.text
    got = r.json()["kinds"]["reminder"]
    assert {k: got[k] for k in ("sound", "volume", "repeat", "every_s")} == {"sound": "sino", "volume": 35, "repeat": True, "every_s": 120}
    assert client.put("/api/alarms/reminder", json={"sound": "nao-existe"}).status_code == 400
    assert client.put("/api/alarms/reminder", json={"volume": 150}).status_code == 422
    assert client.put("/api/alarms/reminder", json={"every_s": 2}).status_code == 422
    assert client.put("/api/alarms/sirene", json={"volume": 10}).status_code == 404
    # outro Mano com a mesma pasta de dados lê o que foi salvo
    again = create_app(settings)
    assert again.state.ctx.alarms.cfg("reminder").volume == 35
    r = client.post("/api/alarms/reminder/reset").json()
    assert r["kinds"]["reminder"] == r["defaults"]["reminder"]


def test_test_button_rings_with_config(client, app, speaker):
    client.put("/api/alarms/reminder", json={"sound": "cristal", "volume": 55})
    assert client.post("/api/alarms/reminder/test").json()["ok"]
    assert speaker.said[-1] == "Teste de lembrete."
    assert alarms(app).player.played[-1] == ("cristal", 55, False)
    client.put("/api/alarms/reminder", json={"speak": False})
    n = len(speaker.said)
    client.post("/api/alarms/reminder/test")
    assert len(speaker.said) == n  # voz desligada
    client.put("/api/alarms/habit", json={"sound": "bipe", "volume": 20})
    client.post("/api/alarms/habit/test")
    assert alarms(app).player.played[-1] == ("bipe", 20, False)
    assert client.post("/api/alarms/sirene/test").status_code == 404


def test_loop_style_and_stop(client, app):
    client.put("/api/alarms/reminder", json={"style": "loop", "speak": False})
    client.post("/api/alarms/reminder/test")
    a = alarms(app)
    assert a.player.played[-1] == ("plim", 70, True)
    assert "reminder" in a._loops
    assert client.post("/api/alarms/stop").json()["stopped"] == 1
    assert not a._loops


def test_preview_sound(client, app):
    assert client.post("/api/alarms/preview", json={"sound": "suave", "volume": 10}).status_code == 200
    assert alarms(app).player.played[-1] == ("suave", 10, False)
    assert client.post("/api/alarms/preview", json={"sound": "xyz"}).status_code == 404


def test_builtin_sounds_render(app):
    p = alarms(app).player
    for sound in BUILTIN:
        path = p.path_for(sound, 50)
        assert path and path.exists() and 0.3 < wav_duration(path) < 4, sound
    assert p.path_for("sino", 0) is None
    assert p.path_for("none", 80) is None
    loud, soft = p.path_for("sino", 100), p.path_for("sino", 20)
    assert loud.read_bytes() != soft.read_bytes()


def test_custom_sound_upload_and_delete(client, app):
    data = base64.b64encode(wav_bytes()).decode()
    r = client.post("/api/alarms/sounds", json={"name": "Meu Som Ótimo.wav", "data": data})
    assert r.status_code == 200, r.text
    sound = r.json()["sound"]
    assert sound == "custom:meu-som-otimo"
    assert any(s["id"] == sound and s["custom"] for s in r.json()["sounds"])
    client.put("/api/alarms/reminder", json={"sound": sound})
    path = alarms(app).player.path_for(sound, 50)
    assert path and abs(wav_duration(path) - 0.3) < 0.01
    r = client.delete("/api/alarms/sounds/meu-som-otimo").json()
    assert r["kinds"]["reminder"]["sound"] == "plim"  # volta ao padrão
    assert not any(s["id"] == sound for s in r["sounds"])


@pytest.mark.parametrize("raw,msg", [(b"isso nao e wav", "não é um WAV"), (wav_bytes(width=1), "16 bits")])
def test_custom_sound_rejects(client, raw, msg):
    r = client.post("/api/alarms/sounds", json={"name": "x.wav", "data": base64.b64encode(raw).decode()})
    assert r.status_code == 400 and msg in r.json()["detail"]


def test_quiet_hours(app, speaker):
    a = alarms(app)
    a.set_quiet(QuietCfg(enabled=True, start="22:00", end="07:00", meds_ring=True))
    assert a.quiet_now("reminder", datetime(2026, 1, 1, 23, 30))
    assert a.quiet_now("reminder", datetime(2026, 1, 1, 6, 59))
    assert not a.quiet_now("reminder", datetime(2026, 1, 1, 7, 0))
    assert not a.quiet_now("med", datetime(2026, 1, 1, 23, 30))  # remédio toca mesmo assim
    a.set_quiet(QuietCfg(enabled=True, start="13:00", end="14:00", meds_ring=False))
    assert a.quiet_now("med", datetime(2026, 1, 1, 13, 15))
    assert not a.quiet_now("med", datetime(2026, 1, 1, 14, 15))


def test_quiet_hours_mutes_sound_and_voice(client, app, speaker):
    a = alarms(app)
    now = datetime.now()
    a.set_quiet(QuietCfg(enabled=True, start=(now - timedelta(minutes=5)).strftime("%H:%M"),
                         end=(now + timedelta(minutes=5)).strftime("%H:%M"), meds_ring=True))
    n, played = len(speaker.said), len(a.player.played)
    run(app, a.ring("reminder", "Lembrete: algo.", title="Lembrete"))
    assert len(speaker.said) == n and len(a.player.played) == played
    run(app, a.ring("med", "Hora do remédio: X.", title="Hora do remédio"))
    assert speaker.said[-1] == "Hora do remédio: X."


def test_para_silences_loops(client, app):
    a = alarms(app)
    client.put("/api/alarms/med", json={"style": "loop"})
    run(app, a.ring("med", "Hora do remédio: X.", title="Hora do remédio"))
    assert "med" in a._loops
    out = client.post("/api/command", json={"text": "para"}).json()
    assert out["speech"] == "Beleza."
    assert not a._loops


# ---------- remédio usa os ajustes ----------

def test_med_without_repeat_alerts_once(client, app, speaker, clock):
    client.put("/api/alarms/med", json={"repeat": False})
    add_med(client, app, times=["08:00"])
    skill = meds_skill(app)
    clock.at(8, 1)
    run(app, skill.tick())
    n = len(speaker.said)
    assert speaker.said[-1].startswith("Hora do remédio")
    clock.at(8, 30)
    run(app, skill.tick())
    assert len(speaker.said) == n
    clock.at(10, 2)
    run(app, skill.tick())
    assert doses(app)[0].status == "missed"


def test_med_custom_interval_and_snooze(client, app, speaker, clock):
    client.put("/api/alarms/med", json={"every_s": 120, "snooze_min": 25, "stop_after_s": 1800})
    add_med(client, app, times=["08:00"])
    skill = meds_skill(app)
    clock.at(8, 1)
    run(app, skill.tick())
    n = len(speaker.said)
    clock.at(8, 3)
    run(app, skill.tick())
    assert len(speaker.said) == n + 1 and "ainda não tomou" in speaker.said[-1]
    out = client.post("/api/command", json={"text": "adia"}).json()
    assert out["speech"] == "Te lembro de novo em 25 minutos."
    assert client.get("/api/meds").status_code == 200
    clock.at(8, 31)
    run(app, skill.tick())
    assert doses(app)[0].status == "missed"  # passou do limite de 30 min


# ---------- lembrete repete ----------

def test_reminder_repeats_until_ok(client, app, speaker):
    client.put("/api/alarms/reminder", json={"repeat": True, "every_s": 60})
    due = (datetime.now() + timedelta(hours=1)).isoformat(timespec="seconds")
    rid = client.post("/api/reminders", json={"text": "pagar o boleto", "due_at": due}).json()["id"]
    skill = next(s for s in app.state.ctx.registry.skills if s.name == "lembretes")
    run(app, skill._fire(rid))
    assert speaker.said[-1] == "Lembrete: pagar o boleto."
    sched = app.state.ctx.scheduler
    assert sched.get_job(f"reminder-ring-{rid}") is not None
    n = len(speaker.said)
    run(app, skill._ring_again(rid))
    assert len(speaker.said) == n + 1
    client.post(f"/api/reminders/{rid}/done")
    assert sched.get_job(f"reminder-ring-{rid}") is None
    run(app, skill._ring_again(rid))
    assert len(speaker.said) == n + 1


def test_reminder_gives_up_after_limit(client, app, speaker):
    client.put("/api/alarms/reminder", json={"repeat": True, "every_s": 60, "stop_after_s": 60})
    due = (datetime.now() + timedelta(hours=1)).isoformat(timespec="seconds")
    rid = client.post("/api/reminders", json={"text": "ligar pro banco", "due_at": due}).json()["id"]
    skill = next(s for s in app.state.ctx.registry.skills if s.name == "lembretes")
    run(app, skill._fire(rid))
    skill._fired_at[rid] -= timedelta(minutes=2)
    n = len(speaker.said)
    run(app, skill._ring_again(rid))
    assert len(speaker.said) == n
    assert app.state.ctx.scheduler.get_job(f"reminder-ring-{rid}") is None
    # continua na faixa até "Ok", só não toca mais
    assert client.get("/api/reminders").json()["reminders"][0]["status"] == "fired"


def test_timer_uses_alarm_sound(client, app):
    client.put("/api/alarms/timer", json={"sound": "bipe", "volume": 60, "speak": False})
    out = client.post("/api/command", json={"text": "timer de 1 segundo"}).json()
    tid = out["data"]["timer"]["id"]
    skill = next(s for s in app.state.ctx.registry.skills if s.name == "timers")
    run(app, skill._fire(tid))
    a = alarms(app)
    assert a.player.played[-1] == ("bipe", 60, True)
    assert "timer" in a._loops
    client.post(f"/api/timers/{tid}/dismiss")
    assert "timer" not in a._loops


def test_after_sound_speaks_then_resumes(client, app, speaker):
    """Com som de verdade: fala depois do toque e volta o contínuo depois da fala."""
    a = alarms(app)
    a.player.enabled = True
    calls = []
    a.player.play = lambda sound, volume, loop=False: (calls.append((sound, loop)) or 0.05)  # type: ignore[method-assign]
    a.player.stop = lambda: calls.append(("stop", False))  # type: ignore[method-assign]
    a.kinds["timer"] = a.kinds["timer"].model_copy(update={"speak": True, "style": "loop"})

    async def go():
        await a.ring("timer", "Ei! Seu timer terminou.", title="Timer", notice=False)
        assert "Ei! Seu timer terminou." not in speaker.said  # ainda tocando o primeiro toque
        await asyncio.sleep(0.5)

    run(app, go())
    assert speaker.said[-1] == "Ei! Seu timer terminou."
    assert calls[0] == ("despertador", False) and calls[-1] == ("despertador", True)
