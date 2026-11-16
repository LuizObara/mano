"""Ajustes → Voz e áudio: lista de aparelhos, escolha por nome, aparelho que some e volta, aplicação na hora."""

import json

import pytest
import sounddevice

from mano.main import create_app
from mano.voice.devices import AudioDevices

JBL_MIC = "Headset (JBL WIND2 Hands-Free AG Audio)"
REALTEK_MIC = "Microfone (Realtek Audio)"
JBL_OUT = "Fones de ouvido (JBL WIND2 Stereo)"
REALTEK_OUT = "Fones de ouvido / Alto falantes (Realtek Audio)"


def dev(name, api, ins=0, outs=0):
    return {"name": name, "hostapi": api, "max_input_channels": ins, "max_output_channels": outs}


class FakeAudio:
    """Dublê do AudioHost com o desenho deste notebook: MME (nomes cortados), DirectSound (com os
    apelidos "primário") e WASAPI (quem diz o padrão do Windows)."""

    def __init__(self, jbl=True):
        self.jbl = jbl
        self.reinits = 0

    def query(self):
        devices = [
            dev("Microsoft Sound Mapper - Input", 0, ins=2),
            dev(REALTEK_MIC, 0, ins=2),
            dev("Microsoft Sound Mapper - Output", 0, outs=2),
            dev(REALTEK_OUT[:31], 0, outs=2),
            dev("Driver de captura de som primário", 1, ins=2),
            dev(REALTEK_MIC, 1, ins=2),
            dev("Driver de som primário", 1, outs=2),
            dev(REALTEK_OUT, 1, outs=2),
            dev(REALTEK_OUT, 2, outs=2),
            dev(REALTEK_MIC, 2, ins=2),
        ]
        if self.jbl:
            devices += [
                dev(JBL_MIC[:31], 0, ins=1),
                dev(JBL_MIC, 1, ins=1),
                dev(JBL_OUT, 1, outs=2),
                dev(JBL_OUT, 2, outs=2),
                dev(JBL_MIC, 2, ins=1),
            ]
        devices = [dict(d, index=i) for i, d in enumerate(devices)]

        def idx(name, api, kind):
            ch = "max_input_channels" if kind == "in" else "max_output_channels"
            return next(d["index"] for d in devices if d["name"] == name and d["hostapi"] == api and d[ch])

        apis = [
            {"name": "MME", "default_input_device": idx(REALTEK_MIC, 0, "in"), "default_output_device": idx(REALTEK_OUT[:31], 0, "out")},
            {"name": "Windows DirectSound", "default_input_device": 4, "default_output_device": 6},
            {"name": "Windows WASAPI",
             "default_input_device": idx(JBL_MIC if self.jbl else REALTEK_MIC, 2, "in"),
             "default_output_device": idx(JBL_OUT if self.jbl else REALTEK_OUT, 2, "out")},
        ]
        return devices, apis

    def reinit(self):
        self.reinits += 1


def index_of(fake, name, api, kind):
    devices, _ = fake.query()
    ch = "max_input_channels" if kind == "in" else "max_output_channels"
    return next(d["index"] for d in devices if d["name"] == name and d["hostapi"] == api and d[ch])


@pytest.fixture
def fake(app):
    f = FakeAudio()
    app.state.ctx.audio.host = f
    return f


def test_lists_devices_once_with_full_names(client, fake):
    st = client.get("/api/audio").json()
    assert st["inputs"] == [REALTEK_MIC, JBL_MIC]  # sem "Driver primário" nem "Sound Mapper", sem repetir
    assert st["outputs"] == [REALTEK_OUT, JBL_OUT]
    assert st["default_input"] == JBL_MIC and st["default_output"] == JBL_OUT  # padrão pelo nome inteiro
    assert st["input"] == "" and st["output"] == ""
    assert st["missing_input"] is False and st["voice_available"] is False


def test_falls_back_to_mme_without_directsound(tmp_path):
    class OnlyMME(FakeAudio):
        def query(self):
            devices, apis = super().query()
            return [d for d in devices if d["hostapi"] == 0], [apis[0]]

    audio = AudioDevices(tmp_path / "voice.json")
    audio.host = OnlyMME()
    scan = audio.scan()
    assert [n for n, _ in scan["inputs"]] == [REALTEK_MIC, JBL_MIC[:31]]
    assert scan["default_input"] == REALTEK_MIC


def test_choice_is_saved_by_name_and_survives_restart(client, fake, settings, speaker):
    (settings.data_dir / "voice.json").write_text(json.dumps({"mic_muted": True}))
    st = client.put("/api/audio", json={"input": REALTEK_MIC, "output": JBL_OUT}).json()
    assert st["input"] == REALTEK_MIC and st["output"] == JBL_OUT and st["error"] is None

    saved = json.loads((settings.data_dir / "voice.json").read_text(encoding="utf-8"))
    assert saved == {"mic_muted": True, "mic_device": REALTEK_MIC, "out_device": JBL_OUT}

    again = create_app(settings, speaker=speaker).state.ctx.audio
    again.host = FakeAudio()
    assert again.input == REALTEK_MIC
    assert again.mic_device() == index_of(fake, REALTEK_MIC, 1, "in")  # DirectSound
    assert again.out_device() == index_of(fake, JBL_OUT, 1, "out")


