"""Sistema: iniciar o Mano junto com o Windows, atalho na Área de Trabalho e fechar o Mano.

"Iniciar com o Windows" é um valor `Mano` em `HKCU\\...\\CurrentVersion\\Run` (não precisa de administrador)
com o comando `wscript.exe scripts\\mano.vbs /segundo-plano`. O `mano.vbs` chama o `start.ps1 -NoWindow`
sem abrir terminal: no logon só o backend sobe; o visor abre pelo atalho (`mano.vbs /abrir`), que não
reinicia um Mano que já esteja no ar.

O registro é a fonte da verdade: a tela mostra o que está lá, inclusive se o item foi desativado em
Gerenciador de Tarefas → Aplicativos de inicialização (que guarda isso em `StartupApproved\\Run`).
O acesso ao Windows fica em `WindowsHost`, trocado por um dublê nos testes (`SystemSkill.host`).
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import struct
import subprocess
import sys
import zlib
from pathlib import Path, PureWindowsPath

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import ROOT
from ..intents.registry import Skill

log = logging.getLogger(__name__)

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APPROVED_KEY = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
SHELL_FOLDERS_KEY = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
VALUE_NAME = "Mano"
SHORTCUT_NAME = "Mano.lnk"

# Cria o .lnk pelo COM do Windows. Os caminhos chegam por variáveis de ambiente, nunca colados no script.
SHORTCUT_PS = (
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:MANO_LNK_PATH);"
    "$s.TargetPath = $env:MANO_LNK_TARGET;"
    "$s.Arguments = $env:MANO_LNK_ARGS;"
    "$s.WorkingDirectory = $env:MANO_LNK_DIR;"
    "if ($env:MANO_LNK_ICON) { $s.IconLocation = $env:MANO_LNK_ICON };"
    "$s.Description = $env:MANO_LNK_DESC;"
    "$s.Save()"
)


class WindowsHost:
    """O que a skill precisa do Windows: o registro do usuário e a criação de atalhos."""

    supported = sys.platform == "win32"

    def read_run(self) -> str | None:
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
                return str(winreg.QueryValueEx(k, VALUE_NAME)[0])
        except FileNotFoundError:
            return None

    def write_run(self, command: str) -> None:
        import winreg

        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            winreg.SetValueEx(k, VALUE_NAME, 0, winreg.REG_SZ, command)
        # se tinha sido desativado no Gerenciador de Tarefas, ligar pela tela reativa
        self._delete(APPROVED_KEY)

    def delete_run(self) -> None:
        self._delete(RUN_KEY)
        self._delete(APPROVED_KEY)

    def startup_disabled(self) -> bool:
        """Desativado em Gerenciador de Tarefas → Aplicativos de inicialização (1º byte ímpar)."""
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, APPROVED_KEY) as k:
                data = winreg.QueryValueEx(k, VALUE_NAME)[0]
        except FileNotFoundError:
            return False
        return bool(data) and bool(data[0] & 1)

    def desktop_dir(self) -> Path:
        """A Área de Trabalho de verdade (pode ter sido movida para o OneDrive)."""
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, SHELL_FOLDERS_KEY) as k:
                return Path(os.path.expandvars(winreg.QueryValueEx(k, "Desktop")[0]))
        except FileNotFoundError:
            return Path.home() / "Desktop"

    def create_shortcut(self, path: Path, target: str, args: str, workdir: str, icon: str, description: str) -> None:
        env = {**os.environ, "MANO_LNK_PATH": str(path), "MANO_LNK_TARGET": target, "MANO_LNK_ARGS": args,
               "MANO_LNK_DIR": workdir, "MANO_LNK_ICON": icon, "MANO_LNK_DESC": description}
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SHORTCUT_PS],
            env=env, capture_output=True, text=True, timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if r.returncode != 0:
            raise OSError(r.stderr.strip() or f"powershell saiu com {r.returncode}")

    def _delete(self, key: str) -> None:
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_SET_VALUE) as k:
                winreg.DeleteValue(k, VALUE_NAME)
        except FileNotFoundError:
            pass


class AutostartIn(BaseModel):
    enabled: bool


class SystemSkill(Skill):
    name = "sistema"
    description = "Sistema (iniciar com o Windows)"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._host: WindowsHost | None = None

    @property
    def host(self) -> WindowsHost:
        if self._host is None:
            self._host = WindowsHost()
        return self._host

    @host.setter
    def host(self, value) -> None:
        self._host = value

    @property
    def vbs(self) -> Path:
        return ROOT / "scripts" / "mano.vbs"

    @property
    def wscript(self) -> str:
        return str(PureWindowsPath(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "wscript.exe"))

    def autostart_command(self) -> str:
        return f'"{self.wscript}" "{self.vbs}" /segundo-plano'

    @property
    def icon_path(self) -> Path:
        return self.ctx.settings.data_dir / "mano.ico"

    def status(self) -> dict:
        h = self.host
        base = {"supported": bool(h.supported), "can_exit": self.ctx.request_exit is not None}
        if not h.supported:
            return {**base, "autostart": False, "outdated": False, "blocked": False, "command": None,
                    "shortcut": False, "shortcut_path": None}
        current = h.read_run()
        expected = self.autostart_command()
        blocked = current is not None and h.startup_disabled()
        lnk = h.desktop_dir() / SHORTCUT_NAME
        return {
            **base,
            "autostart": current is not None and not blocked,
            # aponta para outra pasta (o projeto mudou de lugar): ligar de novo corrige
            "outdated": current is not None and current.strip().lower() != expected.lower(),
            "blocked": blocked,
            "command": expected,
            "shortcut": lnk.exists(),
            "shortcut_path": str(lnk),
        }

    def _require_windows(self) -> None:
        if not self.host.supported:
            raise HTTPException(400, "Isso só funciona com o Mano rodando no Windows.")

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/system", tags=["sistema"])

        @r.get("")
        async def get_status():
            return await asyncio.to_thread(self.status)

        @r.post("/autostart")
        async def autostart(body: AutostartIn):
            self._require_windows()
            try:
                if body.enabled:
                    await asyncio.to_thread(self.host.write_run, self.autostart_command())
                else:
                    await asyncio.to_thread(self.host.delete_run)
            except OSError as e:
                log.warning("Não consegui mudar a inicialização com o Windows: %s", e)
                raise HTTPException(500, "O Windows não deixou mudar a inicialização. Veja o log.") from e
            log.info("Iniciar com o Windows: %s", "ligado" if body.enabled else "desligado")
            return await asyncio.to_thread(self.status)

        @r.post("/shortcut")
        async def shortcut():
            self._require_windows()

            def create() -> None:
                write_icon(self.icon_path)
                lnk = self.host.desktop_dir() / SHORTCUT_NAME
                self.host.create_shortcut(lnk, self.wscript, f'"{self.vbs}" /abrir', str(ROOT),
                                          str(self.icon_path), "Abre o Mano")

            try:
                await asyncio.to_thread(create)
            except (OSError, subprocess.SubprocessError) as e:
                log.warning("Não consegui criar o atalho: %s", e)
                raise HTTPException(500, "Não consegui criar o atalho na Área de Trabalho. Veja o log.") from e
            return await asyncio.to_thread(self.status)

        @r.post("/shutdown")
        async def shutdown():
            if self.ctx.request_exit is None:
                raise HTTPException(409, "Este Mano não foi aberto pelo atalho nem pelo start.ps1; feche pelo terminal.")
            log.info("Fechando o Mano a pedido do visor")
            await self.ctx.hub.broadcast("system.shutdown", {})
            # responde antes de sair, para o visor saber que deu certo
            asyncio.get_running_loop().call_later(0.5, self.ctx.request_exit)
            return {"ok": True}

        return r


# ---------- ícone do atalho (o mesmo desenho de frontend/public/icon.svg) ----------

ICON_SIZES = (16, 32, 48, 256)
_BG = (0x2B, 0x1F, 0x15)
_HONEY = (0xE3, 0xA7, 0x2F)


def _cover(sd: float, px: float) -> float:
    """Cobertura de um pixel pela forma, a partir da distância com sinal até a borda (antisserrilhado)."""
    return min(1.0, max(0.0, 0.5 - sd / px))


def _icon_pixels(size: int) -> bytes:
    """RGBA do ícone: quadrado arredondado café, anel de mel translúcido e disco de mel (viewBox 512)."""
    px = 512 / size
    out = bytearray()
    for j in range(size):
        out.append(0)  # filtro PNG "nenhum" no começo de cada linha
        y = (j + 0.5) * px
        for i in range(size):
            x = (i + 0.5) * px
            # quadrado 512 com cantos de raio 112
            qx = abs(x - 256) - (256 - 112)
            qy = abs(y - 256) - (256 - 112)
            box = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - 112
            a = _cover(box, px)
            if a == 0:
                out += b"\0\0\0\0"
                continue
            d = math.hypot(x - 256, y - 256)
            ring = _cover(abs(d - 150) - 14, px) * 0.45
            disc = _cover(d - 72, px)
            rgb = [b + (h - b) * ring for b, h in zip(_BG, _HONEY)]
            rgb = [c + (h - c) * disc for c, h in zip(rgb, _HONEY)]
            out += bytes(round(c) for c in rgb) + bytes([round(255 * a)])
    return bytes(out)


def _png(size: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    head = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8 bits, RGBA
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(_icon_pixels(size), 9))
            + chunk(b"IEND", b""))


def icon_bytes() -> bytes:
    """Arquivo .ico com PNGs embutidos (aceito pelo Windows desde o Vista)."""
    images = [_png(s) for s in ICON_SIZES]
    offset = 6 + 16 * len(images)
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = b""
    for size, data in zip(ICON_SIZES, images):
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    return header + entries + b"".join(images)


def write_icon(path: Path) -> None:
    """Gera o ícone uma vez em data/ (nada de binário no repositório, como os sons dos alarmes)."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(icon_bytes())
