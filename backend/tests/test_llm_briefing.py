"""Fase 6: LLM local (plano B dos comandos, resumos) e briefing de feeds, com Ollama e web falsos."""

import asyncio
import json
import time
from datetime import datetime, timedelta
from email.utils import format_datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from mano.commands import NOT_UNDERSTOOD
from mano.models import Article
from mano.skills.briefing.feeds import discover, parse_feed, sentences

from test_google import INSTALLED, FakeGoogle


class FakeOllama:
    MODELS = [{"name": "gemma3:1b", "size": 815_000_000, "details": {"parameter_size": "1B"}},
              {"name": "gemma4:e2b-it-qat", "size": 4_340_000_000, "details": {"parameter_size": "4.6B"}}]
    ROUTES = {
        "preciso sair daqui a quarenta minutos, me avisa": "timer de 40 minutos",
        "bota no meu caderno que o forno ta com defeito": "anota que o forno tá com defeito",
    }

    def __init__(self):
        self.calls: list[dict] = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/tags":
            return httpx.Response(200, json={"models": self.MODELS})
        if req.url.path == "/api/generate":
            body = json.loads(req.content)
            self.calls.append(body)
            p = body["prompt"]
            if p.startswith("Pedido: "):
                assert "toca Djavan" in body["system"]  # catálogo de comandos vai no system (cacheável)
                out = json.dumps({"comando": self.ROUTES.get(p.removeprefix("Pedido: "), "")})
            elif p.startswith("Resuma a notícia"):
                title = p.split("Título: ", 1)[1].split("\n", 1)[0]
                out = f"Resumo: O fato principal de {title}."
            elif "e-mails não lidos" in p:
                out = "Ana mandou um boleto para pagar. O banco enviou a fatura."
            else:
                out = "Tudo funcionando!"
            return httpx.Response(200, json={"response": out, "prompt_eval_count": 10, "eval_count": 5,
                                             "total_duration": 1_000_000})
        raise AssertionError(f"rota inesperada {req.method} {req.url}")


def rfc822(dt: datetime) -> str:
    return format_datetime(dt.astimezone())


PARA = ("O projeto de pesquisa acompanhou durante dois anos o crescimento de hortas urbanas em cidades médias, "
        "medindo produção, custo e participação dos moradores em cada bairro analisado pelos pesquisadores. ")


class FakeWeb:
    def __init__(self):
        now = datetime.now()
        self.items = [(f"a{i}", f"Artigo {i}", now - timedelta(hours=i)) for i in (1, 2, 3)]
        self.hits: list[str] = []

    def rss(self) -> str:
        items = "".join(
            f"<item><title>{t}</title><link>https://blog.test/{slug}</link><guid>{slug}</guid>"
            f"<pubDate>{rfc822(d)}</pubDate><description>&lt;p&gt;Começo do {t}. Segunda frase.&lt;/p&gt;</description></item>"
            for slug, t, d in self.items)
        return (f'<?xml version="1.0"?><rss version="2.0"><channel><title>Blog Teste</title>'
                f"<link>https://blog.test/</link>{items}</channel></rss>")

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.hits.append(str(req.url))
        path = req.url.path
        if path == "/":
            return httpx.Response(200, html='<html><head><link rel="alternate" type="application/rss+xml" '
                                            'title="Feed" href="/feed/"></head><body>Oi</body></html>')
        if path == "/feed/":
            return httpx.Response(200, text=self.rss(), headers={"content-type": "application/rss+xml"})
        if path == "/nofeed":
            return httpx.Response(200, html="<html><body>sem feed</body></html>")
        slug = path.strip("/")
        if slug.startswith("a"):
            body = "".join(f"<p>{PARA}Parágrafo {i} do texto {slug}.</p>" for i in range(5))
            return httpx.Response(200, html=f"<html><head><title>{slug}</title></head><body><nav>menu</nav>"
                                            f"<article><h1>{slug}</h1>{body}</article></body></html>")
        return httpx.Response(404)


@pytest.fixture
def settings(settings):
    return settings.model_copy(update={"llm_enabled": True})


