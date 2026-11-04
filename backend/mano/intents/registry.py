"""Registro de skills e roteamento de comandos.

Cada skill é uma classe com métodos marcados por `@intent(...)`. Voz, barra de comando e
botões da UI caem no mesmo handler. A ordem de checagem segue `priority` (maior primeiro).
"""

from __future__ import annotations

import inspect
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter

from .ptbr import normalize

if TYPE_CHECKING:
    from ..context import Ctx


@dataclass
class Reply:
    speech: str
    display: str | None = None  # texto para a tela, se diferente do falado
    data: dict[str, Any] | None = None


Matcher = Callable[[str], dict | None]
Handler = Callable[[dict], Awaitable[Reply]]


@dataclass
class Intent:
    name: str
    handler: Handler
    patterns: list[re.Pattern] = field(default_factory=list)
    matcher: Matcher | None = None
    examples: list[str] = field(default_factory=list)
    priority: int = 0

    def match(self, text: str) -> dict | None:
        for p in self.patterns:
            m = p.search(text)
            if m:
                return {k: v for k, v in m.groupdict().items() if v is not None}
        if self.matcher:
            return self.matcher(text)
        return None


def intent(
    name: str,
    patterns: list[str] | None = None,
    examples: list[str] | None = None,
    priority: int = 0,
    matcher: str | None = None,
):
    """Marca um método da skill como handler de uma intenção.

    `patterns` são regex aplicadas ao texto normalizado (minúsculo, sem acento, números em dígitos).
    `matcher` é o nome de um método da skill que recebe o texto e devolve slots ou None.
    """

    def deco(fn):
        fn.__intent__ = {
            "name": name,
            "patterns": [re.compile(p) for p in (patterns or [])],
            "examples": examples or [],
            "priority": priority,
            "matcher": matcher,
        }
        return fn

    return deco


class Skill:
    name: str = "skill"
    description: str = ""

    def __init__(self, ctx: Ctx):
        self.ctx = ctx

    def router(self) -> APIRouter | None:
        return None

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    def snapshot(self) -> dict:
        """Estado inicial enviado a cada tela que conecta (mesclado na mensagem 'hello')."""
        return {}

    async def dismiss_alerts(self) -> int:
        """Responde ao "para"/"ok": dispensa avisos tocando. Retorna quantos dispensou."""
        return 0

    def intents(self) -> list[Intent]:
        found = []
        # varre a classe (não a instância) para não disparar @property das skills
        for attr, raw in inspect.getmembers(type(self), predicate=inspect.isfunction):
            meta = getattr(raw, "__intent__", None)
            if not meta:
                continue
            fn = getattr(self, attr)
            found.append(
                Intent(
                    name=meta["name"],
                    handler=fn,
                    patterns=meta["patterns"],
                    matcher=getattr(self, meta["matcher"]) if meta["matcher"] else None,
                    examples=meta["examples"],
                    priority=meta["priority"],
                )
            )
        return found


@dataclass
class Match:
    intent: Intent
    slots: dict
    text: str


class Registry:
    def __init__(self) -> None:
        self.skills: list[Skill] = []
        self._intents: list[Intent] = []

    def add(self, skill: Skill) -> None:
        self.skills.append(skill)
        self._intents.extend(skill.intents())
        self._intents.sort(key=lambda i: -i.priority)

    def parse(self, raw: str) -> Match | None:
        text = normalize(raw)
        if not text:
            return None
        for it in self._intents:
            slots = it.match(text)
            if slots is not None:
                slots["_raw"] = raw  # frase original, para recuperar acentos
                return Match(it, slots, text)
        return None

    def catalog(self) -> list[dict]:
        return [
            {"skill": s.name, "description": s.description,
             "intents": [{"name": i.name, "examples": i.examples} for i in s.intents()]}
            for s in self.skills
        ]
