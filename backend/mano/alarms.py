"""Alarmes: como cada tipo de aviso toca (timer, remédio, lembrete, hábito).

Cada tipo tem som, volume, estilo (toque único ou contínuo até responder), voz, notificação do Windows
e repetição. Os ajustes ficam em data/alarms.json; o que não foi mexido vem do .env (MANO_TIMER_*,
MANO_MED_*). O som toca aqui no backend (winsound), então funciona com o visor fechado.

Os sons embutidos são gerados na hora (sem arquivo no repositório) e guardados já no volume pedido em
data/sounds/cache. Sons próprios (WAV) vão para data/sounds/custom.
"""

from __future__ import annotations

import array
import asyncio
import base64
import io
import json
import logging
import math
import re
import struct
import sys
import unicodedata
import wave
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from .context import Ctx

log = logging.getLogger(__name__)

RATE = 22050
KINDS = ("timer", "med", "reminder", "habit")
LABELS = {"timer": "Timer", "med": "Remédio", "reminder": "Lembrete", "habit": "Hábitos"}
SAMPLE_TEXT = {
    "timer": "Ei! O timer do teste terminou.",
    "med": "Teste: hora do remédio.",
    "reminder": "Teste de lembrete.",
    "habit": "Teste do lembrete de hábito.",
}
MAX_UPLOAD = 8 * 1024 * 1024
TEST_LOOP_S = 8  # o teste de um alarme contínuo para sozinho depois disso


# ---------- sons embutidos ----------

def _env(i: int, n: int, attack: float = 0.004, decay: float | None = None) -> float:
    a = min(1.0, i / max(1, int(RATE * attack)))
    if decay is None:
        return a * min(1.0, (n - i) / max(1, int(RATE * 0.01)))
    return a * math.exp(-i / (RATE * decay))


def _tone(freqs: list[tuple[float, float]], dur: float, decay: float | None = None, attack: float = 0.004) -> list[float]:
    """Soma de senoides (frequência, peso) com envelope."""
    n = int(RATE * dur)
    out = []
    for i in range(n):
        e = _env(i, n, attack, decay)
        out.append(e * sum(w * math.sin(2 * math.pi * f * i / RATE) for f, w in freqs))
    return out


def _silence(dur: float) -> list[float]:
    return [0.0] * int(RATE * dur)


def _mix_at(base: list[float], add: list[float], at: float) -> list[float]:
    start = int(RATE * at)
    if len(base) < start + len(add):
        base = base + [0.0] * (start + len(add) - len(base))
    for i, v in enumerate(add):
        base[start + i] += v
    return base


def _sino() -> list[float]:
    partials = [(880, 1.0), (1760, 0.45), (2428, 0.3), (4752, 0.12)]
    strike = _tone(partials, 1.6, decay=0.45, attack=0.002)
    return strike + _silence(0.5)


def _plim() -> list[float]:
    a = _tone([(660, 1), (1320, 0.2)], 0.12, decay=0.12)
    b = _tone([(990, 1), (1980, 0.2)], 0.35, decay=0.16)
    return a + b + _silence(0.6)


def _suave() -> list[float]:
    out: list[float] = []
    for k, f in enumerate((523.25, 659.25, 783.99)):
        out = _mix_at(out, _tone([(f, 1), (f * 4, 0.08)], 0.9, decay=0.25), k * 0.2)
    return out + _silence(0.5)


def _bipe() -> list[float]:
    beep = _tone([(1000, 1), (3000, 0.15)], 0.08)
    out: list[float] = []
    for _ in range(2):
        out += beep + _silence(0.07) + beep + _silence(0.07)
        out += _silence(0.25)
    return out + _silence(0.3)