@pytest.fixture
def ollama():
    return FakeOllama()


@pytest.fixture
def web():
    return FakeWeb()


@pytest.fixture
def client(app, ollama, web):
    ctx = app.state.ctx
    ctx.llm.http = httpx.AsyncClient(transport=httpx.MockTransport(ollama))
    ctx.skill("briefing").http = httpx.AsyncClient(transport=httpx.MockTransport(web))
    with TestClient(app) as c:
        assert c.get("/api/llm").json()["reachable"] is True
        yield c


def cmd(client, text, speak=True):
    r = client.post("/api/command", json={"text": text, "speak": speak})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- LLM ----------

def test_status_picks_best_installed_model(client):
    st = client.get("/api/llm").json()
    assert st["model"] == "gemma4:e2b-it-qat" and st["chosen"] is None
    st = client.post("/api/llm/config", json={"model": "gemma3:1b"}).json()
    assert st["model"] == "gemma3:1b"
    st = client.post("/api/llm/config", json={"model": ""}).json()
    assert st["model"] == "gemma4:e2b-it-qat"


def test_llm_test_endpoint(client):
    out = client.post("/api/llm/test").json()
    assert out["text"] == "Tudo funcionando!" and out["model"] == "gemma4:e2b-it-qat"


def test_fallback_rewrites_into_known_command(client, ollama, speaker):
    out = cmd(client, "preciso sair daqui a quarenta minutos, me avisa")
    assert out["intent"] == "timer.start"
    assert out["data"]["understood_as"] == "timer de 40 minutos"
    assert speaker.said[0] == "Deixa eu pensar."
    assert len(client.get("/api/timers").json()) == 1
    body = ollama.calls[-1]
    assert body["format"]["required"] == ["comando"] and body["options"]["temperature"] == 0


def test_fallback_keeps_accents_from_llm(client, settings):
    vault = settings.data_dir / "vault"
    (vault / ".obsidian").mkdir(parents=True)
    client.post("/api/notes/config", json={"vault": str(vault)})
    out = cmd(client, "bota no meu caderno que o forno ta com defeito", speak=False)
    assert out["intent"] == "notes.capture"
    daily = next(vault.rglob("*.md")).read_text(encoding="utf-8")
    assert "o forno tá com defeito" in daily.lower()


def test_rules_first_llm_only_when_needed(client, ollama):
    assert cmd(client, "timer de 5 minutos")["intent"] == "timer.start"
    assert ollama.calls == []
    out = cmd(client, "conta uma piada")
    assert out["intent"] is None and out["speech"] == NOT_UNDERSTOOD
    assert len(ollama.calls) == 1
    cmd(client, "oi")  # uma palavra só: nem tenta
    assert len(ollama.calls) == 1


def test_fallback_can_be_turned_off(client, ollama):
    client.post("/api/llm/config", json={"fallback": False})
    assert cmd(client, "preciso sair daqui a quarenta minutos, me avisa")["intent"] is None
    client.post("/api/llm/config", json={"fallback": True, "enabled": False})
    assert cmd(client, "preciso sair daqui a quarenta minutos, me avisa")["intent"] is None
    assert ollama.calls == []


def test_unreachable_ollama_is_graceful(app, speaker):
    ctx = app.state.ctx

    def down(req):
        raise httpx.ConnectError("recusado")

    ctx.llm.http = httpx.AsyncClient(transport=httpx.MockTransport(down))
    with TestClient(app) as c:
        assert c.get("/api/llm").json()["reachable"] is False
        out = c.post("/api/command", json={"text": "bota um som aí pra mim"}).json()
        assert out["speech"] == NOT_UNDERSTOOD
        assert "Deixa eu pensar." not in speaker.said


# ---------- briefing ----------

def add_blog(client):
    r = client.post("/api/briefing/feeds", json={"url": "blog.test"})
    assert r.status_code == 200, r.text
    return r.json()


