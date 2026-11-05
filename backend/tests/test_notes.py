"""Segundo cérebro, num vault temporário com a mesma cara do vault real (nunca toca o real)."""

import os
import time
from datetime import date, datetime

import pytest

from mano.skills.notes.vault import Vault, moment_to_strftime, plain

TODAY = date.today()
DAILY = "10-19 Journal/10 Daily"


@pytest.fixture
def vault_dir(tmp_path):
    v = tmp_path / "obsidian"
    (v / ".obsidian").mkdir(parents=True)
    (v / ".obsidian" / "app.json").write_text('{"newFileFolderPath": "10-19 Journal/10 Daily"}')
    (v / DAILY).mkdir(parents=True)
    (v / DAILY / "2026-04-27.md").write_text("---\ntags:\n  - Daily\n---\n\nTrabalhando no [[SIA]]\n", encoding="utf-8")
    (v / DAILY / "2026-04-22.md").write_text("", encoding="utf-8")
    proj = v / "20-29 Craft" / "21 Projects"
    (proj / "SIA").mkdir(parents=True)
    (proj / "SIA" / "SIA.md").write_text("# SIA\n\nSistema de **inteligência** acadêmica. Usa [[RenovarTech]].\n\nMais coisa.",
                                         encoding="utf-8")
    (proj / "RenovarTech").mkdir()
    (proj / "RenovarTech" / "Aula 04 - Lógica sem código.md").write_text(
        "Pensamento lógico com exemplos do dia a dia, sem programar.", encoding="utf-8")
    (v / ".git").mkdir()
    (v / ".git" / "lixo.md").write_text("não indexar")
    return v


@pytest.fixture
def notes(app, client, vault_dir):
    r = client.post("/api/notes/config", json={"vault": str(vault_dir)})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 4
    return app.state.ctx.skill("notas")


