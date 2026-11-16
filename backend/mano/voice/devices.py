"""Microfone e alto-falante do Mano.

Lista os aparelhos de áudio, guarda a escolha **pelo nome** em `data/voice.json` (o índice do
PortAudio muda quando um fone Bluetooth conecta ou desconecta) e traduz o nome para o índice na
hora de abrir o microfone ou tocar um som.

O acesso ao hardware fica em `AudioHost`, trocado por um dublê nos testes (`AudioDevices.host`).
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

log = logging.getLogger(__name__)

# Onde procurar os aparelhos. DirectSound tem os nomes completos e aceita 16 kHz no microfone;
# o MME corta o nome em 31 caracteres e fica de reserva.
LIST_APIS = ("Windows DirectSound", "MME")
# Quem diz qual é o padrão do Windows com o nome inteiro.
DEFAULT_APIS = ("Windows WASAPI", "Windows DirectSound")
ALIASES = ("Microsoft Sound Mapper", "Driver de captura de som", "Driver de som prim", "Primary Sound")


class AudioHost:
    """Acesso ao PortAudio pelo sounddevice."""

    def query(self) -> tuple[list[dict], list[dict]]:
        import sounddevice as sd

        devices = [dict(d, index=i) for i, d in enumerate(sd.query_devices())]
        return devices, [dict(h) for h in sd.query_hostapis()]

    def reinit(self) -> None:
        """O PortAudio só enxerga aparelho novo depois de reiniciar (fecha os streams abertos)."""
        import sounddevice as sd

        sd._terminate()
        sd._initialize()


def _clean(name: str) -> str:
    return " ".join(str(name).split())


class AudioDevices:
    def __init__(self, cfg_path: Path, env_mic: int | str | None = None):
        self.cfg_path = cfg_path
        self.env_mic = env_mic  # MANO_MIC_DEVICE: vale quando nada foi escolhido na tela
        self._host: AudioHost | None = None
        self._lock = threading.RLock()
        cfg = self._load()
        self.input: str = cfg.get("mic_device") or ""
        self.output: str = cfg.get("out_device") or ""
        self.input_index: int | None = None
        self.output_index: int | None = None
        self.missing_input = False
        self.missing_output = False
        self._resolved = False

    # ---------- hardware ----------

    @property
    def host(self) -> AudioHost:
        if self._host is None:
            self._host = AudioHost()
        return self._host

    @host.setter
    def host(self, value) -> None:
        self._host = value
        self._resolved = False

    def scan(self) -> dict:
        """Aparelhos sem repetição: `{"inputs": [(nome, índice)], "outputs": [...], "default_input", "default_output", "all"}`."""
        with self._lock:
            try:
                devices, apis = self.host.query()
            except Exception:
                log.exception("não consegui listar os aparelhos de áudio")
                return {"inputs": [], "outputs": [], "default_input": None, "default_output": None, "all": []}

        by_name = {h["name"]: i for i, h in enumerate(apis)}
        api = next((by_name[n] for n in LIST_APIS if n in by_name), None)
        skip: set[int] = set()
        if api is not None and apis[api]["name"] == "Windows DirectSound":
            # os "Driver ... primário" são apelidos do padrão, não aparelhos
            skip = {apis[api].get("default_input_device", -1), apis[api].get("default_output_device", -1)}

        inputs: list[tuple[str, int]] = []
        outputs: list[tuple[str, int]] = []
        for d in devices:
            if api is not None and d["hostapi"] != api:
                continue
            name = _clean(d["name"])
            if d["index"] in skip or not name or name.startswith(ALIASES):
                continue
            if d["max_input_channels"] > 0 and name not in (n for n, _ in inputs):
                inputs.append((name, d["index"]))
            if d["max_output_channels"] > 0 and name not in (n for n, _ in outputs):
                outputs.append((name, d["index"]))

        def default(kind: str, items: list[tuple[str, int]]) -> str | None:
            key = f"default_{kind}_device"
            ordered = [by_name[n] for n in DEFAULT_APIS if n in by_name] + list(range(len(apis)))
            for i in ordered:
                idx = apis[i].get(key, -1)
                if idx is None or idx < 0 or idx >= len(devices) or idx in skip:
                    continue
                name = _clean(devices[idx]["name"])
                if name.startswith(ALIASES):
                    continue
                return next((n for n, _ in items if n == name), None) or next(
                    (n for n, _ in items if n.startswith(name)), name)
            return None

        return {
            "inputs": inputs,
            "outputs": outputs,
            "default_input": default("input", inputs),
            "default_output": default("output", outputs),
            "all": devices,
        }

    def _find(self, scan: dict, name: str, kind: str) -> int | None:
        """Nome → índice: igual na lista principal; senão um nome cortado (MME) que seja o começo dele."""
        for n, idx in scan["inputs" if kind == "input" else "outputs"]:
            if n == name:
                return idx
        ch = "max_input_channels" if kind == "input" else "max_output_channels"
        for d in scan["all"]:
            short = _clean(d["name"])
            if d[ch] > 0 and len(short) >= 8 and name.startswith(short):
                return d["index"]
        return None

    def resolve(self, scan: dict | None = None) -> None:
        """Recalcula os índices das escolhas salvas (aparelho sumido = padrão do Windows, sem perder a escolha)."""
        if not (self.input or self.output):
            self.input_index = self.output_index = None
            self.missing_input = self.missing_output = False
            self._resolved = True
            return
        scan = scan or self.scan()
        self.input_index = self._find(scan, self.input, "input") if self.input else None
        self.output_index = self._find(scan, self.output, "output") if self.output else None
        self.missing_input = bool(self.input) and self.input_index is None
        self.missing_output = bool(self.output) and self.output_index is None
        self._resolved = True

    def _ensure(self) -> None:
        if not self._resolved:
            self.resolve()

    def mic_device(self) -> int | str | None:
        """O que vai para o `sounddevice` ao abrir o microfone."""
        self._ensure()
        if self.input:
            return self.input_index
        return self.env_mic

    def out_device(self) -> int | None:
        self._ensure()
        return self.output_index

    def out_name(self) -> str | None:
        """Nome da saída em uso (para o SAPI), ou None = padrão do Windows."""
        self._ensure()
        return self.output if self.output and not self.missing_output else None

    def refresh(self) -> dict:
        """Procura aparelhos de novo (fone conectado depois de abrir o Mano)."""
        with self._lock:
            try:
                self.host.reinit()
            except Exception:
                log.exception("não consegui reiniciar o PortAudio")
        scan = self.scan()
        self.resolve(scan)
        return scan

    # ---------- escolha ----------

    def select(self, *, input: str | None = None, output: str | None = None) -> None:
        """`None` = não mexe; `""` = padrão do Windows. Nome que não existe agora → ValueError."""
        scan = self.scan()
        if input:
            if input not in (n for n, _ in scan["inputs"]):
                raise ValueError("Não encontrei esse microfone. Atualize a lista e tente de novo.")
        if output:
            if output not in (n for n, _ in scan["outputs"]):
                raise ValueError("Não encontrei esse alto-falante. Atualize a lista e tente de novo.")
        if input is not None:
            self.input = input
        if output is not None:
            self.output = output
        self._save()
        self.resolve(scan)

    def payload(self, scan: dict | None = None) -> dict:
        scan = scan or self.scan()
        if not self._resolved:
            self.resolve(scan)
        return {
            "inputs": [n for n, _ in scan["inputs"]],
            "outputs": [n for n, _ in scan["outputs"]],
            "default_input": scan["default_input"],
            "default_output": scan["default_output"],
            "input": self.input,
            "output": self.output,
            "missing_input": self.missing_input,
            "missing_output": self.missing_output,
        }

    # ---------- arquivo ----------

    def _load(self) -> dict:
        try:
            return json.loads(self.cfg_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _save(self) -> None:
        # voice.json também guarda o mic_muted do VoiceService: lê e mescla
        self.cfg_path.parent.mkdir(parents=True, exist_ok=True)
        data = {**self._load(), "mic_device": self.input, "out_device": self.output}
        self.cfg_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
