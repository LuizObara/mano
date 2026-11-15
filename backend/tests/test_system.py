"""Skill sistema: iniciar com o Windows (HKCU\\Run), atalho na Área de Trabalho e fechar o Mano."""

import struct
import time
from pathlib import Path

import pytest

from mano.skills.system import ICON_SIZES, SHORTCUT_NAME, icon_bytes


class FakeWindows:
    """Dublê do WindowsHost: o registro vira um dicionário e o atalho, um arquivo comum."""

    supported = True

    def __init__(self, desktop: Path):
        self.run: str | None = None
        self.disabled = False  # desativado no Gerenciador de Tarefas
        self.desktop = desktop
        self.shortcuts: list[dict] = []

    def read_run(self):
        return self.run

    def write_run(self, command):
        self.run = command
        self.disabled = False

    def delete_run(self):
        self.run = None
        self.disabled = False

    def startup_disabled(self):
        return self.disabled

    def desktop_dir(self):
        return self.desktop

    def create_shortcut(self, path, target, args, workdir, icon, description):
        path.write_text("lnk")
        self.shortcuts.append({"path": path, "target": target, "args": args, "workdir": workdir, "icon": icon})


@pytest.fixture
def system(app, tmp_path):
    skill = app.state.ctx.skill("sistema")
    desktop = tmp_path / "Desktop"
    desktop.mkdir()
    skill.host = FakeWindows(desktop)
    return skill


def test_status_starts_off(client, system):
    st = client.get("/api/system").json()
    assert st["supported"] is True
    assert st["autostart"] is False and st["outdated"] is False and st["blocked"] is False
    assert st["shortcut"] is False
    assert st["shortcut_path"].endswith(SHORTCUT_NAME)
    assert st["command"].endswith('mano.vbs" /segundo-plano')


def test_autostart_on_writes_background_command(client, system):
    st = client.post("/api/system/autostart", json={"enabled": True}).json()
    assert st["autostart"] is True and st["outdated"] is False
    cmd = system.host.run
    assert cmd.lower().startswith('"') and 'wscript.exe" "' in cmd.lower()
    assert cmd.endswith('mano.vbs" /segundo-plano')
    assert cmd == system.autostart_command()


def test_autostart_off_removes_entry(client, system):
    client.post("/api/system/autostart", json={"enabled": True})
    st = client.post("/api/system/autostart", json={"enabled": False}).json()
    assert st["autostart"] is False
    assert system.host.run is None


def test_entry_from_another_folder_is_outdated_and_fixed_by_turning_on(client, system):
    system.host.run = r'"C:\Windows\System32\wscript.exe" "D:\velho\mano\scripts\mano.vbs" /segundo-plano'
    st = client.get("/api/system").json()
    assert st["autostart"] is True and st["outdated"] is True
    st = client.post("/api/system/autostart", json={"enabled": True}).json()
    assert st["outdated"] is False


def test_disabled_in_task_manager_shows_blocked_and_turning_on_reenables(client, system):
    system.host.run = system.autostart_command()
    system.host.disabled = True
    st = client.get("/api/system").json()
    assert st["autostart"] is False and st["blocked"] is True
    st = client.post("/api/system/autostart", json={"enabled": True}).json()
    assert st["autostart"] is True and st["blocked"] is False


def test_desktop_shortcut_opens_visor_with_icon(client, system, settings):
    st = client.post("/api/system/shortcut").json()
    assert st["shortcut"] is True
    sc = system.host.shortcuts[-1]
    assert sc["path"] == system.host.desktop / SHORTCUT_NAME
    assert sc["target"].lower().endswith("wscript.exe")
    assert sc["args"].endswith('mano.vbs" /abrir')
    icon = Path(sc["icon"])
    assert icon == settings.data_dir / "mano.ico" and icon.exists()


def test_shortcut_failure_is_polite(client, system):
    def boom(*a, **k):
        raise OSError("acesso negado")

    system.host.create_shortcut = boom
    r = client.post("/api/system/shortcut")
    assert r.status_code == 500
    assert "Área de Trabalho" in r.json()["detail"]


def test_not_windows_reports_unsupported_and_refuses_changes(client, system):
    system.host.supported = False
    st = client.get("/api/system").json()
    assert st["supported"] is False and st["autostart"] is False
    r = client.post("/api/system/autostart", json={"enabled": True})
    assert r.status_code == 400 and "Windows" in r.json()["detail"]
    assert client.post("/api/system/shortcut").status_code == 400
    assert system.host.run is None


def test_shutdown_warns_visors_and_exits(client, app):
    called = []
    app.state.ctx.request_exit = lambda: called.append(True)
    assert client.get("/api/system").json()["can_exit"] is True
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()  # hello
        assert client.post("/api/system/shutdown").json() == {"ok": True}
        msg = ws.receive_json()
        while msg["type"] != "system.shutdown":
            msg = ws.receive_json()
    for _ in range(40):
        if called:
            break
        time.sleep(0.05)
    assert called == [True]


def test_shutdown_without_exit_hook_is_refused(client, app):
    app.state.ctx.request_exit = None
    assert client.get("/api/system").json()["can_exit"] is False
    assert client.post("/api/system/shutdown").status_code == 409


def test_icon_is_valid_ico_with_png_images():
    data = icon_bytes()
    reserved, kind, count = struct.unpack_from("<HHH", data)
    assert (reserved, kind, count) == (0, 1, len(ICON_SIZES))
    for n, size in enumerate(ICON_SIZES):
        w, h, _, _, planes, bpp, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + 16 * n)
        assert (w or 256, h or 256) == (size, size) and bpp == 32
        assert data[offset:offset + 8] == b"\x89PNG\r\n\x1a\n"
        assert offset + length <= len(data)
