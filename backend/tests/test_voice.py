"""Testes da voz. Os de ponta a ponta sintetizam frases com a voz do Windows num WAV
(nada toca no alto-falante) e passam pelo Vosk de verdade."""

import sys
import wave

import pytest

from mano.config import ROOT
from mano.voice.loop import SAMPLE_RATE, VoiceConfig, VoiceLoop, find_wake

MODEL_DIR = ROOT / "data" / "models" / "vosk-model-small-pt-0.3"
PHRASES = [p.split() for p in ["fala mano", "ei mano", "oi mano"]]


def w(word, conf, end):
    return {"word": word, "conf": conf, "end": end}


def test_find_wake():
    assert find_wake({"result": [w("fala", 1, 0.5), w("mano", 0.9, 1.1)]}, PHRASES, 0.75) == 1.1
    assert find_wake({"result": [w("[unk]", 1, 0.3), w("ei", 1, 0.6), w("mano", 1, 0.9)]}, PHRASES, 0.75) == 0.9
    # palavras soltas ou com confiança baixa não ativam
    assert find_wake({"result": [w("oi", 1, 0.3), w("[unk]", 1, 0.6), w("mano", 1, 0.9)]}, PHRASES, 0.75) is None
    assert find_wake({"result": [w("fala", 1, 0.5), w("mano", 0.5, 1.1)]}, PHRASES, 0.75) is None
    assert find_wake({"text": ""}, PHRASES, 0.75) is None


needs_voice = pytest.mark.skipif(
    sys.platform != "win32" or not (MODEL_DIR / "final.mdl").exists(),
    reason="precisa do Windows (SAPI) e do modelo Vosk (scripts/get-models.ps1)",
)


@pytest.fixture(scope="module")
def model():
    from vosk import Model, SetLogLevel

    SetLogLevel(-1)
    return Model(str(MODEL_DIR))


def synth(text: str, path) -> bytes:
    import pythoncom
    import win32com.client

    pythoncom.CoInitialize()
    voice = win32com.client.Dispatch("SAPI.SpVoice")
    voice.Voice = next(v for v in voice.GetVoices() if "maria" in v.GetDescription().lower())
    fmt = win32com.client.Dispatch("SAPI.SpAudioFormat")
    fmt.Type = 18  # 16 kHz 16 bit mono
    stream = win32com.client.Dispatch("SAPI.SpFileStream")
    stream.Format = fmt
    stream.Open(str(path), 3)
    voice.AudioOutputStream = stream
    voice.Speak(text, 8)  # 8 = SSML/XML, para as pausas
    stream.Close()
    with wave.open(str(path)) as wf:
        return wf.readframes(wf.getnframes())


def run(model, audio: bytes, *, force_listen=False) -> list[str]:
    commands: list[str] = []
    loop = VoiceLoop(model, VoiceConfig(wake_phrases=["fala mano", "ei mano", "oi mano"]),
                     on_command=commands.append)
    if force_listen:
        loop.listen_now()
    audio += b"\0\0" * SAMPLE_RATE  # 1 s de silêncio no fim
    for i in range(0, len(audio), 3200):
        loop.feed(audio[i : i + 3200])
    loop.flush()
    return commands


@needs_voice
def test_wake_then_command(model, tmp_path, registry):
    audio = synth("Fala Mano. <silence msec='700'/> que horas são?", tmp_path / "a.wav")
    cmds = run(model, audio)
    assert len(cmds) == 1, cmds
    assert registry.parse(cmds[0]).intent.name == "clock.time"


@needs_voice
def test_wake_and_command_in_one_breath(model, tmp_path, registry):
    audio = synth("Fala Mano, coloca um timer de dez minutos pro arroz", tmp_path / "b.wav")
    cmds = run(model, audio)
    assert len(cmds) == 1, cmds
    m = registry.parse(cmds[0])
    assert m.intent.name == "timer.start"
    assert m.slots["seconds"] == 600


@needs_voice
def test_ordinary_speech_does_not_wake(model, tmp_path):
    audio = synth("Hoje eu fui no mercado comprar banana e manga com o meu irmão", tmp_path / "c.wav")
    assert run(model, audio) == []


@needs_voice
def test_push_to_talk(model, tmp_path, registry):
    audio = synth("que dia é hoje", tmp_path / "d.wav")
    cmds = run(model, audio, force_listen=True)
    assert len(cmds) == 1, cmds
    assert registry.parse(cmds[0]).intent.name == "clock.date"


@needs_voice
def test_muted_while_speaking(model, tmp_path):
    """Enquanto o Mano fala, nem a frase de ativação é ouvida (evita responder a si mesmo)."""
    audio = synth("Fala Mano. <silence msec='700'/> que horas são?", tmp_path / "e.wav")
    commands: list[str] = []
    loop = VoiceLoop(model, VoiceConfig(wake_phrases=["fala mano"]), on_command=commands.append,
                     is_muted=lambda: True)
    for i in range(0, len(audio), 3200):
        loop.feed(audio[i : i + 3200])
    loop.flush()
    assert commands == []
