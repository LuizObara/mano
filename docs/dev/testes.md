# Testes e verificação

## Rodar

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q                      # tudo (~1 min)
.\.venv\Scripts\python.exe -m pytest -q tests/test_parser.py # um arquivo
.\.venv\Scripts\python.exe -m pytest -q -k notas             # por nome
.\.venv\Scripts\python.exe -m pytest -q -p no:faulthandler   # esconde o ruído dos testes de voz
```

Os testes de voz imprimem `Windows fatal exception: code 0xe0000002`: é o faulthandler do pytest reagindo a uma exceção interna do COM/Vosk que é tratada. Os testes passam.

Frontend (sem testes automatizados ainda; o mínimo é compilar sem erro de tipo):

```powershell
cd frontend
npx tsc --noEmit -p .
npm run build
```

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `test_parser.py` | Normalização, números por extenso, durações, roteamento de frases |
| `test_when.py` | Datas e horas faladas ("sexta às 10", "daqui a 2 horas") |
| `test_api.py` | Núcleo: comandos, histórico, timers tocando e sobrevivendo a reinício |
| `test_routine.py` | Remédios (repetição, adiar, desistência, estoque), hábitos (sequência), lembretes |
| `test_habits.py` | Hábitos por tipo (sim/não, meta, livre), registros, banco antigo ganhando colunas, cobranças (janela, pular se registrou, meta batida, pausa, adiar, silenciar, horários fixos) e frases por voz |
| `test_voice.py` | Laço de voz com áudio sintetizado pelo SAPI (ativação, comando junto, push-to-talk, mudo enquanto fala) |
| `test_media.py` | Spotify (frases → chamadas), YouTube, Wikipedia |
| `test_google.py` | Agenda, Gmail, Tarefas, login, aviso de compromisso |
| `test_notes.py` | Índice do vault, busca, captura só por acréscimo, nota do dia, links |
| `test_llm_briefing.py` | Plano B do modelo local, resumos, feeds, notícias por voz, "bom dia", resumo de e-mails |
| `test_docs.py` | Cada frase de `docs/guia/comandos.md` cai na intenção documentada, e toda intenção tem exemplo |

## Fixtures (`tests/conftest.py`)

| Fixture | O que dá |
|---|---|
| `settings` | `Settings` com `data_dir` temporário, voz/fala/notificação desligadas, modelo local desligado e apontado para `http://ollama.test` |
| `speaker` | `NullSpeaker`: guarda o que seria falado em `speaker.said` |
| `app` | `create_app(settings, speaker)` |
| `registry` | O `Registry` do app (para testar frases sem HTTP) |
| `client` | `TestClient` com o ciclo de vida (skills iniciadas, agendador rodando) |

Para mudar uma configuração num arquivo de teste, sobrescreva a fixture:

```python
@pytest.fixture
def settings(settings):
    return settings.model_copy(update={"llm_enabled": True})
```

## Dublês de serviços externos

Nenhum teste usa a internet. Cada integração aceita trocar o cliente HTTP por um `httpx.MockTransport`:

| Dublê | Onde | Simula |
|---|---|---|
| `FakeGoogle` | `test_google.py` | Calendar, Gmail, Tasks (eventos, não lidos, tarefas) |
| `FakeOllama` | `test_llm_briefing.py` | `/api/tags` e `/api/generate` (respostas por tipo de prompt) |
| `FakeWeb` | `test_llm_briefing.py` | Um blog com página, feed RSS e artigos |
| `FakeSpotify` | `test_media.py` | Cliente spotipy (aparelhos, busca, controles) |

Exemplo de uso:

```python
ctx = app.state.ctx
ctx.llm.http = httpx.AsyncClient(transport=httpx.MockTransport(FakeOllama()))
```

Para rodar uma corrotina de skill dentro do loop do app (com o `client` aberto):

```python
loop = app.state.ctx.hub.loop
asyncio.run_coroutine_threadsafe(skill.fetch_all(), loop).result(10)
```

## Verificar no visor sem mexer nos seus dados

Antes de dar uma mudança por pronta, olhe no visor rodando. Para não sujar `data\` (remédios, histórico, vault):

1. Crie um `.env` temporário na raiz:

   ```ini
   MANO_DATA_DIR=C:/caminho/temporario/mano-data
   MANO_TTS_ENABLED=false
   MANO_VOICE_ENABLED=false
   MANO_TOAST_ENABLED=false
   ```

2. Suba o backend (`python -m mano`, ou a configuração `mano` de `.claude/launch.json`) e use o visor.
3. Para testar notas, use uma **cópia** do vault (`robocopy <vault> <cópia> /E /XD .git`), nunca o vault real.
4. Para testar o Google sem conta, suba uma instância em outra porta com o `FakeGoogle` (foi assim na fase 4).
5. No fim: apague o `.env` temporário e a pasta de dados.

## Antes de commitar

- [ ] `pytest -q` passando.
- [ ] `npm run build` sem erro (se mexeu no visor).
- [ ] Frases novas em `docs/guia/comandos.md`.
- [ ] Olhou a mudança no visor rodando (se for visível).
- [ ] Nenhum arquivo de `data\`, `.env` ou credencial no `git status`.
