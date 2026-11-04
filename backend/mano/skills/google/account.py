"""Conta Google: OAuth de "app para computador" + chamadas REST autenticadas.

O arquivo de credenciais baixado do Google Cloud fica em data/google_client.json e o token em
data/google_token.json (nenhum dos dois vai para o git). O retorno do login cai na raiz
(http://127.0.0.1:8765/?code=...), que é o formato de loopback aceito para apps de computador.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ...intents.registry import Skill

log = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
]
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")  # aceita se o usuário desmarcar alguma permissão


class NotConnected(Exception):
    pass


class ClientIn(BaseModel):
    config: dict


def to_local(value: str) -> datetime:
    """RFC 3339 do Google → datetime local sem fuso (padrão do Mano)."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt
    return dt.astimezone().replace(tzinfo=None)


def to_rfc3339(dt: datetime) -> str:
    """datetime local sem fuso → RFC 3339 com o fuso do PC."""
    return dt.astimezone().isoformat(timespec="seconds")


def ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


class GoogleAccount:
    def __init__(self, settings):
        self.settings = settings
        self.client_path = settings.data_dir / "google_client.json"
        self.token_path = settings.data_dir / "google_token.json"
        self.redirect_uri = settings.google_redirect_uri
        self._creds = None
        self._flow = None
        self._state: str | None = None
        self._http: httpx.AsyncClient | None = None
        self.token_override: str | None = None  # testes

    # ---------- estado ----------

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=10)
        return self._http

    @http.setter
    def http(self, client: httpx.AsyncClient) -> None:
        self._http = client

    @property
    def configured(self) -> bool:
        return self.client_path.exists()

    @property
    def connected(self) -> bool:
        return self.token_override is not None or self.token_path.exists()

    def email(self) -> str | None:
        try:
            return json.loads(self.token_path.read_text(encoding="utf-8")).get("account_email")
        except (OSError, ValueError):
            return None

    def save_client(self, cfg: dict) -> None:
        inner = cfg.get("installed") or cfg.get("web")
        if not inner or not inner.get("client_id") or not inner.get("client_secret"):
            raise ValueError("Esse não parece o JSON de credenciais OAuth (falta 'installed' com client_id).")
        if "installed" not in cfg:
            raise ValueError("Crie a credencial como 'App para computador' (Desktop app), não 'Aplicativo da Web'.")
        self.client_path.parent.mkdir(parents=True, exist_ok=True)
        self.client_path.write_text(json.dumps(cfg), encoding="utf-8")
        self.logout()

    # ---------- login ----------

    def start_login(self) -> str:
        from google_auth_oauthlib.flow import Flow

        cfg = json.loads(self.client_path.read_text(encoding="utf-8"))
        self._flow = Flow.from_client_config(cfg, scopes=SCOPES, redirect_uri=self.redirect_uri)
        url, self._state = self._flow.authorization_url(access_type="offline", prompt="consent",
                                                        include_granted_scopes="true")
        return url

    def is_pending(self, state: str | None) -> bool:
        return bool(state) and state == self._state

    async def finish_login(self, code: str) -> None:
        flow = self._flow
        self._flow, self._state = None, None
        await asyncio.to_thread(flow.fetch_token, code=code)
        creds = flow.credentials
        data = json.loads(creds.to_json())
        self._creds = creds
        self.token_path.write_text(json.dumps(data), encoding="utf-8")
        try:  # guarda o e-mail da conta só para mostrar em Ajustes
            r = await self.http.get("https://gmail.googleapis.com/gmail/v1/users/me/profile",
                                    headers={"Authorization": f"Bearer {creds.token}"})
            if r.status_code == 200:
                data["account_email"] = r.json().get("emailAddress")
                self.token_path.write_text(json.dumps(data), encoding="utf-8")
        except Exception:
            log.debug("não consegui ler o e-mail da conta", exc_info=True)

    def logout(self) -> None:
        self.token_path.unlink(missing_ok=True)
        self._creds = None

    # ---------- chamadas ----------

    async def token(self, force_refresh: bool = False) -> str:
        if self.token_override is not None:
            return self.token_override
        if not self.token_path.exists():
            raise NotConnected
        if self._creds is None:
            from google.oauth2.credentials import Credentials

            info = json.loads(self.token_path.read_text(encoding="utf-8"))
            self._creds = Credentials.from_authorized_user_info(info, SCOPES)
        creds = self._creds
        if force_refresh or not creds.valid:
            from google.auth.exceptions import RefreshError
            from google.auth.transport.requests import Request

            try:
                await asyncio.to_thread(creds.refresh, Request())
            except RefreshError as e:
                log.warning("token do Google expirou/revogado: %s", e)
                self.logout()
                raise NotConnected from e
            info = json.loads(creds.to_json())
            old = json.loads(self.token_path.read_text(encoding="utf-8"))
            info["account_email"] = old.get("account_email")
            self.token_path.write_text(json.dumps(info), encoding="utf-8")
        return creds.token

    async def request(self, method: str, url: str, **kw) -> dict:
        for attempt in (0, 1):
            tok = await self.token(force_refresh=attempt == 1)
            r = await self.http.request(method, url, headers={"Authorization": f"Bearer {tok}"}, **kw)
            if r.status_code == 401 and attempt == 0 and self.token_override is None:
                continue
            r.raise_for_status()
            return r.json() if r.content else {}
        raise NotConnected


