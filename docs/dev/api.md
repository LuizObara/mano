# API e eventos

O backend fala com o visor por **REST** (ações e consultas) e por **WebSocket** (estado ao vivo). Com o Mano rodando, a referência interativa gerada pelo FastAPI fica em <http://127.0.0.1:8765/docs>; este documento explica o que ela não diz: para que serve cada grupo e quais eventos chegam pelo WebSocket.

Convenções:

- Datas e horas em **milissegundos desde a época** (`*_at`, `published`, `start`…), no horário local.
- Erros: `HTTPException` com `{"detail": "mensagem em português"}`, pronta para mostrar na tela.
- Toda ação que muda estado também **anuncia pelo WebSocket**, então o visor não precisa recarregar.

## Núcleo

| Método e rota | Corpo / parâmetros | Resposta |
|---|---|---|
| `GET /api/health` | — | `{"ok": true}` |
| `POST /api/command` | `{"text", "speak"=true, "source"="text"}` | `{"intent", "speech", "display", "data", "log"}` (também vai como evento `reply`) |
| `GET /api/skills` | — | Catálogo: skills, intenções e exemplos |
| `GET /api/history?limit=20` | — | Últimos comandos |
| `GET /api/voice` | — | `{"available", "reason", "wake_phrases", "muted", "state"}` |
| `POST /api/voice/listen` | — | Push-to-talk: começa a ouvir sem a frase de ativação (`ok: false` com o microfone mudo) |
| `POST /api/voice/mute` | `{"muted": true}` | Microfone mudo; fica salvo em `data/voice.json` e volta em `GET /api/voice` como `muted` |
| `GET /` | — | O visor. Também recebe o retorno do login Google (`?code=&state=`) |

`data` em `/api/command` varia por intenção. Chaves que o visor entende: `card` (cartão da Wikipedia), `link`, `notes` (lista de notas), `briefing` (notícias lidas), `understood_as` (frase reescrita pelo modelo local), `video`, `youtube_results`, `timer`, `reminder`.

## Rotina

| Método e rota | Corpo | Observação |
|---|---|---|
| `GET /api/timers` | — | Timers ativos |
| `POST /api/timers` | `{"seconds", "label"?}` | |
| `POST /api/timers/{id}/cancel` | — | |
| `POST /api/timers/{id}/dismiss` | — | Para de tocar |
| `GET /api/reminders` | — | |
| `POST /api/reminders` | `{"text", "due_at"}` (ISO) | |
| `POST /api/reminders/{id}/{cancel\|done}` | — | |
| `GET /api/meds` | — | Remédios e doses de hoje |
| `POST /api/meds` · `PUT /api/meds/{id}` | `{"name", "dose", "times": ["08:00"], "days": [0..6], "stock"?, "low_stock"}` | Dias: 0 = segunda |
| `DELETE /api/meds/{id}` | — | |
| `GET /api/meds/history?days=14` | — | Adesão por dia |
| `POST /api/meds/doses/{id}/{take\|skip\|snooze}` | — | |
| `GET /api/habits` | — | `{"habits": [...], "habits_paused_until"}`. Cada hábito traz configuração, `today_amount`, `week_amount`, `today_logs`, `amounts` (12 semanas), `history` (dias cumpridos), `streak`, `best_streak`, `next_reminder`, `remind_today` |
| `POST /api/habits` | `{"name", "icon", "days", "kind", "unit", "goal", "goal_period", "quick", "reminder"}` | `kind`: `check`, `goal` ou `free`; devolve `id` |
| `PUT /api/habits/{id}` | o mesmo | Atualiza |
| `DELETE /api/habits/{id}` | — | Arquiva (o histórico fica) |
| `POST /api/habits/{id}/toggle` | `{"day"?, "done"?}` | Sim/não. Sem `done`, inverte |
| `POST /api/habits/{id}/log` | `{"amount", "day"?, "note"?, "via"?}` | Registro de quantidade (`via`: `visor`, `lembrete`, `voz`); devolve o `id` (para desfazer) |
| `GET /api/habits/{id}/logs?day=` | — | Registros de um dia |
| `PATCH /api/habits/logs/{log_id}` | `{"amount"?, "note"?}` | Corrige um registro |
| `DELETE /api/habits/logs/{log_id}` | — | Apaga um registro |
| `POST /api/habits/{id}/snooze` | — | "Agora não": adia pelo `snooze_min` do hábito |
| `POST /api/habits/{id}/silence` | — | "Chega por hoje" para esse hábito |
| `POST /api/habits/{id}/test` | — | Dispara o aviso agora (para testar a configuração) |
| `POST /api/habits/pause` | `{"minutes"}` | Pausa geral; `0` retoma, `-1` até amanhã |

## Google

| Método e rota | Corpo | Observação |
|---|---|---|
| `GET /api/google` | — | `{"configured", "connected", "email", "redirect_uri"}` |
| `POST /api/google/client` | `{"config": <JSON do cliente OAuth>}` | Só "App para computador" |
| `GET /api/google/login` | — | Redireciona para o login |
| `POST /api/google/logout` · `POST /api/google/refresh` | — | |
| `GET /api/calendar` | — | Próximos 7 dias |
| `POST /api/calendar/events` | `{"title", "start", "minutes"=60}` | Agenda principal |
| `GET /api/tasks` · `POST /api/tasks` | `{"title", "due"?}` | Lista padrão |
| `POST /api/tasks/{id}/complete` | — | |

