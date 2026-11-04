"""LLM local via Ollama.

Neste notebook o modelo roda devagar (≈ 5–10 tokens/s), então ele só entra onde a espera não incomoda:
resumos em lote de madrugada, resumo de e-mails sob pedido e o "plano B" para frases que as regras
não entenderam. Os comandos do dia a dia continuam nas regras (respostas em menos de 1 s).

A URL é configurável (MANO_OLLAMA_URL): para usar o mini servidor, basta apontar para ele.
Pedidos são feitos um de cada vez; os interativos passam na frente dos de lote.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

# ordem de preferência quando nenhum modelo foi escolhido
PREFERRED = ["gemma4:e2b-it-qat", "gemma4:e2b", "qwen3:4b", "gemma3:4b", "qwen2.5:3b", "qwen3:1.7b",
             "llama3.2:3b", "gemma3:1b", "qwen2.5:1.5b"]


class LLMUnavailable(Exception):
    pass


def tidy(text: str) -> str:
    """Tira aspas e rótulos que modelos pequenos gostam de pôr em volta da resposta."""
    t = (text or "").strip()
    t = re.sub(r"^\s*(resposta|resumo|em resumo)\s*:\s*", "", t, flags=re.I)
    while len(t) > 1 and t[0] in "\"“'" and t[-1] in "\"”'":
        t = t[1:-1].strip()
    return t


class LLM:
    def __init__(self, settings):
        self.settings = settings
        self.url = settings.ollama_url.rstrip("/")
        self.config_path: Path = settings.data_dir / "llm.json"
        self._http: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()
        self._interactive_waiting = 0
        self._models: list[dict] | None = None
        self.reachable: bool | None = None
        self.busy: str | None = None  # o que está gerando agora ("resumo", "comando"...)
        self.pull: dict | None = None  # progresso de download de modelo
        self.on_change = None  # callback assíncrono para avisar a UI
        self._spawned = False

    # ---------- configuração ----------

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=httpx.Timeout(10, read=self.settings.llm_timeout_s))
        return self._http

    @http.setter
    def http(self, client: httpx.AsyncClient) -> None:
        self._http = client

    def _config(self) -> dict:
        try:
            return json.loads(self.config_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def save_config(self, **values: Any) -> None:
        cfg = self._config() | values
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(cfg), encoding="utf-8")

    @property
    def enabled(self) -> bool:
        return bool(self._config().get("enabled", self.settings.llm_enabled))

    @property
    def fallback_enabled(self) -> bool:
        return bool(self._config().get("fallback", self.settings.llm_fallback))

    def chosen_model(self) -> str | None:
        return self._config().get("model") or self.settings.llm_model

    @property
    def model(self) -> str | None:
        """Modelo em uso: o escolhido, ou o melhor instalado da lista de preferência."""
        names = [m["name"] for m in self._models or []]
        chosen = self.chosen_model()
        if chosen:
            return chosen
        for pref in PREFERRED:
            if pref in names:
                return pref
        return names[0] if names else None

    # ---------- servidor ----------

    def _exe(self) -> Path | None:
        candidates = [Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Ollama" / "ollama.exe"]
        return next((c for c in candidates if c.is_file()), None)

    async def refresh(self) -> bool:
        """Atualiza alcance e lista de modelos. Sobe o `ollama serve` local se preciso."""
        try:
            r = await self.http.get(f"{self.url}/api/tags", timeout=3)
            r.raise_for_status()
            self._models = r.json().get("models", [])
            self.reachable = True
        except (httpx.HTTPError, ValueError):
            self.reachable = False
            if self._can_spawn() and not self._spawned:
                self._spawn()
                for _ in range(20):
                    await asyncio.sleep(0.5)
                    try:
                        r = await self.http.get(f"{self.url}/api/tags", timeout=3)
                        self._models = r.json().get("models", [])
                        self.reachable = True
                        break
                    except (httpx.HTTPError, ValueError):
                        continue
        return bool(self.reachable)

    def _can_spawn(self) -> bool:
        local = re.match(r"https?://(127\.0\.0\.1|localhost)(:\d+)?$", self.url)
        return bool(local and self.settings.llm_autostart and self._exe())

    def _spawn(self) -> None:
        exe = self._exe()
        log.info("subindo o Ollama: %s serve", exe)
        flags = 0
        if os.name == "nt":
            flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
        subprocess.Popen([str(exe), "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         stdin=subprocess.DEVNULL, creationflags=flags, close_fds=True)
        self._spawned = True

    def status(self) -> dict:
        return {
            "enabled": self.enabled, "fallback": self.fallback_enabled, "reachable": self.reachable,
            "url": self.url, "model": self.model, "chosen": self.chosen_model(),
            "models": [{"name": m["name"], "size": m.get("size"),
                        "params": (m.get("details") or {}).get("parameter_size")} for m in self._models or []],
            "busy": self.busy, "pull": self.pull, "installed": self._exe() is not None,
        }

    @property
    def ready(self) -> bool:
        return self.enabled and bool(self.reachable) and self.model is not None

    async def _changed(self) -> None:
        if self.on_change:
            await self.on_change()

    # ---------- geração ----------

    @asynccontextmanager
    async def _slot(self, label: str, interactive: bool):
        """Um pedido por vez; pedidos interativos furam a fila do lote."""
        if interactive:
            self._interactive_waiting += 1
        try:
            if not interactive:
                while self._interactive_waiting:
                    await asyncio.sleep(0.2)
            async with self._lock:
                self.busy = label
                await self._changed()
                try:
                    yield
                finally:
                    self.busy = None
                    await self._changed()
        finally:
            if interactive:
                self._interactive_waiting -= 1

    def batch_should_yield(self) -> bool:
        return self._interactive_waiting > 0

    async def generate(self, prompt: str, *, system: str | None = None, fmt: Any = None, max_tokens: int = 200,
                       temperature: float = 0.2, label: str = "texto", interactive: bool = False,
                       timeout: float | None = None) -> str:
        if not self.enabled:
            raise LLMUnavailable("LLM desligado nos ajustes")
        if not self.reachable and not await self.refresh():
            raise LLMUnavailable("Ollama fora do ar")
        model = self.model
        if not model:
            raise LLMUnavailable("nenhum modelo instalado no Ollama")
        body: dict[str, Any] = {
            "model": model, "prompt": prompt, "stream": False, "think": False,
            "keep_alive": self.settings.llm_keep_alive,
            "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": self.settings.llm_num_ctx},
        }
        if system:
            body["system"] = system
        if fmt is not None:
            body["format"] = fmt
        async with self._slot(label, interactive):
            try:
                r = await asyncio.wait_for(self.http.post(f"{self.url}/api/generate", json=body),
                                           timeout or self.settings.llm_timeout_s)
            except (httpx.HTTPError, asyncio.TimeoutError) as e:
                self.reachable = None if isinstance(e, asyncio.TimeoutError) else False
                raise LLMUnavailable(f"falha ao falar com o Ollama: {e!r}") from e
            if r.status_code >= 400:
                raise LLMUnavailable(f"Ollama respondeu {r.status_code}: {r.text[:200]}")
            data = r.json()
            log.info("LLM %s: %s tokens de entrada, %s de saída, %.1f s", label, data.get("prompt_eval_count"),
                     data.get("eval_count"), (data.get("total_duration") or 0) / 1e9)
            return (data.get("response") or "").strip()

    async def generate_json(self, prompt: str, schema: dict, **kw) -> dict | None:
        raw = await self.generate(prompt, fmt=schema, **kw)
        try:
            out = json.loads(raw)
        except ValueError:
            m = re.search(r"\{.*\}", raw, re.S)
            try:
                out = json.loads(m.group(0)) if m else None
            except ValueError:
                out = None
        return out if isinstance(out, dict) else None

    # ---------- download de modelos ----------

    async def pull_model(self, name: str) -> None:
        self.pull = {"model": name, "status": "começando", "completed": 0, "total": 0}
        await self._changed()
        last = 0.0
        try:
            async with self.http.stream("POST", f"{self.url}/api/pull", json={"model": name},
                                        timeout=httpx.Timeout(30, read=None)) as r:
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    ev = json.loads(line)
                    if "error" in ev:
                        raise LLMUnavailable(ev["error"])
                    self.pull |= {"status": ev.get("status", ""), "completed": ev.get("completed", 0) or 0,
                                  "total": ev.get("total", 0) or 0}
                    now = asyncio.get_running_loop().time()
                    if now - last > 1:
                        last = now
                        await self._changed()
            self.pull = None
            await self.refresh()
        except Exception as e:
            self.pull = {"model": name, "status": "erro", "error": str(e), "completed": 0, "total": 0}
            raise
        finally:
            await self._changed()
