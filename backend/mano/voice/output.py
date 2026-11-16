"""Toca WAV num alto-falante escolhido (o winsound só toca no padrão do Windows)."""

from __future__ import annotations

import logging
import threading
import wave
from pathlib import Path

log = logging.getLogger(__name__)


class WavPlayer:
    """Um som por vez, como o winsound: tocar de novo corta o anterior. Sem numpy (RawOutputStream)."""

    def __init__(self) -> None:
        self._stream = None
        self._lock = threading.Lock()
        self.looping = False

    def play(self, path: Path, device: int | None, loop: bool = False) -> float:
        """Toca e devolve a duração em segundos. Lança exceção se o aparelho não abrir."""
        import sounddevice as sd

        with wave.open(str(path), "rb") as w:
            channels, rate, width = w.getnchannels(), w.getframerate(), w.getsampwidth()
            data = w.readframes(w.getnframes())
        if width != 2:
            raise ValueError(f"{path.name}: só WAV de 16 bits")
        if not data:
            return 0.0
        frame = channels * 2
        pos = 0

        def callback(outdata, frames, time_info, status):  # thread de áudio
            nonlocal pos
            need = frames * frame
            out = bytearray()
            while len(out) < need:
                take = data[pos:pos + need - len(out)]
                out += take
                pos += len(take)
                if pos >= len(data):
                    if not loop:
                        break
                    pos = 0
            if len(out) < need:
                outdata[:] = bytes(out) + b"\x00" * (need - len(out))
                raise sd.CallbackStop
            outdata[:] = bytes(out)

        with self._lock:
            self._close()
            stream = sd.RawOutputStream(samplerate=rate, channels=channels, dtype="int16", device=device,
                                        callback=callback)
            stream.start()
            self._stream = stream
            self.looping = loop
        return len(data) / frame / rate

    def stop(self) -> None:
        with self._lock:
            self._close()

    def _close(self) -> None:
        self.looping = False
        s, self._stream = self._stream, None
        if s is not None:
            try:
                s.abort()
                s.close()
            except Exception:
                log.debug("falha ao fechar o som", exc_info=True)