def test_feed_discovery_and_extraction(client, app, web):
    feed = add_blog(client)
    assert feed["title"] == "Blog Teste" and feed["url"] == "https://blog.test/feed/"
    data = client.get("/api/briefing").json()
    assert [i["title"] for i in data["items"]] == ["Artigo 1", "Artigo 2", "Artigo 3"]
    assert data["items"][0]["summary_kind"] == "trecho"
    assert data["feeds"][0]["unread"] == 3
    with app.state.ctx.db.session() as s:
        a = s.exec(select(Article).where(Article.guid == "a1")).one()
    assert "Parágrafo 4 do texto a1" in a.text and "menu" not in a.text
    assert a.excerpt == "Começo do Artigo 1. Segunda frase."
    r = client.post("/api/briefing/feeds", json={"url": "https://blog.test/feed/"})
    assert r.status_code == 400 and "já está" in r.json()["detail"]
    r = client.post("/api/briefing/feeds", json={"url": "https://blog.test/nofeed"})
    assert r.status_code == 400 and "feed" in r.json()["detail"]


def test_refetch_only_adds_new_items(client, app, web):
    add_blog(client)
    web.items.insert(0, ("a0", "Artigo 0", datetime.now()))
    web.items.append(("a9", "Artigo antigo", datetime.now() - timedelta(hours=20)))  # acervo: não entra
    sk = app.state.ctx.skill("briefing")
    asyncio.run_coroutine_threadsafe(sk.fetch_all(), app.state.ctx.hub.loop).result(10)
    titles = [i["title"] for i in client.get("/api/briefing").json()["items"]]
    assert titles == ["Artigo 0", "Artigo 1", "Artigo 2", "Artigo 3"]


def test_summaries_by_llm(client, ollama):
    add_blog(client)
    assert client.post("/api/briefing/summarize").status_code == 200
    for _ in range(50):
        items = client.get("/api/briefing").json()["items"]
        if all(i["summary_kind"] == "llm" for i in items):
            break
        time.sleep(0.1)
    assert items[0]["summary"] == "O fato principal de Artigo 1."
    assert sum(1 for c in ollama.calls if c["prompt"].startswith("Resuma")) == 3
    assert "Parágrafo 0 do texto a1" in ollama.calls[0]["prompt"]


def test_news_by_voice(client):
    assert "aba Briefing" in cmd(client, "quais as notícias?")["speech"]
    add_blog(client)
    out = cmd(client, "quais as notícias?")
    assert out["speech"].startswith("Tem 3 novidades. Blog Teste: Artigo 1. Começo do Artigo 1.")
    assert out["intent"] == "briefing.news"
    assert client.get("/api/briefing").json()["items"] == []  # ouvidas = lidas
    assert cmd(client, "mais notícias")["speech"] == "Acabaram as novidades."


def test_day_summary(client, app):
    out = cmd(client, "bom dia")
    assert out["intent"] == "briefing.day"
    assert out["speech"].split("!")[0] in ("Bom dia", "Boa tarde", "Boa noite")
    add_blog(client)
    client.post("/api/habits", json={"name": "Leitura"})
    speech = cmd(client, "como está meu dia?")["speech"]
    assert "Faltam 1 de 1: Leitura." in speech or "Hábitos: faltam 1 de 1: Leitura." in speech
    assert "Nos seus feeds tem 3 novidades; a mais recente: Artigo 1." in speech


def test_morning_config(client, app):
    assert client.post("/api/briefing/config", json={"morning_at": "25:00"}).status_code == 400
    assert client.post("/api/briefing/config", json={"morning_at": "07:30"}).status_code == 200
    assert app.state.ctx.scheduler.get_job("briefing-morning") is not None
    client.post("/api/briefing/config", json={"morning_at": ""})
    assert app.state.ctx.scheduler.get_job("briefing-morning") is None


def test_mark_read_star_and_remove_feed(client):
    feed = add_blog(client)
    items = client.get("/api/briefing").json()["items"]
    client.post(f"/api/briefing/items/{items[0]['id']}", json={"starred": True})
    client.post("/api/briefing/read-all", json={})
    assert client.get("/api/briefing").json()["items"] == []
    assert [i["title"] for i in client.get("/api/briefing?view=starred").json()["items"]] == ["Artigo 1"]
    client.delete(f"/api/briefing/feeds/{feed['id']}")
    assert client.get("/api/briefing?view=all").json() == {"items": [], "feeds": []}