def _despertador() -> list[float]:
    """Campainha de despertador: duas notas alternando rápido, em rajadas."""
    out: list[float] = []
    for _ in range(2):
        n = int(RATE * 0.6)
        burst = []
        for i in range(n):
            f = 1400 if (i // int(RATE / 24)) % 2 == 0 else 1750
            burst.append(_env(i, n) * (math.sin(2 * math.pi * f * i / RATE) + 0.25 * math.sin(2 * math.pi * 3 * f * i / RATE)))
        out += burst + _silence(0.25)
    return out + _silence(0.2)


def _cristal() -> list[float]:
    chord = _tone([(1318.5, 1), (1568, 0.8), (2093, 0.6), (2637, 0.2)], 1.3, decay=0.35, attack=0.003)
    return chord + _silence(0.4)


BUILTIN: dict[str, tuple[str, object]] = {
    "sino": ("Sino", _sino),
    "despertador": ("Despertador", _despertador),
    "bipe": ("Bipe digital", _bipe),
    "plim": ("Plim", _plim),
    "suave": ("Suave", _suave),
    "cristal": ("Cristal", _cristal),
}


def _gain(volume: int) -> float:
    """0–100 → ganho. Curva para o meio do controle não soar quase no máximo."""
    v = max(0, min(100, volume)) / 100
    return v ** 1.7


def _write_wav(path: Path, samples: list[float] | array.array, volume: int, channels: int = 1, rate: int = RATE,
               normalize: bool = True) -> None:
    peak = max((abs(s) for s in samples), default=1.0) or 1.0
    g = _gain(volume) * (0.9 / peak if normalize else 1.0)
    data = array.array("h", (max(-32767, min(32767, int(s * g * (32767 if normalize else 1)))) for s in samples))
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data.tobytes())


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def slugify(name: str) -> str:
    base = unicodedata.normalize("NFKD", Path(name).stem).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:40] or "som"


# ---------- tocador ----------

class SoundPlayer:
    """Toca WAV pelo winsound. `played` guarda o que foi pedido (útil nos testes, onde o som fica desligado)."""

    def __init__(self, data_dir: Path, enabled: bool):
        self.dir = data_dir / "sounds"
        self.enabled = enabled and sys.platform == "win32"
        self.played: list[tuple[str, int, bool]] = []
        self.looping = False

    @property
    def custom_dir(self) -> Path:
        return self.dir / "custom"

    def sounds(self) -> list[dict]:
        out = [{"id": k, "label": label, "custom": False} for k, (label, _) in BUILTIN.items()]
        if self.custom_dir.exists():
            for p in sorted(self.custom_dir.glob("*.wav")):
                out.append({"id": f"custom:{p.stem}", "label": p.stem.replace("-", " ").capitalize(), "custom": True})
        return out

    def exists(self, sound: str) -> bool:
        return sound == "none" or any(s["id"] == sound for s in self.sounds())

    def path_for(self, sound: str, volume: int) -> Path | None:
        if sound == "none" or volume <= 0:
            return None
        vol = max(0, min(100, int(volume)))
        if sound.startswith("custom:"):
            slug = sound.split(":", 1)[1]
            src = self.custom_dir / f"{slug}.wav"
            if not src.exists():
                return None
            out = self.dir / "cache" / f"custom-{slug}-{vol}.wav"
            if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
                with wave.open(str(src), "rb") as w:
                    ch, rate = w.getnchannels(), w.getframerate()
                    data = array.array("h", w.readframes(w.getnframes()))
                if sys.byteorder == "big":
                    data.byteswap()
                _write_wav(out, data, vol, channels=ch, rate=rate, normalize=False)
            return out
        if sound not in BUILTIN:
            return None
        out = self.dir / "cache" / f"{sound}-{vol}.wav"
        if not out.exists():
            _write_wav(out, BUILTIN[sound][1](), vol)  # type: ignore[operator]
        return out

    def play(self, sound: str, volume: int, loop: bool = False) -> float:
        """Toca e devolve a duração (0 quando não tocou de verdade)."""
        self.played.append((sound, volume, loop))
        if not self.enabled:
            return 0.0
        try:
            path = self.path_for(sound, volume)
            if path is None:
                return 0.0
            import winsound

            flags = winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT
            if loop:
                flags |= winsound.SND_LOOP
            winsound.PlaySound(str(path), flags)
            self.looping = loop
            return wav_duration(path)
        except Exception:
            log.exception("não consegui tocar o som %s", sound)
            return 0.0

    def stop(self) -> None:
        self.looping = False
        if not self.enabled:
            return
        try:
            import winsound

            winsound.PlaySound(None, 0)
        except Exception:
            log.exception("não consegui parar o som")