class GoogleSkill(Skill):
    """Só a conexão (sem comandos de voz); Agenda, Gmail e Tarefas usam `self.account`."""

    name = "google"
    description = "Conta Google"

    def __init__(self, ctx):
        super().__init__(ctx)
        self.account = GoogleAccount(ctx.settings)

    def status(self) -> dict:
        a = self.account
        return {"configured": a.configured, "connected": a.connected, "email": a.email(),
                "redirect_uri": a.redirect_uri}

    def snapshot(self) -> dict:
        return {"google": self.status()}

    async def push(self) -> None:
        await self.ctx.hub.broadcast("google", self.snapshot())

    async def refresh_all(self) -> None:
        for name in ("agenda", "e-mail", "tarefas"):
            sk = self.ctx.skill(name)
            if sk:
                await sk.refresh()

    async def handle_root_callback(self, params) -> RedirectResponse | None:
        """Chamado pela rota "/" quando o Google devolve ?code=...&state=..."""
        if not self.account.is_pending(params.get("state")):
            return None
        if params.get("error") or not params.get("code"):
            self.account._flow = self.account._state = None
            return RedirectResponse(f"/#/ajustes?google=erro&motivo={params.get('error', 'sem-codigo')}")
        try:
            await self.account.finish_login(params["code"])
        except Exception:
            log.exception("falha ao concluir login do Google")
            return RedirectResponse("/#/ajustes?google=erro&motivo=troca-de-token")
        await self.push()
        await self.refresh_all()
        return RedirectResponse("/#/ajustes?google=ok")

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/google", tags=["google"])

        @r.get("")
        async def status():
            return self.status()

        @r.post("/client")
        async def set_client(body: ClientIn):
            try:
                self.account.save_client(body.config)
            except ValueError as e:
                raise HTTPException(400, str(e)) from e
            await self.push()
            return self.status()

        @r.get("/login")
        async def login():
            if not self.account.configured:
                raise HTTPException(400, "Envie o JSON de credenciais primeiro")
            return RedirectResponse(self.account.start_login())

        @r.post("/logout")
        async def logout():
            self.account.logout()
            await self.push()
            await self.refresh_all()
            return self.status()

        @r.post("/refresh")
        async def refresh():
            await self.refresh_all()
            return {"ok": True}

        return r


class GoogleFeature(Skill):
    """Base de Agenda/Gmail/Tarefas: acesso à conta, atualização periódica e respostas padrão."""

    poll_s = 300
    key = ""  # chave no snapshot

    def __init__(self, ctx):
        super().__init__(ctx)
        self.data = self.empty()

    @property
    def account(self) -> GoogleAccount:
        return self.ctx.skill("google").account

    def not_ready(self):
        from ...intents.registry import Reply

        if not self.account.configured:
            return Reply("Sua conta Google ainda não está configurada. Veja a aba Ajustes.")
        if not self.account.connected:
            return Reply("Falta conectar sua conta Google. Veja a aba Ajustes.")
        return None

    async def refresh(self) -> None:
        if not self.account.connected:
            self.data = self.empty()
            await self.ctx.hub.broadcast(self.key, self.snapshot())
            return
        try:
            self.data = {**(await self.fetch()), "error": None, "updated": ms(datetime.now())}
        except NotConnected:
            self.data = self.empty()
            await self.ctx.skill("google").push()
        except Exception as e:
            log.warning("falha ao atualizar %s: %s", self.key, e)
            self.data = {**self.data, "error": "Não consegui atualizar agora."}
        await self.ctx.hub.broadcast(self.key, self.snapshot())

    def empty(self) -> dict:
        return {"error": None, "updated": None}

    async def fetch(self) -> dict:  # pragma: no cover - cada feature implementa
        raise NotImplementedError

    def snapshot(self) -> dict:
        return {self.key: self.data}

    async def start(self) -> None:
        self.ctx.scheduler.add_job(self.refresh, "interval", seconds=self.poll_s, id=f"{self.key}-poll",
                                   replace_existing=True, max_instances=1, coalesce=True,
                                   next_run_time=datetime.now())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
