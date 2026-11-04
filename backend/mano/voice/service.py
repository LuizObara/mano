"""Liga o microfone ao VoiceLoop e o VoiceLoop ao resto do Mano."""

from __future__ import annotations

import asyncio
import logging
import math
import queue
import struct
import sys
import threading
import time
import wave
from pathlib import Path
from typing import TYPE_CHECKING

from .loop import SAMPLE_RATE, VoiceConfig, VoiceLoop

if TYPE_CHECKING:
    from ..context import Ctx

log = logging.getLogger(__name__)

BLOCK = 1600  # 100 ms


def make_earcon(path: Path) -> Path:
    """Gera um 'plim' curto (duas notas) para indicar que o Mano está ouvindo."""
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    rate = 22050
    frames = bytearray()
    for freq, dur in ((660, 0.07), (990, 0.11)):
        n = int(rate * dur)
        for i in range(n):
            env = min(1.0, i / (rate * 0.005)) * (1 - i / n) ** 1.5
            frames += struct.pack("<h", int(9000 * env * math.sin(2 * math.pi * freq * i / rate)))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    return path


class VoiceService:
    def __init__(self, ctx: Ctx):
        self.ctx = ctx
        self.available = False
        self.reason = "desligada"
        self.loop: VoiceLoop | None = None
        self._q: queue.Queue[bytes] = queue.Queue(maxsize=200)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._stream = None
        self._muted_until = 0.0
        self._earcon: Path | None = None

    # ---------- ciclo de vida ----------

    async def start(self) -> None:
        s = self.ctx.settings
        if not s.voice_enabled:
            self.reason = "voz desativada na configuração"
            return
        if not (s.vosk_model_dir / "am" / "final.mdl").exists() and not (s.vosk_model_dir / "final.mdl").exists():
            self.reason = f"modelo de voz não encontrado em {s.vosk_model_dir} (rode scripts/get-models.ps1)"
            log.warning(self.reason)
            return
        try:
            model = await asyncio.to_thread(self._load_model, s.vosk_model_dir)
            self._open_mic()
        except Exception as e:  # sem microfone, driver etc.
            self.reason = f"não consegui abrir o microfone: {e}"
            log.exception("voz indisponível")
            return

        self._earcon = make_earcon(s.data_dir / "sounds" / "listen.wav")
        self.loop = VoiceLoop(
            model,
            VoiceConfig(
                wake_phrases=s.wake_phrases, wake_conf=s.wake_conf,
                listen_timeout_s=s.listen_timeout_s, max_utterance_s=s.max_utterance_s,
            ),
            on_command=self._on_command,
            on_state=self._on_state,
            on_partial=self._on_partial,
            on_wake=self._play_earcon,
            is_muted=self._is_muted,
        )
        self._thread = threading.Thread(target=self._run, name="voice", daemon=True)
        self._thread.start()
        self.available = True
        self.reason = "ok"
        log.info("voz ativa; frases de ativação: %s", ", ".join(s.wake_phrases))

    async def stop(self) -> None:
        self._stop.set()
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass

    def status(self) -> dict:
        return {
            "available": self.available,
            "reason": self.reason,
            "wake_phrases": self.ctx.settings.wake_phrases,
        }

    def listen_now(self) -> bool:
        if not self.loop:
            return False
        self._play_earcon()
        self.loop.listen_now()
        return True

    # ---------- internos ----------

    @staticmethod
    def _load_model(path: Path):
        from vosk import Model, SetLogLevel

        SetLogLevel(-1)
        return Model(str(path))

    def _open_mic(self) -> None:
        import sounddevice as sd

        def callback(indata, frames, time_info, status):  # thread de áudio
            try:
                self._q.put_nowait(bytes(indata))
            except queue.Full:
                pass  # processamento atrasado: descarta em vez de acumular latência

        self._stream = sd.RawInputStream(
            samplerate=SAMPLE_RATE, blocksize=BLOCK, channels=1, dtype="int16",
            device=self.ctx.settings.mic_device, callback=callback,
        )
        self._stream.start()

    def _run(self) -> None:
        assert self.loop
        while not self._stop.is_set():
            try:
                chunk = self._q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                self.loop.feed(chunk)
            except Exception:
                log.exception("erro no processamento de voz")

    def _is_muted(self) -> bool:
        now = time.monotonic()
        if self.ctx.speaker.busy:
            self._muted_until = now + 0.4  # rabicho de eco depois da fala
            return True
        return now < self._muted_until

    def _play_earcon(self) -> None:
        if sys.platform == "win32" and self._earcon:
            import winsound

            winsound.PlaySound(str(self._earcon), winsound.SND_FILENAME | winsound.SND_ASYNC)

    def _on_state(self, state: str) -> None:
        self.ctx.set_voice_state(state)

    def _on_partial(self, text: str) -> None:
        self.ctx.hub.broadcast_threadsafe("voice.partial", {"text": text})

    def _on_command(self, text: str) -> None:
        from ..commands import handle_command

        loop = self.ctx.hub.loop
        if loop is None:
            self.loop and self.loop.command_done()
            return
        fut = asyncio.run_coroutine_threadsafe(handle_command(self.ctx, text, source="voice", speak=True), loop)

        def done(_f) -> None:
            if not self.ctx.speaker.busy:
                self.ctx.set_voice_state("idle")
            if self.loop:
                self.loop.command_done()

        fut.add_done_callback(done)
