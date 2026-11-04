# Solução de problemas

Primeiro passo para quase tudo: olhe o log do backend. Rodando pelo `start.ps1`, ele fica na janela minimizada do Python. Para ver ao vivo, pare o Mano e rode:

```powershell
cd backend; .\.venv\Scripts\python.exe -m mano
```

Há uma interface interativa da API em <http://127.0.0.1:8765/docs>, útil para testar uma rota direto.

## O visor

| Sintoma | O que fazer |
|---|---|
| "Sem conexão com o Mano" piscando | O backend caiu ou não subiu. Veja o log; confira se a porta 8765 não está ocupada (`netstat -ano \| findstr 8765`) |
| Página mostra `{"frontend": "não compilado"}` | Rode `.\scripts\start.ps1 -Build` |
| Mudança no visor não aparece | Recompile (`-Build`) e recarregue com Ctrl+F5 (o navegador pode estar com a página antiga em cache) |

## Voz

| Sintoma | O que fazer |
|---|---|
| Ajustes → Voz diz "Voz indisponível" | O motivo aparece ao lado. Normalmente falta o modelo: rode `.\scripts\get-models.ps1` |
| Não reage ao "fala Mano" | Desça `MANO_WAKE_CONF` (ex.: 0.6). Confira o microfone padrão do Windows ou defina `MANO_MIC_DEVICE` |
| Dispara sozinho com conversa ou TV | Suba `MANO_WAKE_CONF` (ex.: 0.85) |
| Corta o comando no meio | Fale sem pausas longas; aumente `MANO_MAX_UTTERANCE_S` se forem frases longas |
| Não fala nada | Confira `MANO_TTS_ENABLED` e se a voz "Microsoft Maria" está instalada (Configurações → Hora e idioma → Fala) |
| Para descobrir o índice do microfone | `cd backend; .\.venv\Scripts\python.exe -c "import sounddevice; print(sounddevice.query_devices())"` |

## Remédios e avisos

| Sintoma | O que fazer |
|---|---|
| Aviso não tocou | O notebook estava suspenso ou o Mano fechado. Veja [O que falta](../pendencias.md) |
| Sem notificação do Windows | Confira `MANO_TOAST_ENABLED` e o "Não perturbe"/assistente de foco do Windows |

## Spotify

| Sintoma | O que fazer |
|---|---|
| "INVALID_CLIENT: Invalid redirect URI" | O Redirect URI no painel do Spotify tem que ser exatamente `http://127.0.0.1:8765/api/spotify/callback` |
| "Nenhum aparelho" ou não toca | Abra o Spotify do PC uma vez; o Mano tenta abrir sozinho. Controle exige Premium |
| Desconectou | Ajustes → Spotify → Conectar de novo |

## Google

| Sintoma | O que fazer |
|---|---|
| "Esse não parece o JSON de credenciais" | Baixe o JSON do cliente OAuth do tipo **App para computador** (não "Aplicativo da Web", não conta de serviço) |
| "Acesso bloqueado" ou "app não verificado" | Normal para app pessoal: Avançado → Acessar Mano. Se bloquear de vez, seu e-mail precisa estar em "Usuários de teste" ou o app publicado |
| Desconecta toda semana | O app está em modo "Teste". Publique como "Em produção" |
| Cards com "Não consegui atualizar agora" | Sem internet ou token expirado. Ajustes → Google → Conectar de novo |

## Notas (Obsidian)

| Sintoma | O que fazer |
|---|---|
| Vault não aparece na lista | Cole o caminho da pasta (a que contém `.obsidian`) |
| Nota nova não aparece na busca | O índice atualiza a cada minuto |
| Captura foi para a pasta errada | Configure o plugin Daily Notes no Obsidian (pasta e formato); o Mano respeita |

## Modelo local (Ollama)

| Sintoma | O que fazer |
|---|---|
| "O Ollama está parado" | O Mano tenta subir `ollama serve` sozinho se o Ollama estiver em `%LOCALAPPDATA%\Programs\Ollama`. Senão, abra o Ollama ou rode `ollama serve` |
| "Nenhum modelo baixado" | Ajustes → Modelo local → Baixar (ex.: `gemma4:e2b-it-qat`), ou `ollama pull` no terminal |
| Muito lento ou o PC trava | Use um modelo menor (`gemma3:1b`), feche programas pesados, ou mova o Ollama para outro PC com `MANO_OLLAMA_URL` |
| Resumos com erros de fato | Modelos de 1B inventam mais; prefira os de 2–4B |
| Plano B entendeu errado | O visor mostra "entendi como …". Use a frase da [lista de comandos](comandos.md) ou desligue o plano B em Ajustes |

## Briefing

| Sintoma | O que fazer |
|---|---|
| "Não achei um feed RSS nesse endereço" | Procure o link do feed no site (geralmente `/feed`, `/rss` ou `.xml`) e cole ele direto |
| Feed com aviso vermelho | O site não respondeu na última busca; ele tenta de novo em 2 h. Se persistir, o endereço mudou |
| Notícias sem resumo do Mano | Os resumos saem às 05:00. Use **Resumir agora** (precisa do modelo local) |

## Recomeçar do zero

Para apagar tudo e começar limpo, feche o Mano e apague `data\mano.db` (perde remédios, hábitos, histórico, feeds). Para desconectar uma conta, apague o `*_token.json` correspondente em `data\`.
