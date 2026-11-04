"""Plano B para frases que as regras não entenderam: o LLM local reescreve o pedido no formato
de um dos comandos conhecidos e o texto passa de novo pelas regras.

Assim o LLM nunca executa nada por conta própria: ele só traduz ("bota um som do Caetano" →
"toca Caetano"), e quem decide e executa continua sendo o parser de regras.
O catálogo vai sempre igual no começo do prompt, para o Ollama reaproveitar o cache entre pedidos.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..llm import LLM
    from .registry import Registry

# intenções que dependem de contexto (algo tocando) ou não fazem sentido como palpite
SKIP = {"meds.snooze", "alerts.dismiss", "meds.taken", "meds.skip"}

SCHEMA = {"type": "object", "properties": {"comando": {"type": "string"}}, "required": ["comando"]}

SHOTS = [
    ("quero ouvir um rock", "toca rock"),
    ("me acorda daqui a vinte minutos", "timer de 20 minutos"),
    ("o que rola na minha agenda amanhã", "o que eu tenho amanhã?"),
    ("tira essa música", "próxima música"),
    ("conta uma piada", ""),
]


def build_system(registry: Registry) -> str:
    examples: list[str] = []
    for skill in registry.catalog():
        for it in skill["intents"]:
            if it["name"] in SKIP:
                continue
            examples += [e for e in it["examples"] if "(" not in e]
    lines = "\n".join(f"- {e}" for e in examples)
    shots = "\n".join(f'Pedido: {p}\n{{"comando": "{c}"}}' for p, c in SHOTS)
    return (
        "Você traduz pedidos falados em português do Brasil para os comandos de um assistente pessoal.\n"
        "Formatos de comando que o assistente entende (os valores são só exemplos):\n"
        f"{lines}\n\n"
        "Regras:\n"
        "- Responda só com JSON no formato {\"comando\": \"...\"}.\n"
        "- Copie a estrutura de UM formato acima e troque os valores pelos do pedido "
        "(nomes, músicas, números, horários, textos). Nunca reaproveite os valores dos exemplos.\n"
        "- Se nenhum formato servir, responda {\"comando\": \"\"}.\n\n"
        f"Exemplos:\n{shots}"
    )


class Fallback:
    def __init__(self, llm: LLM, registry: Registry):
        self.llm = llm
        self.registry = registry
        self._system: str | None = None

    @property
    def system(self) -> str:
        if self._system is None:
            self._system = build_system(self.registry)
        return self._system

    async def rewrite(self, text: str, timeout: float) -> str | None:
        out = await self.llm.generate_json(
            f"Pedido: {text.strip()}", SCHEMA, system=self.system, max_tokens=40, temperature=0,
            label="comando", interactive=True, timeout=timeout,
        )
        cmd = (out or {}).get("comando")
        if not isinstance(cmd, str):
            return None
        cmd = re.sub(r"\s+", " ", cmd).strip().strip('"')
        return cmd or None
