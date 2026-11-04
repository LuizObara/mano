from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import Settings
from .db import Database
from .events import Hub
from .voice.tts import Speaker

if TYPE_CHECKING:
    from .intents.registry import Registry


@dataclass
class Ctx:
    """Tudo que uma skill pode usar."""

    settings: Settings
    db: Database
    hub: Hub
    scheduler: AsyncIOScheduler
    speaker: Speaker
    registry: Registry = field(default=None)  # type: ignore[assignment]
    voice_state: str = "idle"  # idle | listening | thinking | speaking

    def set_voice_state(self, state: str) -> None:
        """Pode ser chamado de qualquer thread."""
        self.voice_state = state
        self.hub.broadcast_threadsafe("voice", {"state": state})

    async def notify(self, text: str, *, speak: bool = True, level: str = "info", title: str = "Mano",
                     toast: bool = True) -> None:
        """Aviso proativo do Mano (remédio, lembrete...): tela + voz + notificação do Windows."""
        await self.hub.broadcast("notice", {"text": text, "level": level, "title": title})
        if speak:
            self.speaker.say(text)
        if toast and self.settings.toast_enabled:
            from .notify import toast as show_toast

            show_toast(title, text)
