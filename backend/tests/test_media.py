"""Spotify, YouTube e pesquisa, sem rede: clientes falsos no lugar das APIs."""

import httpx
import pytest

from mano.skills.search import for_speech
from mano.skills.spotify import parse_play
from mano.skills.youtube import parse_youtube


# ---------- roteamento das frases ----------

@pytest.mark.parametrize("text,intent", [
    ("toca Djavan", "spotify.play"),
    ("Mano, toca evidências no Spotify", "spotify.play"),
    ("coloca a playlist de estudo", "spotify.play"),
    ("toca", "spotify.resume"),
    ("pausa", "spotify.pause"),
    ("para a música", "spotify.pause"),
    ("para", "alerts.dismiss"),
    ("próxima música", "spotify.next"),
    ("pula a música", "spotify.next"),
    ("pula o remédio", "meds.skip"),
    ("música anterior", "spotify.previous"),
    ("aumenta o volume", "spotify.volume"),
    ("volume 40", "spotify.volume"),
    ("que música é essa", "spotify.now"),
    ("abre um vídeo de receita de pão no YouTube", "youtube.play"),
    ("toca lofi no youtube", "youtube.play"),
    ("pesquisa no youtube aula de violão", "youtube.play"),
    ("fecha o vídeo", "youtube.close"),
    ("pesquisa preço do dólar", "search.web"),
    ("o que é fotossíntese", "search.whatis"),
    ("quem foi Machado de Assis", "search.whatis"),
    ("o que você sabe fazer", "help"),
    ("que horas são", "clock.time"),
    ("coloca um timer de 5 minutos", "timer.start"),
])
def test_routes(registry, text, intent):
    m = registry.parse(text)
    assert m is not None, text
    assert m.intent.name == intent


@pytest.mark.parametrize("text,kind,q", [
    ("toca djavan", "auto", "djavan"),
    ("toca evidencias no spotify", "auto", "evidencias"),
    ("toca a playlist de estudo", "playlist", "estudo"),
    ("coloca o album acabou chorare", "album", "acabou chorare"),
    ("toca musicas do djavan", "artist", "djavan"),
    ("toca a musica oceano", "track", "oceano"),
    ("toca minhas musicas curtidas", "liked", ""),
])
def test_parse_play(text, kind, q):
    assert parse_play(text) == {"kind": kind, "q": q}


def test_parse_play_rejects():
    assert parse_play("coloca um timer") is None
    assert parse_play("toca lofi no youtube") is None


@pytest.mark.parametrize("text,q,search", [
    ("abre um video de receita de pao no youtube", "receita de pao", False),
    ("pesquisa no youtube aula de violao", "aula de violao", True),
    ("quero ver video de gato", "gato", False),
    ("abre o youtube", "", False),
])
def test_parse_youtube(text, q, search):
    assert parse_youtube(text) == {"q": q, "search": search}


def test_for_speech():
    t = ("Joaquim Maria Machado de Assis (Rio de Janeiro, 21 de junho de 1839 — 29 de setembro de 1908) foi um "
         "escritor brasileiro. É considerado um dos maiores nomes da literatura. Terceira frase.")
    assert for_speech(t) == ("Joaquim Maria Machado de Assis foi um escritor brasileiro. "
                             "É considerado um dos maiores nomes da literatura.")


# ---------- Spotify com cliente falso ----------

class FakeSpotify:
    def __init__(self):
        self.calls = []
        self.active = True
        self.volume_percent = 50

    def _log(self, *a, **k):
        self.calls.append((a, k))

    def devices(self):
        return {"devices": [{"id": "pc", "name": "NOTE", "type": "Computer", "is_active": self.active}]}

    def search(self, q, type, limit):
        out = {}
        if "artist" in type:
            out["artists"] = {"items": [{"name": "Djavan", "uri": "spotify:artist:dj"}] if "djavan" in q.lower() else []}
        if "track" in type:
            out["tracks"] = {"items": [{"name": "Oceano", "uri": "spotify:track:oc", "artists": [{"name": "Djavan"}]}]}
        if "playlist" in type:
            out["playlists"] = {"items": [None, {"name": "Lofi Estudo", "uri": "spotify:playlist:lo"}]}
        if "album" in type:
            out["albums"] = {"items": [{"name": "Acabou Chorare", "uri": "spotify:album:ac",
                                        "artists": [{"name": "Novos Baianos"}]}]}
        return out

    def current_user_playlists(self, limit):
        return {"items": [{"name": "Treino", "uri": "spotify:playlist:tr"}]}

    def start_playback(self, **kw):
        self.calls.append(("start", kw))

    def shuffle(self, state):
        self.calls.append(("shuffle", state))

    def pause_playback(self):
        self.calls.append(("pause", {}))

    def next_track(self):
        self.calls.append(("next", {}))

    def previous_track(self):
        self.calls.append(("previous", {}))

    def volume(self, v):
        self.volume_percent = v
        self.calls.append(("volume", v))

    def current_playback(self):
        return {"is_playing": True, "progress_ms": 1000,
                "device": {"name": "NOTE", "volume_percent": self.volume_percent},
                "item": {"name": "Oceano", "duration_ms": 200000, "artists": [{"name": "Djavan"}],
                         "album": {"name": "Djavan", "images": [{"url": "big"}, {"url": "mid"}, {"url": "small"}]}}}


@pytest.fixture
def spotify(app, client):
    sk = app.state.ctx.skill("spotify")
    app.state.ctx.settings.spotify_client_id = "0" * 32
    sk.client = FakeSpotify()
    return sk.client


