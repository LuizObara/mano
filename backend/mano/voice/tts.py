"""Saída de voz.

Por enquanto usa a voz SAPI do próprio Windows (Microsoft Maria, pt-BR), que já vem instalada.
A interface `Speaker` permite trocar por Piper depois sem mexer no resto.
"""

import logging
import queue
import sys
import threading
from collections.abc import Callable

log = logging.getLogger(__name__)

StateCallback = Callable[[str], None]  # "speaking" | "idle"


class Speaker:
    def say(self, text: str) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    def stop(self) -> None:
        pass


class NullSpeaker(Speaker):
    """Não fala nada; guarda as frases (útil em testes)."""

    def __init__(self) -> None:
        self.said: list[str] = []

    def say(self, text: str) -> None:
        self.said.append(text)


class SapiSpeaker(Speaker):
    """Fala numa thread própria (COM exige isso) e enfileira as frases."""

    def __init__(self, voice_hint: str = "Maria", rate: int = 1, on_state: StateCallback | None = None):
        self.voice_hint = voice_hint
        self.rate = rate
        self.on_state = on_state or (lambda _s: None)
        self._q: queue.Queue[str | None] = queue.Queue()
        self._thread = threading.Thread(target=self._run, name="tts", daemon=True)
        self._thread.start()

    def say(self, text: str) -> None:
        if text:
            self._q.put(text)

    def stop(self) -> None:
        self._q.put(None)

    def _run(self) -> None:
        import pythoncom
        import win32com.client

        pythoncom.CoInitialize()
        voice = win32com.client.Dispatch("SAPI.SpVoice")
        for v in voice.GetVoices():
            if self.voice_hint.lower() in v.GetDescription().lower():
                voice.Voice = v
                break
        voice.Rate = self.rate
        while True:
            text = self._q.get()
            if text is None:
                break
            try:
                self.on_state("speaking")
                voice.Speak(text)
            except Exception:
                log.exception("falha ao falar")
            finally:
                if self._q.empty():
                    self.on_state("idle")


def make_speaker(enabled: bool, voice_hint: str, rate: int, on_state: StateCallback | None = None) -> Speaker:
    if not enabled or sys.platform != "win32":
        return NullSpeaker()
    try:
        return SapiSpeaker(voice_hint, rate, on_state)
    except Exception:
        log.exception("TTS indisponível; seguindo sem voz")
        return NullSpeaker()