def cmd(client, text):
    r = client.post("/api/command", json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("text,intent", [
    ("anota que a reunião foi remarcada pra sexta", "notes.capture"),
    ("Mano, anota: comprar café", "notes.capture"),
    ("anota tarefa comprar pão", "tasks.add"),
    ("procura nas notas sobre lógica", "notes.search"),
    ("o que eu anotei sobre SIA", "notes.search"),
    ("lê a nota sobre RenovarTech", "notes.read"),
    ("o que eu anotei hoje?", "notes.today"),
    ("pesquisa preço do dólar", "search.web"),
])
def test_routes(registry, text, intent):
    m = registry.parse(text)
    assert m is not None and m.intent.name == intent, (text, m and m.intent.name)


def test_not_configured(client):
    assert "Configure na aba Ajustes" in cmd(client, "anota comprar café")["speech"]


def test_capture_creates_daily_with_your_frontmatter(client, notes, vault_dir):
    out = cmd(client, "Mano, anota que a reunião foi remarcada para sexta, às 15h.")
    assert out["speech"] == "Anotado."
    daily = vault_dir / DAILY / f"{TODAY:%Y-%m-%d}.md"
    content = daily.read_text(encoding="utf-8")
    assert content.startswith("---\ntags:\n  - Daily\n---\n\n## Capturas\n\n- ")
    assert content.rstrip().endswith("A reunião foi remarcada para sexta, às 15h.")

    cmd(client, "anota comprar café")
    lines = [ln for ln in daily.read_text(encoding="utf-8").splitlines() if ln.startswith("- ")]
    assert len(lines) == 2 and lines[1].endswith("Comprar café")
    assert "Hoje você anotou: A reunião foi remarcada" in cmd(client, "o que eu anotei hoje")["speech"]


def test_capture_keeps_your_text(notes, vault_dir):
    daily = vault_dir / DAILY / f"{TODAY:%Y-%m-%d}.md"
    daily.write_text("---\ntags:\n  - Daily\n---\n\nMeu texto.\n\n## Outra seção\n\nfim\n", encoding="utf-8")
    notes.vault.capture("um", datetime.combine(TODAY, datetime.min.time()).replace(hour=9))
    notes.vault.capture("dois", datetime.combine(TODAY, datetime.min.time()).replace(hour=9, minute=5))
    content = daily.read_text(encoding="utf-8")
    assert content.startswith("---\ntags:\n  - Daily\n---\n\nMeu texto.\n\n## Outra seção\n\nfim\n")
    assert content.endswith("## Capturas\n\n- 09:00 um\n- 09:05 dois\n")
    # seção no meio do arquivo: insere antes do próximo título
    daily.write_text("## Capturas\n\n- 08:00 a\n\n## Depois\n\nx\n", encoding="utf-8")
    notes.vault.capture("b", datetime.combine(TODAY, datetime.min.time()).replace(hour=8, minute=30))
    assert daily.read_text(encoding="utf-8") == "## Capturas\n\n- 08:00 a\n- 08:30 b\n\n## Depois\n\nx\n"


def test_search_ignores_accents_and_ranks_title(client, notes):
    res = client.get("/api/notes/search", params={"q": "logica"}).json()
    assert res[0]["title"] == "Aula 04 - Lógica sem código"
    res = client.get("/api/notes/search", params={"q": "inteligencia academica"}).json()
    assert res[0]["path"] == "20-29 Craft/21 Projects/SIA/SIA.md" and "«" in res[0]["snippet"]
    assert client.get("/api/notes/search", params={"q": "indexar"}).json() == []  # .git ignorado
    out = cmd(client, "procura nas notas sobre lógica")
    assert out["speech"].startswith("Achei 1 nota. As principais: Aula 04")
    assert "Não achei nada sobre xyzzy" in cmd(client, "procura nas notas sobre xyzzy")["speech"]


def test_read_note_and_links(client, notes):
    out = cmd(client, "lê a nota sobre SIA")
    assert out["speech"] == "SIA: SIA Sistema de inteligência acadêmica. Usa RenovarTech."
    f = client.get("/api/notes/file", params={"path": "20-29 Craft/21 Projects/SIA/SIA.md"}).json()
    assert [b["title"] for b in f["backlinks"]] == ["2026-04-27"]
    assert f["obsidian_url"] == "obsidian://open?vault=obsidian&file=20-29%20Craft/21%20Projects/SIA/SIA"
    assert client.get("/api/notes/resolve", params={"link": "RenovarTech"}).status_code == 404
    assert client.get("/api/notes/resolve", params={"link": "SIA"}).json()["path"].endswith("SIA.md")
    assert client.get("/api/notes/file", params={"path": "../../segredo.md"}).status_code == 404


def test_reindex_picks_up_changes(client, notes, vault_dir):
    new = vault_dir / "30-39 Codex" / "Zettelkasten.md"
    new.parent.mkdir()
    new.write_text("Método de notas atômicas.", encoding="utf-8")
    sia = vault_dir / "20-29 Craft/21 Projects/SIA/SIA.md"
    sia.unlink()
    import asyncio

    asyncio.run_coroutine_threadsafe(notes.reindex(), notes.ctx.hub.loop).result(5)
    assert client.get("/api/notes").json()["total"] == 4
    assert client.get("/api/notes/search", params={"q": "atomicas"}).json()[0]["title"] == "Zettelkasten"
    assert client.get("/api/notes/search", params={"q": "inteligencia"}).json() == []
    # edição de arquivo existente
    aula = vault_dir / "20-29 Craft/21 Projects/RenovarTech/Aula 04 - Lógica sem código.md"
    aula.write_text("Agora fala de fluxogramas.", encoding="utf-8")
    os.utime(aula, (time.time() + 5, time.time() + 5))
    asyncio.run_coroutine_threadsafe(notes.reindex(), notes.ctx.hub.loop).result(5)
    assert client.get("/api/notes/search", params={"q": "fluxogramas"}).json()[0]["title"].startswith("Aula 04")


def test_daily_config_and_helpers(vault_dir, tmp_path):
    v = Vault(vault_dir, tmp_path / "x.db")
    assert v.daily_path(date(2026, 11, 4)) == f"{DAILY}/2026-11-04.md"
    (vault_dir / ".obsidian" / "daily-notes.json").write_text('{"folder": "Diario", "format": "DD-MM-YYYY"}')
    assert v.daily_path(date(2026, 11, 4)) == "Diario/04-11-2026.md"
    assert moment_to_strftime("YYYY-MM-DD") == "%Y-%m-%d"
    assert moment_to_strftime("dddd, MMMM Do") is None
    assert plain("---\ntags: x\n---\n# Título\n\n- item com [[Nota|apelido]] e [link](http://x) e **negrito**") == \
        "Título item com apelido e link e negrito"


def test_config_rejects_missing_folder(client, tmp_path):
    assert client.post("/api/notes/config", json={"vault": str(tmp_path / "nao-existe")}).status_code == 400


def test_frontmatter_tags():
    from mano.skills.notes.vault import frontmatter_tags

    assert frontmatter_tags("---\ntags:\n  - Daily\n  - pessoal\n---\n") == ["Daily", "pessoal"]
    assert frontmatter_tags("---\ntags: [estudo, fatec]\naliases: x\n---\n") == ["estudo", "fatec"]
    assert frontmatter_tags("---\ntitle: x\n---\n") == []


def test_tree_lists_every_note_by_path(client, notes):
    tree = client.get("/api/notes/tree").json()
    paths = [n["path"] for n in tree]
    assert paths == sorted(paths)
    assert "20-29 Craft/21 Projects/SIA/SIA.md" in paths
    assert all(not p.startswith(".git/") for p in paths)
    sia = next(n for n in tree if n["title"] == "SIA")
    assert sia["folder"] == "20-29 Craft/21 Projects/SIA"