def cmd(client, text):
    r = client.post("/api/command", json={"text": text})
    assert r.status_code == 200, r.text
    return r.json()


def test_spotify_not_configured(client):
    assert "não está configurado" in cmd(client, "toca djavan")["speech"]


def test_spotify_play_variants(client, spotify):
    assert cmd(client, "toca Djavan")["speech"] == "Tocando Djavan."
    assert ("start", {"device_id": None, "context_uri": "spotify:artist:dj"}) in spotify.calls
    assert cmd(client, "toca a música oceano")["speech"] == "Tocando Oceano, de Djavan."
    assert cmd(client, "toca a playlist treino")["speech"] == "Tocando a playlist Treino."
    assert cmd(client, "toca a playlist lofi")["speech"] == "Tocando a playlist Lofi Estudo."
    assert cmd(client, "coloca o álbum acabou chorare")["speech"] == "Tocando o álbum Acabou Chorare, de Novos Baianos."


def test_spotify_picks_device_when_none_active(client, spotify):
    spotify.active = False
    cmd(client, "toca oceano")
    assert ("start", {"device_id": "pc", "uris": ["spotify:track:oc"]}) in spotify.calls


def test_spotify_controls(client, spotify):
    assert cmd(client, "pausa")["speech"] == "Pausado."
    assert cmd(client, "próxima música")["speech"] == "Próxima."
    assert cmd(client, "aumenta o volume")["speech"] == "Volume em 65."
    assert cmd(client, "volume 20")["speech"] == "Volume em 20."
    assert cmd(client, "que música é essa")["speech"] == "É Oceano, de Djavan."
    status = client.get("/api/spotify").json()
    assert status["now"]["title"] == "Oceano" and status["now"]["image"] == "mid"
    assert status["now"]["image_large"] == "big" and status["now"]["album"] == "Djavan"


def test_spotify_volume_route(client, spotify):
    r = client.post("/api/spotify/volume", json={"value": 70})
    assert r.status_code == 200, r.text
    assert r.json()["speech"] == "Volume em 70."
    assert ("volume", 70) in spotify.calls
    assert r.json()["now"]["volume"] == 70
    assert client.post("/api/spotify/volume", json={"value": 140}).status_code == 422


def test_spotify_config_validation(client):
    assert client.post("/api/spotify/config", json={"client_id": "nope"}).status_code == 400
    r = client.post("/api/spotify/config", json={"client_id": "a" * 32})
    assert r.status_code == 200 and r.json()["configured"] is True and r.json()["connected"] is False


# ---------- YouTube ----------

def test_youtube_play_and_search(app, client):
    yt = app.state.ctx.skill("youtube")
    opened = []
    app.state.ctx.open_url = opened.append
    yt.searcher = lambda q, n: [{"id": f"vid{i}", "title": f"{q} {i}", "channel": "c", "duration": 60,
                                 "thumb": "t"} for i in range(n)]
    out = cmd(client, "abre um vídeo de receita de pão no youtube")
    assert out["speech"] == "Abrindo receita de pão 0."
    assert opened == ["https://www.youtube.com/watch?v=vid0"]  # nenhuma tela conectada → navegador

    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        cmd(client, "pesquisa no youtube aula de violão")
        types = []
        while "reply" not in types:
            types.append(ws.receive_json()["type"])
        assert "youtube.results" in types
        client.post("/api/youtube/play", json={"id": "abc", "title": "x"})
        while (msg := ws.receive_json())["type"] != "youtube":
            pass
        assert msg["video"]["id"] == "abc"


# ---------- pesquisa ----------

def wiki_transport(found=True):
    def handler(request: httpx.Request):
        assert request.url.host == "pt.wikipedia.org"
        assert "Mano/" in request.headers["user-agent"]
        if not found:
            return httpx.Response(200, json={"batchcomplete": True})
        return httpx.Response(200, json={"query": {"pages": [{
            "title": "Fotossíntese", "fullurl": "https://pt.wikipedia.org/wiki/Fotoss%C3%ADntese",
            "extract": "A fotossíntese (do grego) é um processo físico-químico. Ocorre nas plantas. Mais uma.",
            "thumbnail": {"source": "img"}}]}})
    return httpx.MockTransport(handler)


def test_whatis(app, client):
    sk = app.state.ctx.skill("pesquisa")
    sk.http = httpx.AsyncClient(transport=wiki_transport(), headers={"User-Agent": app.state.ctx.settings.http_user_agent})
    out = cmd(client, "o que é fotossíntese?")
    assert out["speech"] == "A fotossíntese é um processo físico-químico. Ocorre nas plantas."
    assert out["data"]["card"]["title"] == "Fotossíntese"
    assert "google.com/search?q=fotoss%C3%ADntese" in out["data"]["link"]["url"]

    sk.http = httpx.AsyncClient(transport=wiki_transport(found=False), headers={"User-Agent": app.state.ctx.settings.http_user_agent})
    assert cmd(client, "quem foi fulano de tal")["speech"] == "Não achei nada sobre fulano de tal na Wikipedia."


def test_web_search_opens_browser(app, client):
    opened = []
    app.state.ctx.open_url = opened.append
    out = cmd(client, "pesquisa preço do dólar")
    assert out["speech"] == "Abri a pesquisa por preço do dólar no navegador."
    assert opened == ["https://www.google.com/search?q=pre%C3%A7o+do+d%C3%B3lar"]
