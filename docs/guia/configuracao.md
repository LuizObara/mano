# Configuração

Quase tudo se configura pela aba **Ajustes** do visor. O resto fica no arquivo `.env` na raiz do projeto (crie se não existir). Credenciais **nunca** vão para o git: ficam em `data\`.

## Integrações (aba Ajustes)

### Obsidian (segundo cérebro)

1. Abra **Ajustes → Segundo cérebro (Obsidian)**. O Mano procura sozinho pastas com `.obsidian` em Documentos, Área de Trabalho, OneDrive, Dropbox, Google Drive e iCloud (até 4 níveis de profundidade).
2. Clique em **Usar** no vault certo (ou cole o caminho da pasta).
3. Pronto: a aba **Notas** passa a buscar no vault e "anota que…" escreve na nota do dia.

Como o Mano decide onde fica a nota do dia:

- se o plugin **Daily Notes** estiver configurado (`.obsidian/daily-notes.json`), usa a pasta, o formato e o template dele;
- senão, usa a pasta onde já existem mais arquivos `AAAA-MM-DD.md` e copia o frontmatter da diária mais recente.

O Mano **só acrescenta** texto (numa seção `## Capturas`), nunca reescreve nem apaga. Se o vault é sincronizado (Obsidian Sync, git), as capturas só chegam aos outros aparelhos se esta pasta também estiver sincronizada.

### Spotify (precisa de Premium)

1. Entre em <https://developer.spotify.com/dashboard> e clique em **Create app**.
2. Em **Redirect URIs** coloque exatamente `http://127.0.0.1:8765/api/spotify/callback` e marque **Web API**.
3. Copie o **Client ID** e cole em **Ajustes → Spotify**. Não precisa do Client Secret (o login usa PKCE).
4. Clique em **Conectar minha conta**.

Sem nenhum aparelho tocando, o Mano abre o Spotify do PC antes de mandar tocar.

### Google (Agenda, Gmail, Tarefas)

O passo a passo também aparece na tela:

1. Em <https://console.cloud.google.com> crie um projeto (ex.: Mano).
2. Ative **Gmail API**, **Google Calendar API** e **Google Tasks API**.
3. Em **Google Auth Platform**: público **Externo**, nome Mano e seu e-mail. Em **Público-alvo** clique em **Publicar app** ("Em produção"). No modo "Teste" o Google desconecta a cada 7 dias.
4. Em **Clientes**, crie um cliente OAuth do tipo **App para computador** e baixe o JSON.
5. Envie o JSON em **Ajustes → Google** e clique em **Conectar**.

Permissões pedidas: Gmail só leitura; Agenda leitura e criação de eventos; Tarefas leitura e escrita. O app fica "não verificado" (é só seu); na tela de login clique em **Avançado → Acessar Mano**.

### Modelo local (Ollama)

Em **Ajustes → Modelo local**:

- **Usar o modelo local**: liga os resumos (notícias, e-mails).
- **Tentar entender pelo modelo**: liga o plano B para frases fora dos comandos.
- **Modelo**: "Automático" escolhe o melhor instalado, nesta ordem: `gemma4:e2b-it-qat`, `gemma4:e2b`, `qwen3:4b`, `gemma3:4b`, `qwen2.5:3b`, `qwen3:1.7b`, `llama3.2:3b`, `gemma3:1b`, `qwen2.5:1.5b`.
- **Testar** mostra uma resposta e quanto tempo levou.
- **Baixar outro modelo** aceita qualquer nome do catálogo do Ollama, com barra de progresso.

### Briefing

Na aba **Briefing**, cole o endereço de um blog ou site (o feed RSS é achado sozinho) ou use as sugestões. No card **Bom dia** dá para escolher um horário para o Mano falar o resumo do dia sozinho.

## Variáveis do `.env`

Todas começam com `MANO_`. Exemplo de `.env`:

```ini
MANO_WAKE_CONF=0.8
MANO_TOAST_ENABLED=false
MANO_BRIEFING_SUMMARIZE_AT=04:30
```

Reinicie o Mano depois de mudar o `.env`. A lista completa está em `backend/mano/config.py`.

### Geral

| Variável | Padrão | O que faz |
|---|---|---|
| `MANO_HOST` | `127.0.0.1` | Endereço do servidor. Só este PC acessa; ver [O que falta](../pendencias.md) antes de abrir para a rede |
| `MANO_PORT` | `8765` | Porta. Se mudar, ajuste também os endereços de retorno do Spotify e do Google |
| `MANO_DATA_DIR` | `data` | Pasta dos dados pessoais (útil para testar com dados descartáveis) |
| `MANO_HTTP_USER_AGENT` | `Mano/0.1 (…)` | Identificação nas consultas à Wikipedia |

