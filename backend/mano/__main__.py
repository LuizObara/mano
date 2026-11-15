import logging

import uvicorn

from .config import Settings
from .main import create_app


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings()
    app = create_app(settings)
    server = uvicorn.Server(uvicorn.Config(app, host=settings.host, port=settings.port, log_level="info"))
    # "Fechar o Mano" em Ajustes: o mesmo desligamento organizado do Ctrl+C
    app.state.ctx.request_exit = lambda: setattr(server, "should_exit", True)
    server.run()


if __name__ == "__main__":
    run()
