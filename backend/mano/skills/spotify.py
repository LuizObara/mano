"""Spotify pela Web API (conta Premium).

Autenticação PKCE: só precisa do Client ID do app criado em developer.spotify.com, sem segredo.
O token fica em data/spotify_token.json e é renovado sozinho.

Se nenhum aparelho estiver ativo, o Mano abre o Spotify do PC e toca nele.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import platform
import re
import sys
import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..intents.ptbr import normalize, restore_accents
from ..intents.registry import Reply, Skill, intent

log = logging.getLogger(__name__)

SCOPES = ("user-read-playback-state user-modify-playback-state user-read-currently-playing "
          "playlist-read-private user-library-read")

_PLAY_ANY = re.compile(r"^(?:toca|tocar|toque|quero ouvir|bota pra tocar|poe pra tocar|coloca pra tocar|toca ai)\s+(?P<rest>.+)$")
_PLAY_KIND = re.compile(
    r"^(?:coloca|coloque|bota|bote|poe|ponha)\s+(?:a |o |uma |um |as |os )?"
    r"(?P<rest>(?:musica|musicas|cancao|album|disco|playlist|lista|artista|banda)\b.*)$"
)
_KIND = re.compile(
    r"^(?:a |o |uma |um |as |os )?(?P<kind>musicas? (?:do|da|de|dos|das)|musica|cancao|album|disco|playlist|lista|artista|banda)\s+(?:(?:do|da|de|dos|das)\s+)?(?P<q>.+)$"
)
_LIKED = re.compile(r"\b(curtidas|que eu curti|favoritas|minhas musicas)\b")


class NoDevice(Exception):
    pass


class ConfigIn(BaseModel):
    client_id: str


def parse_play(text: str) -> dict | None:
    """'toca evidencias' -> {'kind': 'auto', 'q': 'evidencias'}."""
    if re.search(r"\b(youtube|video|videos)\b", text):
        return None
    m = _PLAY_ANY.match(text) or _PLAY_KIND.match(text)
    if not m:
        return None
    rest = re.sub(r"\s+(?:no|do|pelo) spotify$", "", m.group("rest")).strip()
    if not rest or rest in ("a musica", "musica", "ai"):
        return None
    if _LIKED.search(rest):
        return {"kind": "liked", "q": ""}
    km = _KIND.match(rest)
    if km:
        k = km.group("kind")
        kind = ("artist" if k.startswith("musicas") or k in ("artista", "banda")
                else "album" if k in ("album", "disco")
                else "playlist" if k in ("playlist", "lista")
                else "track")
        return {"kind": kind, "q": km.group("q").strip()}
    return {"kind": "auto", "q": rest}


class SpotifySkill(Skill):
    name = "spotify"
    description = "Música (Spotify)"

    def __init__(self, ctx):
        super().__init__(ctx)
        self.auth = None
        self.client = None  # spotipy.Spotify (ou um falso nos testes)
        self.now: dict | None = None  # o que está tocando (cache do último poll)
        self._cfg_path = ctx.settings.data_dir / "spotify.json"
        self._token_path = ctx.settings.data_dir / "spotify_token.json"

    # ---------- configuração / auth ----------

    def client_id(self) -> str | None:
        if self.ctx.settings.spotify_client_id:
            return self.ctx.settings.spotify_client_id
        try:
            return json.loads(self._cfg_path.read_text(encoding="utf-8")).get("client_id") or None
        except (OSError, ValueError):
            return None

    def _auth_manager(self):
        if self.auth is None and self.client_id():
            from spotipy.cache_handler import CacheFileHandler
            from spotipy.oauth2 import SpotifyPKCE

            self.auth = SpotifyPKCE(
                client_id=self.client_id(), redirect_uri=self.ctx.settings.spotify_redirect_uri, scope=SCOPES,
                cache_handler=CacheFileHandler(cache_path=str(self._token_path)), open_browser=False,
            )
        return self.auth

    @property
    def connected(self) -> bool:
        if self.client is not None:
            return True
        auth = self._auth_manager()
        if auth is None or auth.cache_handler.get_cached_token() is None:
            return False
        import spotipy

        self.client = spotipy.Spotify(auth_manager=auth, requests_timeout=8, retries=1)
        return True

    def status(self) -> dict:
        return {
            "configured": self.client_id() is not None,
            "connected": self.connected,
            "redirect_uri": self.ctx.settings.spotify_redirect_uri,
            "now": self.now,
        }

    def snapshot(self) -> dict:
        return {"spotify": self.status()}

    async def _push(self) -> None:
        await self.ctx.hub.broadcast("spotify", {"spotify": self.status()})

    async def _call(self, fn, *args, **kwargs):
        return await asyncio.to_thread(fn, *args, **kwargs)

    # ---------- reprodução ----------

    async def _devices(self) -> list[dict]:
        return (await self._call(self.client.devices)).get("devices", [])

    async def _ensure_device(self) -> str | None:
        """Retorna o id de um aparelho para tocar; abre o Spotify do PC se precisar."""
        devices = await self._devices()
        if any(d.get("is_active") for d in devices):
            return None  # usa o ativo
        pick = self._pick(devices)
        if pick:
            return pick
        if sys.platform == "win32":
            os.startfile("spotify:")  # abre o app desktop
            for _ in range(12):
                await asyncio.sleep(1)
                pick = self._pick(await self._devices())
                if pick:
                    return pick
        raise NoDevice

    @staticmethod
    def _pick(devices: list[dict]) -> str | None:
        if not devices:
            return None
        host = platform.node().lower()
        for d in devices:
            if d.get("name", "").lower() == host:
                return d["id"]
        computers = [d for d in devices if d.get("type") == "Computer"]
        return (computers or devices)[0]["id"]

    async def _start(self, **kwargs) -> None:
        from spotipy.exceptions import SpotifyException

        try:
            device = await self._ensure_device()
            await self._call(self.client.start_playback, device_id=device, **kwargs)
        except SpotifyException as e:
            if e.http_status == 403:
                raise PermissionError from e
            raise
        await asyncio.sleep(0.6)
        await self.refresh()

    async def play(self, kind: str, q: str) -> str:
        sp = self.client
        if kind == "liked":
            items = (await self._call(sp.current_user_saved_tracks, limit=50)).get("items", [])
            uris = [i["track"]["uri"] for i in items if i.get("track")]
            if not uris:
                return "Você ainda não tem músicas curtidas."
            await self._start(uris=uris)
            await self._call(sp.shuffle, True)
            return "Tocando suas músicas curtidas."

        if kind == "playlist":
            mine = (await self._call(sp.current_user_playlists, limit=50)).get("items", [])
            nq = normalize(q)
            own = next((p for p in mine if p and nq in normalize(p["name"])), None)
            if own is None:
                res = (await self._call(sp.search, q=q, type="playlist", limit=5)).get("playlists", {}).get("items", [])
                own = next((p for p in res if p), None)
            if own is None:
                return f"Não achei a playlist {q}."
            await self._start(context_uri=own["uri"])
            return f"Tocando a playlist {own['name']}."

        if kind == "album":
            res = (await self._call(sp.search, q=q, type="album", limit=1))["albums"]["items"]
            if not res:
                return f"Não achei o álbum {q}."
            a = res[0]
            await self._start(context_uri=a["uri"])
            return f"Tocando o álbum {a['name']}, de {a['artists'][0]['name']}."

        res = await self._call(sp.search, q=q, type="artist,track", limit=5)
        artists = res.get("artists", {}).get("items", [])
        tracks = res.get("tracks", {}).get("items", [])
        nq = normalize(q)
        artist = next((a for a in artists if normalize(a["name"]) == nq), None)
        if kind == "artist" or (kind == "auto" and artist is not None):
            artist = artist or (artists[0] if artists else None)
            if artist is None:
                return f"Não achei o artista {q}."
            await self._start(context_uri=artist["uri"])
            await self._call(sp.shuffle, True)
            return f"Tocando {artist['name']}."
        if not tracks:
            return f"Não achei {q} no Spotify."
        t = tracks[0]
        await self._start(uris=[t["uri"]])
        return f"Tocando {t['name']}, de {t['artists'][0]['name']}."

    async def control(self, action: str) -> None:
        sp = self.client
        if action == "pause":
            await self._call(sp.pause_playback)
        elif action == "play":
            await self._start()
        elif action == "next":
            await self._call(sp.next_track)
        elif action == "previous":
            await self._call(sp.previous_track)
        await asyncio.sleep(0.5)
        await self.refresh()

    async def pause_if_playing(self) -> None:
        """Usado por outras skills (ex.: abrir vídeo)."""
        if self.connected and self.now and self.now.get("is_playing"):
            try:
                await self.control("pause")
            except Exception:
                log.debug("não consegui pausar o Spotify", exc_info=True)

    async def refresh(self) -> None:
        if not self.connected:
            return
        try:
            cur = await self._call(self.client.current_playback)
        except Exception:
            log.debug("falha ao consultar o Spotify", exc_info=True)
            return
        now = None
        if cur and cur.get("item"):
            it = cur["item"]
            images = (it.get("album") or {}).get("images") or []
            now = {
                "title": it["name"],
                "artist": ", ".join(a["name"] for a in it.get("artists", [])),
                "album": (it.get("album") or {}).get("name"),
                "image": images[-2]["url"] if len(images) >= 2 else (images[0]["url"] if images else None),
                "is_playing": cur.get("is_playing", False),
                "progress_ms": cur.get("progress_ms") or 0,
                "duration_ms": it.get("duration_ms") or 0,
                "device": (cur.get("device") or {}).get("name"),
                "volume": (cur.get("device") or {}).get("volume_percent"),
                "at": int(time.time() * 1000),
            }
        changed = (now is None) != (self.now is None) or (
            now and self.now and any(now[k] != self.now.get(k) for k in ("title", "is_playing", "device", "volume"))
        ) or (now and self.now and abs(now["progress_ms"] - self.now["progress_ms"] - (now["at"] - self.now["at"])) > 3000)
        self.now = now
        if changed:
            await self._push()

    async def start(self) -> None:
        self.ctx.scheduler.add_job(self._poll, "interval", seconds=self.ctx.settings.spotify_poll_s,
                                   id="spotify-poll", replace_existing=True, max_instances=1, coalesce=True)

    async def _poll(self) -> None:
        if self.ctx.hub.clients and self.connected:
            await self.refresh()

    # ---------- intenções ----------

    def _not_ready(self) -> Reply | None:
        if not self.client_id():
            return Reply("O Spotify ainda não está configurado. Veja a aba Ajustes.")
        if not self.connected:
            return Reply("Falta conectar sua conta do Spotify. Veja a aba Ajustes.")
        return None

    async def _guard(self, coro_fn) -> Reply:
        if (r := self._not_ready()) is not None:
            return r
        try:
            return await coro_fn()
        except NoDevice:
            return Reply("Não achei nenhum aparelho com Spotify aberto. Abra o Spotify no PC ou no celular.")
        except PermissionError:
            return Reply("O Spotify recusou o comando. Controlar a reprodução exige conta Premium.")
        except Exception:
            log.exception("erro no Spotify")
            return Reply("O Spotify não respondeu. Tenta de novo daqui a pouco.")

    def match_play(self, text: str) -> dict | None:
        return parse_play(text)

    @intent("spotify.play", matcher="match_play", priority=4,
            examples=["toca Djavan", "toca a playlist de estudo", "toca minhas músicas curtidas"])
    async def play_intent(self, slots: dict) -> Reply:
        q = restore_accents(slots["q"], slots.get("_raw", "")) if slots["q"] else ""

        async def run():
            return Reply(await self.play(slots["kind"], q))

        return await self._guard(run)

    @intent("spotify.pause",
            patterns=[r"^(pausa|pause|pausar)( a| o)?( musica| som| spotify)?$",
                      r"^(para|pare|parar|desliga)( a| o) (musica|som|spotify)$"],
            examples=["pausa a música"], priority=31)
    async def pause_intent(self, slots: dict) -> Reply:
        async def run():
            await self.control("pause")
            return Reply("Pausado.")

        return await self._guard(run)

    @intent("spotify.resume",
            patterns=[r"^(continua|continuar|despausa|retoma|volta a tocar|play|toca)( a musica| o som)?$"],
            examples=["continua a música"], priority=31)
    async def resume_intent(self, slots: dict) -> Reply:
        async def run():
            await self.control("play")
            return Reply("Voltando.")

        return await self._guard(run)

    @intent("spotify.next",
            patterns=[r"^(proxima|proximo)( musica| faixa)?$",
                      r"^(pula|pular|passa|avanca)( a| essa| esta)? (musica|faixa)$"],
            examples=["próxima música"], priority=31)
    async def next_intent(self, slots: dict) -> Reply:
        async def run():
            await self.control("next")
            return Reply("Próxima.")

        return await self._guard(run)

    @intent("spotify.previous",
            patterns=[r"^(volta|voltar)( a| pra| para)?( a)? (musica|faixa)( anterior)?$",
                      r"^(musica|faixa) anterior$", r"^anterior$"],
            examples=["música anterior"], priority=31)
    async def previous_intent(self, slots: dict) -> Reply:
        async def run():
            await self.control("previous")
            return Reply("Voltando uma.")

        return await self._guard(run)

    @intent("spotify.volume",
            patterns=[r"\b(?P<dir>aumenta|sobe|abaixa|diminui|baixa)( o| um pouco o)? (volume|som)\b",
                      r"\bvolume (?:no |em |pra |para )?(?P<n>\d{1,3})\b"],
            examples=["aumenta o volume", "volume 40"], priority=8)
    async def volume_intent(self, slots: dict) -> Reply:
        async def run():
            cur = await self._call(self.client.current_playback)
            vol = ((cur or {}).get("device") or {}).get("volume_percent")
            if "n" in slots:
                new = int(slots["n"])
            else:
                base = 50 if vol is None else vol
                new = base + (15 if slots["dir"] in ("aumenta", "sobe") else -15)
            new = max(0, min(100, new))
            await self._call(self.client.volume, new)
            await self.refresh()
            return Reply(f"Volume em {new}.")

        return await self._guard(run)

    @intent("spotify.now",
            patterns=[r"\b(que|qual) (musica|som) (e essa|e esse|e esta|ta tocando|esta tocando)\b",
                      r"\bo que (ta|esta) tocando\b", r"\bqual (e )?o nome dessa musica\b"],
            examples=["que música é essa?"], priority=8)
    async def now_intent(self, slots: dict) -> Reply:
        async def run():
            await self.refresh()
            if not self.now:
                return Reply("Nada tocando no Spotify agora.")
            return Reply(f"É {self.now['title']}, de {self.now['artist']}.")

        return await self._guard(run)

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/spotify", tags=["spotify"])

        @r.get("")
        async def get_status():
            return self.status()

        @r.post("/config")
        async def set_config(body: ConfigIn):
            cid = body.client_id.strip()
            if not re.fullmatch(r"[0-9a-fA-F]{32}", cid):
                raise HTTPException(400, "Client ID inválido (são 32 caracteres hexadecimais)")
            self._cfg_path.parent.mkdir(parents=True, exist_ok=True)
            self._cfg_path.write_text(json.dumps({"client_id": cid}), encoding="utf-8")
            self.auth = None
            self.client = None
            await self._push()
            return self.status()

        @r.get("/login")
        async def login():
            auth = self._auth_manager()
            if auth is None:
                raise HTTPException(400, "Configure o Client ID primeiro")
            return RedirectResponse(auth.get_authorize_url())

        @r.get("/callback")
        async def callback(code: str | None = None, error: str | None = None):
            if error or not code:
                return RedirectResponse(f"/#/ajustes?spotify=erro&motivo={error or 'sem-codigo'}")
            await asyncio.to_thread(self._auth_manager().get_access_token, code)
            self.client = None
            await self._push()
            await self.refresh()
            return RedirectResponse("/#/ajustes?spotify=ok")

        @r.post("/logout")
        async def logout():
            self._token_path.unlink(missing_ok=True)
            self.auth = None
            self.client = None
            self.now = None
            await self._push()
            return self.status()

        @r.post("/control/{action}")
        async def control(action: str):
            if action not in ("play", "pause", "next", "previous"):
                raise HTTPException(400)
            reply = await self._guard(lambda: self._ctl_reply(action))
            return {"speech": reply.speech, **self.status()}

        return r

    async def _ctl_reply(self, action: str) -> Reply:
        await self.control(action)
        return Reply("ok")