### Voz

| Variável | Padrão | O que faz |
|---|---|---|
| `MANO_TTS_ENABLED` | `true` | Liga a fala do Mano |
| `MANO_TTS_VOICE` | `Maria` | Parte do nome da voz do Windows a usar |
| `MANO_TTS_RATE` | `1` | Velocidade da fala (−10 a 10) |
| `MANO_VOICE_ENABLED` | `true` | Liga o microfone e a frase de ativação |
| `MANO_WAKE_PHRASES` | `["fala mano","ei mano","oi mano"]` | Frases de ativação (JSON) |
| `MANO_WAKE_CONF` | `0.75` | Confiança mínima (0–1). Suba se disparar à toa; desça se não te ouvir |
| `MANO_LISTEN_TIMEOUT_S` | `6` | Espera pelo começo da fala depois do "plim" |
| `MANO_MAX_UTTERANCE_S` | `15` | Duração máxima de um comando falado |
| `MANO_MIC_DEVICE` | padrão do Windows | Índice ou nome do microfone |
| `MANO_VOSK_MODEL_PATH` | `data/models/vosk-model-small-pt-0.3` | Outro modelo Vosk (ex.: o grande, mais preciso e mais pesado) |

### Avisos e rotina

| Variável | Padrão | O que faz |
|---|---|---|
| `MANO_TOAST_ENABLED` | `true` | Notificações do Windows |
| `MANO_MED_REPEAT_MIN` | `5` | Repete o aviso de remédio a cada N minutos até "tomei" |
| `MANO_MED_SNOOZE_MIN` | `10` | Quanto o "adia" empurra |
| `MANO_MED_GIVE_UP_MIN` | `120` | Depois disso a dose vira "não tomada" |
| `MANO_TIMER_RING_REPEAT_S` | `30` | Repete o aviso do timer a cada N segundos |
| `MANO_TIMER_RING_MAX_S` | `300` | Para de tocar depois disso |
| `MANO_EVENT_HEADS_UP_MIN` | `10` | Aviso falado antes de compromissos da agenda |

### Integrações

| Variável | Padrão | O que faz |
|---|---|---|
| `MANO_SPOTIFY_CLIENT_ID` | — | Alternativa a colar o Client ID nos Ajustes |
| `MANO_SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:8765/api/spotify/callback` | Tem que ser igual ao cadastrado no Spotify |
| `MANO_SPOTIFY_POLL_S` | `5` | Intervalo do "tocando agora" |
| `MANO_GOOGLE_REDIRECT_URI` | `http://127.0.0.1:8765/` | Retorno do login Google |
| `MANO_VAULT_PATH` | — | Alternativa a escolher o vault nos Ajustes |

### Modelo local e briefing

| Variável | Padrão | O que faz |
|---|---|---|
| `MANO_OLLAMA_URL` | `http://127.0.0.1:11434` | Onde está o Ollama (ex.: `http://192.168.15.85:11434` no mini servidor) |
| `MANO_LLM_ENABLED` | `true` | Valor inicial do "Usar o modelo local" |
| `MANO_LLM_FALLBACK` | `true` | Valor inicial do plano B dos comandos |
| `MANO_LLM_MODEL` | automático | Força um modelo |
| `MANO_LLM_AUTOSTART` | `true` | Sobe o `ollama serve` local se estiver parado |
| `MANO_LLM_KEEP_ALIVE` | `5m` | Quanto tempo o modelo fica na memória depois do uso |
| `MANO_LLM_NUM_CTX` | `4096` | Janela de contexto |
| `MANO_LLM_TIMEOUT_S` | `600` | Limite de cada geração em lote |
| `MANO_LLM_FALLBACK_TIMEOUT_S` | `60` | Limite do plano B (depois disso: "não entendi") |
| `MANO_BRIEFING_FETCH_MIN` | `120` | Busca novidades a cada N minutos |
| `MANO_BRIEFING_SUMMARIZE_AT` | `05:00` | Horário dos resumos em lote |
| `MANO_BRIEFING_MAX_PER_FEED` | `6` | Itens novos por feed a cada busca |
| `MANO_BRIEFING_SUMMARIZE_MAX` | `30` | Resumos por rodada (~45 s cada neste notebook) |
| `MANO_BRIEFING_KEEP_DAYS` | `14` | Notícias mais antigas são apagadas (as salvas ficam) |

O que é escolhido na aba Ajustes (modelo, liga/desliga) fica em `data\llm.json` e vale mais que o `.env`.
