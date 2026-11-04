"""Hub de eventos: empurra o estado do Mano para todas as telas abertas via WebSocket."""

import asyncio
import logging

from fastapi import WebSocket

log = logging.getLogger(__name__)


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, type_: str, payload: dict | None = None) -> None:
        msg = {"type": type_, **(payload or {})}
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:  # cliente caiu
                self.clients.discard(ws)

    def broadcast_threadsafe(self, type_: str, payload: dict | None = None) -> None:
        """Para ser chamado de outras threads (ex.: a thread de fala)."""
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(type_, payload), self.loop)