# ---------- configuração ----------

Style = Literal["once", "loop"]


class KindCfg(BaseModel):
    sound: str = "sino"
    volume: int = Field(80, ge=0, le=100)
    style: Style = "once"  # toque único a cada aviso | contínuo até responder
    speak: bool = True  # fala o aviso
    toast: bool = True  # notificação do Windows
    repeat: bool = True  # repete o aviso até responder
    every_s: int = Field(300, ge=10, le=3600)
    stop_after_s: int = Field(1800, ge=60, le=43200)
    snooze_min: int = Field(10, ge=1, le=240)  # "adiar" (remédio)


class KindPatch(BaseModel):
    sound: str | None = None
    volume: int | None = Field(None, ge=0, le=100)
    style: Style | None = None
    speak: bool | None = None
    toast: bool | None = None
    repeat: bool | None = None
    every_s: int | None = Field(None, ge=10, le=3600)
    stop_after_s: int | None = Field(None, ge=60, le=43200)
    snooze_min: int | None = Field(None, ge=1, le=240)


class QuietCfg(BaseModel):
    enabled: bool = False
    start: str = Field("22:30", pattern=r"^\d{2}:\d{2}$")
    end: str = Field("07:00", pattern=r"^\d{2}:\d{2}$")
    meds_ring: bool = True  # remédio toca mesmo no silencioso


class PreviewIn(BaseModel):
    sound: str
    volume: int = Field(80, ge=0, le=100)


class UploadIn(BaseModel):
    name: str
    data: str  # base64 do arquivo .wav


def _hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


