"""Agenda, Gmail e Tarefas contra uma API do Google falsa (httpx.MockTransport)."""

import json
from datetime import date, datetime, time, timedelta
from urllib.parse import parse_qs

import httpx
import pytest

from mano.skills.google.account import to_rfc3339

TODAY = date.today()
TOMORROW = TODAY + timedelta(days=1)
INSTALLED = {"installed": {"client_id": "abc.apps.googleusercontent.com", "client_secret": "s",
                           "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                           "token_uri": "https://oauth2.googleapis.com/token",
                           "redirect_uris": ["http://localhost"]}}


def at(d: date, h: int, m: int = 0) -> str:
    return to_rfc3339(datetime.combine(d, time(h, m)))


class FakeGoogle:
    def __init__(self):
        self.created_events = []
        self.tasks = [
            {"id": "t1", "title": "Comprar pão", "position": "1"},
            {"id": "t2", "title": "Pagar internet", "position": "2", "due": f"{TODAY - timedelta(days=1)}T00:00:00.000Z"},
        ]
        self.patched = []
        self.events = [
            {"id": "e1", "summary": "Dentista", "start": {"dateTime": at(TODAY, 15)}, "end": {"dateTime": at(TODAY, 16)},
             "location": "Rua X"},
            {"id": "e2", "summary": "Aniversário da Ana", "start": {"date": TOMORROW.isoformat()},
             "end": {"date": (TOMORROW + timedelta(days=1)).isoformat()}},
            {"id": "e3", "summary": "Reunião", "start": {"dateTime": at(TOMORROW, 9, 30)},
             "end": {"dateTime": at(TOMORROW, 10, 30)}},
            {"id": "e4", "summary": "Recusado", "start": {"dateTime": at(TODAY, 11)}, "end": {"dateTime": at(TODAY, 12)},
             "attendees": [{"self": True, "responseStatus": "declined"}]},
        ]

    def __call__(self, req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == "Bearer tok"
        p, m = req.url.path, req.method
        if p.endswith("/users/me/calendarList"):
            return httpx.Response(200, json={"items": [
                {"id": "eu@gmail.com", "summary": "Pessoal", "primary": True, "selected": True, "backgroundColor": "#f00"},
                {"id": "pt.brazilian#holiday@group.v.calendar.google.com", "summary": "Feriados", "selected": False},
            ]})
        if "/calendars/" in p and p.endswith("/events"):
            if m == "POST":
                self.created_events.append(json.loads(req.content))
                return httpx.Response(200, json={"id": "new"})
            assert "eu%40gmail.com" in str(req.url.raw_path, "ascii")
            return httpx.Response(200, json={"items": self.events})
        if p.endswith("/labels/INBOX"):
            return httpx.Response(200, json={"messagesUnread": 12})
        if p.endswith("/users/me/messages"):
            assert "is:unread" in parse_qs(req.url.query.decode())["q"][0]
            return httpx.Response(200, json={"messages": [{"id": "m1"}, {"id": "m2"}], "resultSizeEstimate": 2})
        if "/users/me/messages/" in p:
            mid = p.rsplit("/", 1)[1]
            hdr = {"m1": [("From", '"Ana Silva" <ana@x.com>'), ("Subject", "Boleto"), ("Date", "Wed, 4 Nov 2026 09:00:00 -0300")],
                   "m2": [("From", "banco@x.com"), ("Subject", "Fatura"), ("Date", "Tue, 3 Nov 2026 09:00:00 -0300")]}[mid]
            return httpx.Response(200, json={"id": mid, "threadId": "th" + mid, "snippet": "...",
                                             "payload": {"headers": [{"name": k, "value": v} for k, v in hdr]}})
        if p.startswith("/tasks/v1/lists/@default/tasks"):
            if m == "GET":
                return httpx.Response(200, json={"items": self.tasks})
            if m == "POST":
                body = json.loads(req.content)
                self.tasks.append({"id": "t9", "position": "9", **body})
                return httpx.Response(200, json={"id": "t9"})
            if m == "PATCH":
                tid = p.rsplit("/", 1)[1]
                self.patched.append((tid, json.loads(req.content)))
                self.tasks = [t for t in self.tasks if t["id"] != tid]
                return httpx.Response(200, json={})
        raise AssertionError(f"rota inesperada {m} {req.url}")


@pytest.fixture
def google(app, client, settings):
    fake = FakeGoogle()
    (settings.data_dir / "google_client.json").write_text(json.dumps(INSTALLED))
    acc = app.state.ctx.skill("google").account
    acc.token_override = "tok"
    acc.http = httpx.AsyncClient(transport=httpx.MockTransport(fake))
    return fake


def cmd(client, text):
    r = client.post("/api/command", json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("text,intent", [
    ("qual minha agenda de hoje?", "calendar.day"),
    ("o que eu tenho amanhã", "calendar.day"),
    ("qual meu próximo compromisso", "calendar.next"),
    ("marca dentista sexta às 10", "calendar.create"),
    ("coloca na agenda reunião com a Ana amanhã às 15", "calendar.create"),
    ("coloca um timer de 5 minutos", "timer.start"),
    ("marca leitura como feita", "habit.done"),
    ("tenho e-mail novo?", "gmail.unread"),
    ("lê meus emails", "gmail.unread"),
    ("adiciona tarefa comprar pão", "tasks.add"),
    ("coloca pagar internet nas tarefas", "tasks.add"),
    ("quais são minhas tarefas", "tasks.list"),
    ("conclui a tarefa comprar pão", "tasks.done"),
    ("fiz exercício", "habit.done"),
    ("me lembra de pagar o boleto amanhã às 10", "reminder.create"),
])
def test_routes(registry, text, intent):
    m = registry.parse(text)
    assert m is not None and m.intent.name == intent, (text, m and m.intent.name)


def test_not_configured(client):
    assert "não está configurada" in cmd(client, "qual minha agenda de hoje")["speech"]
    assert "não está configurada" in cmd(client, "tenho e-mail novo")["speech"]


def test_calendar(client, google):
    out = cmd(client, "qual minha agenda de hoje?")
    assert out["speech"] == "Hoje você tem 1 compromisso: Dentista às 15 horas."  # o recusado some
    out = cmd(client, "o que eu tenho amanhã")
    assert out["speech"] == "Amanhã você tem 2 compromissos: Aniversário da Ana, o dia todo; Reunião às 9 e meia."
    data = client.get("/api/calendar").json()
    assert [e["title"] for e in data["events"]] == ["Dentista", "Aniversário da Ana", "Reunião"]
    assert data["events"][0]["calendar"] == "Pessoal"
    nxt = cmd(client, "qual meu próximo compromisso")["speech"]
    assert nxt.startswith("Seu próximo compromisso é ")


def test_calendar_create(client, google):
    out = cmd(client, "Mano, coloca na agenda reunião com a Ana amanhã às 15")
    assert out["speech"] == "Marquei Reunião com a Ana amanhã às 15 horas."
    ev = google.created_events[0]
    assert ev["summary"] == "Reunião com a Ana"
    assert ev["start"]["dateTime"] == at(TOMORROW, 15) and ev["end"]["dateTime"] == at(TOMORROW, 16)


def test_heads_up(app, client, google, speaker):
    cal = app.state.ctx.skill("agenda")
    now = datetime.combine(TODAY, time(14, 52))
    import asyncio

    loop = app.state.ctx.hub.loop
    asyncio.run_coroutine_threadsafe(cal.refresh(), loop).result(5)
    asyncio.run_coroutine_threadsafe(cal.heads_up(now), loop).result(5)
    assert speaker.said[-1] == "Daqui a 8 minutos: Dentista, em Rua X."
    n = len(speaker.said)
    asyncio.run_coroutine_threadsafe(cal.heads_up(now + timedelta(minutes=1)), loop).result(5)
    assert len(speaker.said) == n  # avisa uma vez só


def test_gmail(client, google):
    out = cmd(client, "tenho e-mail novo?")
    assert out["speech"] == ("Você tem 2 e-mails não lidos na caixa principal. "
                             "Os mais recentes: de Ana Silva: Boleto; de banco@x.com: Fatura.")


def test_tasks(client, google):
    out = cmd(client, "quais são minhas tarefas")
    assert out["speech"] == "Você tem 2 tarefas, 1 atrasada: Pagar internet; Comprar pão."
    out = cmd(client, "adiciona tarefa ligar pro contador amanhã")
    assert out["speech"] == "Anotei a tarefa Ligar pro contador para amanhã."
    assert google.tasks[-1]["title"] == "Ligar pro contador"
    assert google.tasks[-1]["due"] == f"{TOMORROW}T00:00:00.000Z"
    out = cmd(client, "conclui a tarefa comprar pao")
    assert out["speech"] == "Feito: Comprar pão."
    assert google.patched == [("t1", {"status": "completed"})]


def test_client_config_and_login(client, settings):
    web = {"web": {"client_id": "x", "client_secret": "y"}}
    r = client.post("/api/google/client", json={"config": web})
    assert r.status_code == 400 and "computador" in r.json()["detail"]
    r = client.post("/api/google/client", json={"config": INSTALLED})
    assert r.status_code == 200 and r.json()["configured"] and not r.json()["connected"]
    r = client.get("/api/google/login", follow_redirects=False)
    loc = r.headers["location"]
    assert loc.startswith("https://accounts.google.com/o/oauth2/auth?")
    assert "redirect_uri=http%3A%2F%2F127.0.0.1%3A8765%2F" in loc and "access_type=offline" in loc
    # estado errado na raiz não é tratado como login
    r = client.get("/?state=outro&code=x", follow_redirects=False)
    assert r.status_code == 200
    # estado certo + erro do usuário → volta para Ajustes com o motivo
    state = parse_qs(loc.split("?", 1)[1])["state"][0]
    r = client.get(f"/?state={state}&error=access_denied", follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "/#/ajustes?google=erro&motivo=access_denied"


def test_help_lists_features(client):
    out = cmd(client, "o que você sabe fazer")
    assert out["speech"].startswith("Eu cuido de hora e data, timers, lembretes, remédios, hábitos, agenda, tarefas, e-mail")
    assert "conta google" not in out["speech"] and "avisos" not in out["speech"]