## Notas, mídia e pesquisa

| Método e rota | Corpo / parâmetros | Observação |
|---|---|---|
| `GET /api/notes` | — | Status do vault |
| `GET /api/notes/detect` | — | Vaults encontrados no PC |
| `POST /api/notes/config` | `{"vault": "C:\\..."}` | |
| `GET /api/notes/search?q=` | — | Vazio = recentes. Trechos marcados com «» |
| `GET /api/notes/tree` | — | Todas as notas (`path`, `title`, `folder`, `mtime`), ordenadas pelo caminho; o visor monta a árvore |
| `GET /api/notes/file?path=` | — | Conteúdo, backlinks e `obsidian_url` |
| `GET /api/notes/resolve?link=` | — | Resolve um `[[wikilink]]` |
| `POST /api/notes/capture` | `{"text"}` | Acrescenta na nota do dia |
| `GET /api/notes/captures` | — | Capturas de hoje |
| `GET /api/spotify` · `POST /api/spotify/config` | `{"client_id"}` | |
| `GET /api/spotify/login` · `GET /api/spotify/callback` · `POST /api/spotify/logout` | — | Login PKCE |
| `POST /api/spotify/control/{play\|pause\|next\|previous}` | — | |
| `GET /api/youtube/search?q=` · `POST /api/youtube/play` | `{"id", "title"}` | |

## Modelo local e briefing

| Método e rota | Corpo / parâmetros | Observação |
|---|---|---|
| `GET /api/llm` | — | Status (consulta o Ollama na hora) |
| `POST /api/llm/config` | `{"enabled"?, "fallback"?, "model"?}` | `model: ""` = automático |
| `POST /api/llm/pull` | `{"model"}` | Download em segundo plano; progresso pelo evento `llm` |
| `POST /api/llm/test` | — | `{"text", "seconds", "model"}` |
| `GET /api/briefing?view=new\|all\|starred&days=3&feed=` | — | `{"items", "feeds"}` |
| `GET /api/briefing/suggestions` | — | Feeds sugeridos ainda não adicionados |
| `POST /api/briefing/feeds` | `{"url", "title"?}` | Descobre o RSS a partir do site |
| `PATCH /api/briefing/feeds/{id}` | `{"active"?, "title"?}` | |
| `DELETE /api/briefing/feeds/{id}` | — | Apaga também as notícias |
| `POST /api/briefing/refresh` | — | Busca agora (409 se já estiver rodando) |
| `POST /api/briefing/summarize?limit=` | — | Resume agora (400 sem modelo) |
| `POST /api/briefing/items/{id}` | `{"read"?, "starred"?}` | |
| `POST /api/briefing/read-all` | `{"ids"?}` | |
| `POST /api/briefing/config` | `{"morning_at": "07:30" \| ""}` | |
| `GET /api/briefing/day` | — | Texto do "bom dia" sem falar |

## WebSocket `/ws`

Ao conectar, o servidor manda um **`hello`** com o estado completo: `voice`, `voice_status` e a junção dos `snapshot()` de todas as skills. Depois, cada mudança vem como `{"type": "<tipo>", ...}`. O visor (`frontend/src/lib/mano.ts`) aplica as chaves conhecidas no estado.

| Tipo | Conteúdo | Quem manda |
|---|---|---|
| `hello` | Estado completo (abaixo) | Núcleo, na conexão |
| `reply` | Mesmo formato da resposta de `/api/command` | Núcleo, a cada comando |
| `notice` | `{"text", "level", "title"}` | `ctx.notify()`: avisos proativos |
| `voice` | `{"state": "idle\|listening\|thinking\|speaking"}` | Voz |
| `voice.partial` | `{"text"}` | Voz, transcrição parcial |
| `voice.status` | `{"available", "reason", "wake_phrases", "muted"}` | Microfone ligado ou mudo |
| `timers` · `timer.ringing` | `{"timers": [...]}` · `{"timer"}` | Timers |
| `reminders` | `{"reminders": [...]}` | Lembretes |
| `meds` · `meds.due` | `{"meds", "doses"}` · `{"doses"}` | Remédios |
| `habits` | `{"habits": [...], "habits_paused_until"}` | Hábitos |
| `habit.remind` | `{"habit_id", "name", "kind", "unit", "message", "quick", "at", "expires_at", "amount", "goal"}` | Aviso de hábito (o visor mostra o pop-up até `expires_at`) |
| `google` · `calendar` · `gmail` · `tasks` | `{"<chave>": {...}}` | Google |
| `notes` · `notes.results` · `notes.open` | status · `{"q", "results"}` · `{"path"}` | Notas (`notes.open` faz o visor abrir a nota) |
| `spotify` | `{"spotify": {...}}` | Spotify |
| `youtube` · `youtube.results` · `youtube.close` | `{"video"}` · `{"q", "results"}` · `{}` | YouTube |
| `llm` | `{"llm": {...}}` | Modelo local (inclui `busy` e `pull`) |
| `briefing` | `{"briefing": {...}}` | Briefing (contagens, progresso, manchetes) |

Chaves do `hello`: `timers`, `reminders`, `meds`, `doses`, `habits`, `spotify`, `google`, `calendar`, `gmail`, `tasks`, `notes`, `llm`, `briefing`.

O visor também pode mandar `{"type": "command", "text", "speak"}` pelo WebSocket, equivalente a `POST /api/command`.
