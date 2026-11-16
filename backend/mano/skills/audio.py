"""Ajustes → Voz e áudio: qual microfone o Mano escuta e em qual alto-falante ele fala e toca os alarmes.

A lista, a escolha e o arquivo ficam em `mano/voice/devices.py` (`ctx.audio`); aqui só as rotas e a
aplicação da escolha no microfone (VoiceService), na voz (SAPI) e nos alarmes (SoundPlayer).
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..intents.registry import Skill

TEST_PHRASE = "Assim que eu soo neste aparelho."
LEVEL_PATH = "/api/audio/level"


class QuietLevel(logging.Filter):
    """Tira do log de acesso a consulta do nível do microfone (o visor pede várias vezes por segundo)."""

    def filter(self, record: logging.LogRecord) -> bool:
        return LEVEL_PATH not in record.getMessage()


def quiet_level_log() -> None:
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, QuietLevel) for f in access.filters):
        access.addFilter(QuietLevel())


class AudioIn(BaseModel):
    input: str | None = None  # "" = padrão do Windows; ausente = não muda
    output: str | None = None


class AudioSkill(Skill):
    name = "áudio"
    description = "Microfone e alto-falante"

    def payload(self) -> dict:
        voice = self.ctx.voice
        return {
            **self.ctx.audio.payload(),
            "voice_available": bool(voice and voice.available),
        }

    # Sem snapshot(): listar aparelhos consulta o PortAudio, e o visor só precisa disso na seção
    # Voz e áudio (GET /api/audio ao abrir; mudanças chegam pelo evento `audio`).

    def apply_output(self) -> None:
        audio = self.ctx.audio
        self.ctx.alarms.player.set_device(audio.out_device())
        self.ctx.speaker.set_output(audio.out_name())

    async def start(self) -> None:
        quiet_level_log()
        if self.ctx.audio.output:
            await asyncio.to_thread(self.apply_output)

    async def _announce(self) -> dict:
        data = await asyncio.to_thread(self.payload)
        await self.ctx.hub.broadcast("audio", {"audio": data})
        return data

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/audio")

        @r.get("")
        async def get_audio():
            return await asyncio.to_thread(self.payload)

        @r.put("")
        async def put_audio(body: AudioIn):
            audio = self.ctx.audio
            old_input = audio.mic_device()
            try:
                await asyncio.to_thread(audio.select, input=body.input, output=body.output)
            except ValueError as e:
                raise HTTPException(400, str(e)) from e
            error = None
            if body.input is not None and self.ctx.voice and audio.mic_device() != old_input:
                error = await asyncio.to_thread(self.ctx.voice.reopen_mic)
            if body.output is not None:
                await asyncio.to_thread(self.apply_output)
            data = await self._announce()
            return {**data, "error": error}

        @r.post("/refresh")
        async def refresh():
            audio = self.ctx.audio
            voice = self.ctx.voice
            if voice:
                # o PortAudio reinicia com o microfone fechado e o reabre em seguida
                await asyncio.to_thread(voice.reopen_mic, audio.refresh)
            else:
                await asyncio.to_thread(audio.refresh)
            await asyncio.to_thread(self.apply_output)
            return await self._announce()

        @r.get(LEVEL_PATH.removeprefix("/api/audio"))
        async def level():
            voice = self.ctx.voice
            return {"level": round(voice.level, 3) if voice and voice.available else 0.0}

        @r.post("/test")
        async def test():
            self.ctx.alarms.player.play("plim", 70)
            self.ctx.speaker.say(TEST_PHRASE)
            return {"ok": True}

        return r
