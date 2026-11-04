import pytest
from fastapi.testclient import TestClient

from mano.config import Settings
from mano.main import create_app
from mano.voice.tts import NullSpeaker


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, frontend_dist=tmp_path / "nofrontend", tts_enabled=False, voice_enabled=False,
                    timer_ring_repeat_s=1, timer_ring_max_s=60, _env_file=None)


@pytest.fixture
def speaker():
    return NullSpeaker()


@pytest.fixture
def app(settings, speaker):
    return create_app(settings, speaker=speaker)


@pytest.fixture
def registry(app):
    return app.state.ctx.registry


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c
