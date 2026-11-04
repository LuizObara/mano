"""Notificação nativa do Windows (aparece mesmo com o visor fechado)."""

import logging
import sys
import threading

log = logging.getLogger(__name__)


def toast(title: str, body: str) -> None:
    if sys.platform != "win32":
        return

    def run() -> None:
        try:
            from winotify import Notification, audio

            n = Notification(app_id="Mano", title=title, msg=body, duration="long")
            n.set_audio(audio.Reminder, loop=False)
            n.show()
        except Exception:
            log.exception("falha ao mostrar notificação")

    # winotify chama o PowerShell (~1 s); não trava o loop
    threading.Thread(target=run, name="toast", daemon=True).start()
