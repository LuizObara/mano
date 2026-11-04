"""Máquina de estados da voz: espera a frase de ativação → escuta o comando → despacha.

Não sabe nada de microfone nem de asyncio: recebe blocos de áudio PCM 16 kHz mono int16 via
`feed()` e chama callbacks. Isso permite testar com arquivos WAV.

Ativação: um reconhecedor Vosk com gramática restrita às frases de ativação roda o tempo todo
(barato). Quando ele confirma "fala mano" com confiança suficiente, um reconhecedor livre assume.
O áudio dos últimos segundos fica num buffer, então "fala mano que horas são" dito de uma vez
também funciona: o trecho depois de "mano" é reaproveitado.
"""

from __future__ import annotations

import json
import logging
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass

log = logging.getLogger(__name__)

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2


@dataclass
class VoiceConfig:
    wake_phrases: list[str]
    wake_conf: float = 0.75
    listen_timeout_s: float = 6.0  # sem fala nenhuma depois da ativação → desiste
    max_utterance_s: float = 15.0
    buffer_s: float = 12.0


def find_wake(result: dict, phrases: list[list[str]], min_conf: float) -> float | None:
    """Procura uma frase de ativação (palavras consecutivas) no resultado do Vosk.

    Retorna o instante (s) em que a frase termina, ou None.
    """
    words = result.get("result") or []
    for i in range(len(words)):
        for phrase in phrases:
            chunk = words[i : i + len(phrase)]
            if len(chunk) == len(phrase) and all(
                w["word"] == p and w.get("conf", 0) >= min_conf for w, p in zip(chunk, phrase)
            ):
                return float(chunk[-1]["end"])
    return None


class VoiceLoop:
    WAKE, LISTEN, BUSY = "wake", "listen", "busy"

    def __init__(
        self,
        model,
        config: VoiceConfig,
        *,
        on_command: Callable[[str], None],
        on_state: Callable[[str], None] = lambda s: None,
        on_partial: Callable[[str], None] = lambda t: None,
        on_wake: Callable[[], None] = lambda: None,
        is_muted: Callable[[], bool] = lambda: False,
        recognizer_factory=None,
    ):
        from vosk import KaldiRecognizer

        self._kaldi = recognizer_factory or KaldiRecognizer
        self.model = model
        self.cfg = config
        self.phrases = [p.split() for p in config.wake_phrases]
        self._grammar = json.dumps(config.wake_phrases + ["[unk]"], ensure_ascii=False)
        self.on_command = on_command
        self.on_state = on_state
        self.on_partial = on_partial
        self.on_wake = on_wake
        self.is_muted = is_muted

        self.mode = self.WAKE
        self.total = 0  # amostras recebidas desde o início
        self._buffer: deque[tuple[int, bytes]] = deque()
        self._force_listen = threading.Event()
        self._done = threading.Event()
        self._reset_wake()

    # ---------- controle externo (thread-safe) ----------

    def listen_now(self) -> None:
        """Push-to-talk: pula a ativação."""
        self._force_listen.set()

    def command_done(self) -> None:
        """Chamado quando o comando despachado terminou."""
        self._done.set()

    # ---------- entrada de áudio ----------

    def feed(self, chunk: bytes) -> None:
        if self._done.is_set():
            self._done.clear()
            self.mode = self.WAKE
            self._reset_wake()

        start = self.total
        self.total += len(chunk) // BYTES_PER_SAMPLE

        if self.mode == self.BUSY:
            return
        if self.is_muted():
            # o Mano está falando: ignora o próprio eco
            if self.mode == self.WAKE:
                self._reset_wake()
            return
        if self._force_listen.is_set():
            self._force_listen.clear()
            self._start_listen(replay_from=None)

        if self.mode == self.WAKE:
            self._remember(start, chunk)
            self._feed_wake(chunk)
        elif self.mode == self.LISTEN:
            self._feed_listen(chunk)

    # ---------- ativação ----------

    def _reset_wake(self) -> None:
        self._wake = self._kaldi(self.model, SAMPLE_RATE, self._grammar)
        self._wake.SetWords(True)
        self._wake_base = self.total
        self._buffer.clear()

    def _remember(self, start: int, chunk: bytes) -> None:
        self._buffer.append((start, chunk))
        limit = self.total - int(self.cfg.buffer_s * SAMPLE_RATE)
        while self._buffer and self._buffer[0][0] + len(self._buffer[0][1]) // BYTES_PER_SAMPLE < limit:
            self._buffer.popleft()

    def _feed_wake(self, chunk: bytes) -> None:
        if not self._wake.AcceptWaveform(chunk):
            return
        result = json.loads(self._wake.Result())
        end = find_wake(result, self.phrases, self.cfg.wake_conf)
        if end is None:
            return
        log.info("ativação detectada: %s", result.get("text"))
        replay_from = self._wake_base + int(end * SAMPLE_RATE)
        self.on_wake()
        self._start_listen(replay_from=replay_from)

    # ---------- escuta do comando ----------

    def _start_listen(self, replay_from: int | None) -> None:
        self.mode = self.LISTEN
        self._cmd = self._kaldi(self.model, SAMPLE_RATE)
        self._listen_start = self.total
        self._heard = False
        self._last_partial = ""
        self.on_state("listening")
        if replay_from is None:
            self._buffer.clear()
            return
        # reaproveita o que foi dito logo depois da frase de ativação
        pending = list(self._buffer)
        self._buffer.clear()
        for start, chunk in pending:
            n = len(chunk) // BYTES_PER_SAMPLE
            if start + n <= replay_from:
                continue
            if start < replay_from:
                chunk = chunk[(replay_from - start) * BYTES_PER_SAMPLE :]
            if self.mode != self.LISTEN:
                break
            self._feed_listen(chunk, live=False)

    def _feed_listen(self, chunk: bytes, live: bool = True) -> None:
        if self._cmd.AcceptWaveform(chunk):
            text = json.loads(self._cmd.Result()).get("text", "").strip()
            if text:
                self._dispatch(text)
                return
        else:
            partial = json.loads(self._cmd.PartialResult()).get("partial", "").strip()
            if partial:
                self._heard = True
                if partial != self._last_partial:
                    self._last_partial = partial
                    self.on_partial(partial)

        if not live:
            return
        elapsed = (self.total - self._listen_start) / SAMPLE_RATE
        if not self._heard and elapsed > self.cfg.listen_timeout_s:
            log.info("nada ouvido depois da ativação")
            self.mode = self.WAKE
            self._reset_wake()
            self.on_state("idle")
        elif elapsed > self.cfg.max_utterance_s:
            text = json.loads(self._cmd.FinalResult()).get("text", "").strip()
            if text:
                self._dispatch(text)
            else:
                self.mode = self.WAKE
                self._reset_wake()
                self.on_state("idle")

    def flush(self) -> None:
        """Fim do áudio (usado em testes com arquivo): finaliza o que estiver em escuta."""
        if self.mode == self.LISTEN:
            text = json.loads(self._cmd.FinalResult()).get("text", "").strip()
            if text:
                self._dispatch(text)

    def _dispatch(self, text: str) -> None:
        log.info("comando por voz: %s", text)
        self.mode = self.BUSY
        self.on_state("thinking")
        self.on_command(text)