# ---------- e-mails ----------

@pytest.fixture
def google(app, client, settings):
    fake = FakeGoogle()
    (settings.data_dir / "google_client.json").write_text(json.dumps(INSTALLED))
    acc = app.state.ctx.skill("google").account
    acc.token_override = "tok"
    acc.http = httpx.AsyncClient(transport=httpx.MockTransport(fake))
    return fake


def test_email_summary(client, google, speaker, ollama):
    out = cmd(client, "resume meus e-mails")
    assert out["intent"] == "gmail.summary"
    assert out["speech"] == "Vou ler seus 2 e-mails mais recentes e já te conto o resumo."
    summary = "Ana mandou um boleto para pagar. O banco enviou a fatura."
    for _ in range(50):
        if summary in speaker.said:
            break
        time.sleep(0.1)
    assert summary in speaker.said
    prompt = next(c["prompt"] for c in ollama.calls if "e-mails não lidos" in c["prompt"])
    assert "De: Ana Silva | Assunto: Boleto" in prompt
    n = len(ollama.calls)
    assert cmd(client, "resume meus emails")["speech"] == summary  # mesmos e-mails: usa o resumo pronto
    assert len(ollama.calls) == n


# ---------- frases e funções puras ----------

@pytest.mark.parametrize("text,intent", [
    ("quais as notícias", "briefing.news"),
    ("me dá as últimas notícias", "briefing.news"),
    ("notícias", "briefing.news"),
    ("mais notícias", "briefing.more"),
    ("bom dia", "briefing.day"),
    ("fala mano bom dia", "briefing.day"),
    ("meu briefing", "briefing.day"),
    ("resume meus e-mails", "gmail.summary"),
    ("faz um resumo dos emails", "gmail.summary"),
    ("lê meus e-mails", "gmail.unread"),
    ("pesquisa notícias de futebol", "search.web"),
    ("o que eu tenho amanhã", "calendar.day"),
])
def test_routes(registry, text, intent):
    m = registry.parse(text)
    assert m is not None and m.intent.name == intent, (text, m and m.intent.name)


def test_feed_helpers():
    assert discover('<link rel="alternate" type="application/atom+xml" href="/atom.xml">'
                    '<link rel="alternate" type="application/rss+xml" href="/comments/feed/">', "https://x.com/blog/") \
        == ["https://x.com/atom.xml"]
    assert sentences("Primeira frase. Segunda frase! Terceira?", 2) == "Primeira frase. Segunda frase!"
    assert parse_feed(b"<html><body>oi</body></html>") is None
    atom = (b'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>'
            b'<entry><title>T &amp; U</title><link href="/p1"/><id>1</id><updated>2026-01-02T10:00:00Z</updated>'
            b'<content type="html">&lt;p&gt;Texto&lt;/p&gt;</content></entry></feed>')
    out = parse_feed(atom, "https://a.com/feed")
    assert out["title"] == "A" and out["entries"][0]["title"] == "T & U"
    assert out["entries"][0]["url"] == "https://a.com/p1" and out["entries"][0]["excerpt"] == "Texto"


def test_concurrent_fetch_does_not_duplicate(client, app, web):
    feed = add_blog(client)
    with app.state.ctx.db.session() as s:
        for a in s.exec(select(Article)).all():
            s.delete(a)
        s.commit()
    web.items.append(("a1", "Artigo 1 repetido", datetime.now()))  # guid repetido no próprio feed
    sk = app.state.ctx.skill("briefing")
    loop = app.state.ctx.hub.loop

    async def both():
        from mano.models import Feed
        with app.state.ctx.db.session() as s:
            f = s.get(Feed, feed["id"])
        return await asyncio.gather(sk.fetch_feed(f), sk.fetch_feed(f))

    added = asyncio.run_coroutine_threadsafe(both(), loop).result(10)
    assert sorted(added) == [0, 3]
    feeds = client.get("/api/briefing").json()["feeds"]
    assert feeds[0]["error"] is None and feeds[0]["last_fetch"]