def test_only_the_sent_field_changes(client, fake):
    client.put("/api/audio", json={"input": REALTEK_MIC, "output": JBL_OUT})
    st = client.put("/api/audio", json={"output": ""}).json()
    assert st["input"] == REALTEK_MIC and st["output"] == ""


def test_unknown_device_is_refused(client, fake):
    r = client.put("/api/audio", json={"input": "Microfone que não existe"})
    assert r.status_code == 400 and "microfone" in r.json()["detail"]
    r = client.put("/api/audio", json={"output": "Caixa que não existe"})
    assert r.status_code == 400 and "alto-falante" in r.json()["detail"]
    assert client.get("/api/audio").json()["input"] == ""


def test_output_goes_to_voice_and_alarms(client, fake, app, speaker):
    player = app.state.ctx.alarms.player
    client.put("/api/audio", json={"output": JBL_OUT})
    assert speaker.output == JBL_OUT
    assert player.device == index_of(fake, JBL_OUT, 1, "out")

    client.post("/api/audio/test")
    assert player.played[-1] == ("plim", 70, False)
    assert speaker.said[-1] == "Assim que eu soo neste aparelho."

    client.put("/api/audio", json={"output": ""})  # padrão do Windows
    assert speaker.output is None and player.device is None


def test_change_is_announced(client, fake):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "hello"
        client.put("/api/audio", json={"input": REALTEK_MIC})
        msg = ws.receive_json()
        while msg["type"] != "audio":
            msg = ws.receive_json()
        assert msg["audio"]["input"] == REALTEK_MIC


def test_missing_device_uses_default_and_comes_back(client, fake, app, speaker):
    client.put("/api/audio", json={"input": JBL_MIC, "output": JBL_OUT})
    fake.jbl = False  # desligou o fone
    st = client.post("/api/audio/refresh").json()
    assert fake.reinits == 1
    assert st["missing_input"] is True and st["missing_output"] is True
    assert st["input"] == JBL_MIC  # a escolha fica guardada
    audio = app.state.ctx.audio
    assert audio.mic_device() is None and audio.out_device() is None
    assert speaker.output is None  # fala no padrão enquanto o fone não volta

    fake.jbl = True
    st = client.post("/api/audio/refresh").json()
    assert st["missing_input"] is False and st["missing_output"] is False
    assert audio.mic_device() == index_of(fake, JBL_MIC, 1, "in")
    assert speaker.output == JBL_OUT


def test_env_mic_still_works_without_a_choice(tmp_path):
    audio = AudioDevices(tmp_path / "voice.json", env_mic=3)
    audio.host = FakeAudio()
    assert audio.mic_device() == 3
    audio.select(input=REALTEK_MIC)
    assert audio.mic_device() == 5


def test_level_without_voice_is_zero(client, fake):
    assert client.get("/api/audio/level").json() == {"level": 0.0}


def test_level_polling_stays_out_of_the_access_log(client):
    import logging

    access = logging.getLogger("uvicorn.access")
    rec = lambda path: logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/1.1" %d',
                                         ("127.0.0.1:1", "GET", path, 200), None)
    assert not access.filter(rec("/api/audio/level"))
    assert access.filter(rec("/api/audio"))


class FakeStream:
    opened: list = []
    fail_on: set = set()

    def __init__(self, *, device, **kw):
        if device in FakeStream.fail_on:
            raise OSError("aparelho ocupado")
        self.device = device
        FakeStream.opened.append(device)

    def start(self):
        pass

    def stop(self):
        pass

    def close(self):
        pass


@pytest.fixture
def fake_stream(monkeypatch):
    FakeStream.opened = []
    FakeStream.fail_on = set()
    monkeypatch.setattr(sounddevice, "RawInputStream", FakeStream)
    return FakeStream


def test_switching_mic_reopens_without_restart(client, fake, app, fake_stream):
    voice = app.state.voice
    voice.available = True  # como se a voz tivesse subido
    voice._open_mic()
    assert fake_stream.opened == [None]

    client.put("/api/audio", json={"input": REALTEK_MIC})
    assert fake_stream.opened[-1] == index_of(fake, REALTEK_MIC, 1, "in")
    assert client.get("/api/audio").json()["voice_available"] is True

    client.put("/api/audio", json={"output": JBL_OUT})  # trocar só a saída não mexe no microfone
    assert len(fake_stream.opened) == 2


def test_mic_that_does_not_open_falls_back_to_default(client, fake, app, fake_stream):
    voice = app.state.voice
    voice.available = True
    fake_stream.fail_on = {index_of(fake, JBL_MIC, 1, "in")}
    st = client.put("/api/audio", json={"input": JBL_MIC}).json()
    assert st["error"] is None
    assert fake_stream.opened[-1] is None and voice.available is True
