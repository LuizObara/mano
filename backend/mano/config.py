from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Configuração do Mano. Pode ser sobrescrita por variáveis MANO_* ou pelo arquivo .env na raiz."""

    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_prefix="MANO_", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8765
    data_dir: Path = ROOT / "data"
    frontend_dist: Path = ROOT / "frontend" / "dist"

    # Voz de saída (SAPI do Windows por enquanto; Piper entra depois)
    tts_enabled: bool = True
    tts_voice: str = "Maria"
    tts_rate: int = 1  # -10..10

    # Voz de entrada (Vosk offline)
    voice_enabled: bool = True
    vosk_model_path: Path | None = None  # padrão: data/models/vosk-model-small-pt-0.3
    wake_phrases: list[str] = ["fala mano", "ei mano", "oi mano"]
    wake_conf: float = 0.75  # 0..1; suba se disparar à toa, desça se não ouvir
    listen_timeout_s: float = 6.0
    max_utterance_s: float = 15.0
    mic_device: int | str | None = None  # None = microfone padrão do Windows

    # Avisos
    toast_enabled: bool = True  # notificação do Windows

    # Remédios
    med_repeat_min: int = 5  # repete o alerta até confirmar
    med_snooze_min: int = 10
    med_give_up_min: int = 120  # depois disso a dose vira "não tomada"

    # Spotify (Web API com PKCE: só o Client ID, sem segredo). Também pode ser salvo pela aba Ajustes.
    spotify_client_id: str | None = None
    spotify_redirect_uri: str = "http://127.0.0.1:8765/api/spotify/callback"
    spotify_poll_s: int = 5

    # Google (Gmail, Agenda, Tarefas). O retorno do login é a raiz do Mano (loopback de "app para computador").
    google_redirect_uri: str = "http://127.0.0.1:8765/"
    event_heads_up_min: int = 10  # avisa antes de compromissos da agenda

    # Internet (Wikipedia exige um User-Agent identificável)
    http_user_agent: str = "Mano/0.1 (https://www.mediawiki.org/wiki/API:Etiquette; assistente pessoal local) httpx/0.28"

    # Timers
    timer_ring_repeat_s: int = 30  # repete o aviso falado enquanto o timer toca
    timer_ring_max_s: int = 300  # desiste de tocar depois disso

    @property
    def db_path(self) -> Path:
        return self.data_dir / "mano.db"

    @property
    def vosk_model_dir(self) -> Path:
        return self.vosk_model_path or self.data_dir / "models" / "vosk-model-small-pt-0.3"