class Alarms:
    def __init__(self, ctx: Ctx):
        self.ctx = ctx
        s = ctx.settings
        self.path = s.data_dir / "alarms.json"
        self.player = SoundPlayer(s.data_dir, s.sound_enabled)
        self.defaults: dict[str, KindCfg] = {
            "timer": KindCfg(sound="despertador", volume=80, style="loop", every_s=max(10, s.timer_ring_repeat_s),
                             stop_after_s=max(60, s.timer_ring_max_s)),
            "med": KindCfg(sound="sino", volume=80, every_s=max(60, s.med_repeat_min * 60),
                           stop_after_s=max(60, s.med_give_up_min * 60), snooze_min=s.med_snooze_min),
            "reminder": KindCfg(sound="plim", volume=70, repeat=False, every_s=300, stop_after_s=1800),
            "habit": KindCfg(sound="suave", volume=40, speak=False, repeat=False),
        }
        self.kinds: dict[str, KindCfg] = dict(self.defaults)
        self.quiet = QuietCfg()
        self._loops: set[str] = set()  # tipos com som contínuo tocando agora
        self._tasks: set[asyncio.Task] = set()
        self._load()

    # ---------- persistência ----------

    def _load(self) -> None:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        for k in KINDS:
            if isinstance(raw.get(k), dict):
                try:
                    self.kinds[k] = KindCfg(**{**self.defaults[k].model_dump(), **raw[k]})
                except ValueError:
                    log.warning("ajuste de alarme inválido em %s: %s", self.path, k)
        try:
            self.quiet = QuietCfg(**raw.get("quiet", {}))
        except ValueError:
            pass

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {k: v.model_dump() for k, v in self.kinds.items()}
        data["quiet"] = self.quiet.model_dump()
        self.path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def cfg(self, kind: str) -> KindCfg:
        return self.kinds[kind]

    def snapshot(self) -> dict:
        return {
            "kinds": {k: v.model_dump() for k, v in self.kinds.items()},
            "defaults": {k: v.model_dump() for k, v in self.defaults.items()},
            "labels": LABELS,
            "quiet": self.quiet.model_dump(),
            "quiet_now": self.quiet_now("timer"),
            "sounds": self.player.sounds(),
            "sound_enabled": self.player.enabled,
            "toast_enabled": self.ctx.settings.toast_enabled,
            "voice_enabled": self.ctx.settings.tts_enabled,
        }

    def update(self, kind: str, patch: KindPatch) -> KindCfg:
        changes = patch.model_dump(exclude_none=True)
        if "sound" in changes and not self.player.exists(changes["sound"]):
            raise ValueError("Som não encontrado.")
        self.kinds[kind] = KindCfg(**{**self.kinds[kind].model_dump(), **changes})
        self._save()
        return self.kinds[kind]

    def reset(self, kind: str) -> KindCfg:
        self.kinds[kind] = self.defaults[kind]
        self._save()
        return self.kinds[kind]

    def set_quiet(self, q: QuietCfg) -> None:
        self.quiet = q
        self._save()

    # ---------- horário silencioso ----------

    def quiet_now(self, kind: str, now: datetime | None = None) -> bool:
        q = self.quiet
        if not q.enabled or (kind == "med" and q.meds_ring):
            return False
        now = now or datetime.now()
        t, a, b = now.hour * 60 + now.minute, _hm(q.start), _hm(q.end)
        return a <= t < b if a <= b else (t >= a or t < b)

    # ---------- tocar ----------

    def _spawn(self, coro) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def ring(self, kind: str, text: str, *, title: str, notice: bool = True, level: str = "alert",
                   now: datetime | None = None, test: bool = False) -> None:
        """Um aviso: tela, notificação do Windows, som e voz, conforme os ajustes do tipo."""
        c = self.kinds[kind]
        quiet = not test and self.quiet_now(kind, now)
        if notice:
            await self.ctx.hub.broadcast("notice", {"text": text, "level": level, "title": title})
        if c.toast and (self.ctx.settings.toast_enabled or test):
            from .notify import toast

            toast(title, text, silent=c.sound != "none" and not quiet)
        sound = c.sound != "none" and c.volume > 0 and not quiet
        speak = c.speak and not quiet
        loop = sound and c.style == "loop"
        if loop:
            self._loops.add(kind)
            if test:
                self._spawn(self._end_test(kind))
            if not speak:
                self.player.play(c.sound, c.volume, loop=True)
                return
            # contínuo + voz: um toque, a fala e depois o som volta em repetição até responder
            dur = self.player.play(c.sound, c.volume)
            if not dur:
                self.ctx.speaker.say(text)
            self._spawn(self._after_sound(kind, text if dur else "", dur, resume=True))
            return
        dur = self.player.play(c.sound, c.volume) if sound else 0.0
        if speak and dur:
            self._spawn(self._after_sound(kind, text, dur, resume=bool(self._loops)))
        else:
            if speak:
                self.ctx.speaker.say(text)
            if dur and self._loops:  # o toque único cortou um contínuo: volta com ele depois
                self._spawn(self._after_sound(kind, "", dur, resume=True))

    async def _after_sound(self, kind: str, text: str, dur: float, resume: bool) -> None:
        """Fala depois do som (para não embolar) e, se tiver alarme contínuo ativo, volta a tocar ele."""
        await asyncio.sleep(min(dur, 3.0))
        if text:
            self.ctx.speaker.say(text)
            await asyncio.sleep(0.3)
            for _ in range(100):  # até ~20 s
                if not self.ctx.speaker.busy:
                    break
                await asyncio.sleep(0.2)
        if resume and self._loops and self.player.enabled:
            c = self.kinds[next(iter(self._loops))]
            self.player.play(c.sound, c.volume, loop=True)

    async def _end_test(self, kind: str) -> None:
        await asyncio.sleep(TEST_LOOP_S)
        self.stop(kind)

    def chime(self, kind: str = "habit") -> None:
        """Só o som (lembrete de hábito), respeitando o horário silencioso."""
        c = self.kinds[kind]
        if c.sound != "none" and c.volume > 0 and not self.quiet_now(kind):
            if not self.player.looping:  # não corta um alarme contínuo tocando
                self.player.play(c.sound, c.volume)

    def stop(self, kind: str) -> None:
        """Para o som contínuo deste tipo (quando o aviso foi respondido)."""
        if kind not in self._loops:
            return
        self._loops.discard(kind)
        if self._loops:
            other = next(iter(self._loops))
            c = self.kinds[other]
            self.player.play(c.sound, c.volume, loop=True)
        else:
            self.player.stop()

    def stop_all(self) -> int:
        n = len(self._loops)
        self._loops.clear()
        self.player.stop()
        return n

    # ---------- sons próprios ----------

    def add_sound(self, name: str, raw: bytes) -> str:
        if len(raw) > MAX_UPLOAD:
            raise ValueError("Arquivo grande demais (máximo 8 MB).")
        try:
            with wave.open(io.BytesIO(raw), "rb") as w:
                if w.getsampwidth() != 2 or w.getcomptype() != "NONE":
                    raise ValueError("Use um WAV PCM de 16 bits (dá para converter no Audacity: Exportar → WAV 16 bits).")
                if w.getnframes() / w.getframerate() > 120:
                    raise ValueError("Som longo demais (máximo 2 minutos).")
        except (wave.Error, EOFError, struct.error):
            raise ValueError("Esse arquivo não é um WAV válido. Por enquanto o Mano só toca .wav.") from None
        slug = slugify(name)
        dest = self.player.custom_dir / f"{slug}.wav"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
        for f in (self.player.dir / "cache").glob(f"custom-{slug}-*.wav"):
            f.unlink(missing_ok=True)
        return f"custom:{slug}"

    def remove_sound(self, slug: str) -> None:
        (self.player.custom_dir / f"{slug}.wav").unlink(missing_ok=True)
        for f in (self.player.dir / "cache").glob(f"custom-{slug}-*.wav"):
            f.unlink(missing_ok=True)
        changed = False
        for k, c in self.kinds.items():
            if c.sound == f"custom:{slug}":
                self.kinds[k] = c.model_copy(update={"sound": self.defaults[k].sound})
                changed = True
        if changed:
            self._save()

    async def _changed(self, kind: str) -> None:
        """O "Adiar N min" da faixa de alerta vem do snapshot dos remédios."""
        meds = self.ctx.skill("remédios") if kind == "med" else None
        if meds is not None:
            await meds._push()

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/alarms", tags=["alarmes"])

        def check(kind: str) -> None:
            if kind not in KINDS:
                raise HTTPException(404, "tipo de alarme desconhecido")

        @r.get("")
        async def get_all():
            return self.snapshot()

        @r.put("/quiet")
        async def put_quiet(body: QuietCfg):
            self.set_quiet(body)
            return self.snapshot()

        @r.post("/preview")
        async def preview(body: PreviewIn):
            if not self.player.exists(body.sound):
                raise HTTPException(404, "Som não encontrado.")
            dur = self.player.play(body.sound, body.volume)
            if dur and self._loops:  # a prévia cortou um alarme tocando: ele volta depois
                self._spawn(self._after_sound("", "", dur, resume=True))
            return {"duration": dur}

        @r.post("/stop")
        async def stop():
            return {"stopped": self.stop_all()}

        @r.post("/sounds")
        async def upload(body: UploadIn):
            try:
                raw = base64.b64decode(body.data.split(",", 1)[-1], validate=False)
                sound = self.add_sound(body.name, raw)
            except ValueError as e:
                raise HTTPException(400, str(e)) from None
            return {"sound": sound, **self.snapshot()}

        @r.delete("/sounds/{slug}")
        async def delete_sound(slug: str):
            self.remove_sound(slugify(slug))
            return self.snapshot()

        @r.put("/{kind}")
        async def put_kind(kind: str, body: KindPatch):
            check(kind)
            try:
                self.update(kind, body)
            except ValueError as e:
                raise HTTPException(400, str(e)) from None
            await self._changed(kind)
            return self.snapshot()

        @r.post("/{kind}/reset")
        async def reset(kind: str):
            check(kind)
            self.reset(kind)
            await self._changed(kind)
            return self.snapshot()

        @r.post("/{kind}/test")
        async def test(kind: str):
            check(kind)
            if kind == "habit":
                c = self.kinds[kind]
                dur = self.player.play(c.sound, c.volume) if c.sound != "none" else 0.0
                await self.ctx.hub.broadcast("notice", {"text": SAMPLE_TEXT[kind], "level": "info", "title": "Teste"})
                return {"ok": True, "duration": dur}
            await self.ring(kind, SAMPLE_TEXT[kind], title=f"Teste: {LABELS[kind].lower()}", test=True)
            c = self.kinds[kind]
            return {"ok": True, "loop": c.style == "loop" and c.sound != "none", "stop_in": TEST_LOOP_S}

        return r
