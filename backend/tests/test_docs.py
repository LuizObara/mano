"""A página de comandos (docs/guia/comandos.md) não pode mentir: cada frase com intenção tem que cair nela."""

import re
from pathlib import Path

import pytest

DOC = Path(__file__).resolve().parents[2] / "docs" / "guia" / "comandos.md"
ROW = re.compile(r'^\|\s*"(?P<phrase>[^"]+)"\s*\|.*\|\s*`(?P<intent>[a-z_.]+)`\s*\|\s*$')


def documented() -> list[tuple[str, str]]:
    return [(m["phrase"], m["intent"]) for line in DOC.read_text(encoding="utf-8").splitlines()
            if (m := ROW.match(line))]


def test_doc_has_commands():
    assert len(documented()) > 60


@pytest.mark.parametrize("phrase,intent", documented())
def test_documented_phrase_routes(registry, phrase, intent):
    m = registry.parse(phrase)
    assert m is not None and m.intent.name == intent, f"{phrase!r} caiu em {m and m.intent.name}"


def test_every_intent_is_documented(registry):
    names = {it.name for s in registry.skills for it in s.intents()}
    missing = names - {intent for _, intent in documented()}
    assert not missing, f"intenções sem exemplo em docs/guia/comandos.md: {sorted(missing)}"
