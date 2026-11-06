# Mano

Assistente pessoal local: visor + comandos por texto e por voz, rodando nesta máquina, sem nuvem.

**Documentação completa em [`docs/`](docs/README.md)**: [instalação](docs/guia/instalacao.md), [configuração](docs/guia/configuracao.md), [uso](docs/guia/uso.md), [comandos aceitos](docs/guia/comandos.md), [problemas](docs/guia/problemas.md), [o que falta](docs/pendencias.md) e [guias de desenvolvimento](docs/README.md#para-desenvolver).

## Rodar

```powershell
.\scripts\start.ps1          # compila o frontend se faltar, sobe o backend e abre o visor (janela do Edge)
.\scripts\start.ps1 -Build   # força recompilar o frontend
```

O visor fica em http://127.0.0.1:8765. No Edge, menu ⋯ → Aplicativos → "Instalar este site como aplicativo" para ter ícone próprio.

## Voz

- Diga **"fala Mano"** (ou "ei Mano" / "oi Mano"), espere o *plim* e fale o comando.
  Também dá para dizer tudo de uma vez: "fala Mano, timer de dez minutos pro arroz".
- Sem frase de ativação: botão do microfone no visor ou **Ctrl+Espaço** com o visor em foco.
- Tudo offline: reconhecimento com Vosk (`data/models`, baixado por `scripts/get-models.ps1`),
  fala com a voz Maria do Windows. Enquanto o Mano fala, o microfone é ignorado.
- Ajustes no `.env`: `MANO_WAKE_CONF` (0–1; suba se disparar à toa, desça se não te ouvir),
  `MANO_MIC_DEVICE` (índice ou nome do microfone), `MANO_VOICE_ENABLED=false` para desligar.

## Rotina

- **Remédios** (aba Remédios): nome, dose, horários, dias e estoque opcional. No horário o Mano avisa
  por voz, na tela e com notificação do Windows, e repete a cada 5 min até "tomei" (ou o botão).
  "Adiar" empurra 10 min; após 2 h sem resposta a dose fica como não tomada. Estoque baixo gera aviso.
  Por voz: "tomei", "pula o remédio", "adia", "quais remédios de hoje?", "já tomei o remédio hoje?".
- **Hábitos** (aba Hábitos): checklist diário, sequência e grade de 35 dias (clique para marcar dias passados).
  Por voz: "fiz exercício", "desmarca leitura", "quais hábitos faltam?".
- **Lembretes**: "me lembra de pagar o boleto amanhã às 10", "me lembra em 20 minutos de tirar o bolo",
  "quais são meus lembretes?", "cancela o lembrete do boleto". "Ok"/"para" dispensa o que estiver tocando.
- **Alarmes** (Ajustes → Alarmes e avisos): som, volume, toque único ou contínuo, voz, notificação, repetição e horário silencioso para cada tipo de aviso, com botão de testar.
- Com o notebook desligado ou suspenso não há aviso (aviso no celular está previsto na fase 7).

## Mídia e pesquisa

- **Spotify** (Premium): configure na aba **Ajustes** (Client ID do app criado em developer.spotify.com,
  sem segredo) e clique em Conectar. "Toca Djavan", "toca a playlist treino", "toca o álbum Acabou Chorare",
  "toca minhas músicas curtidas", "pausa", "próxima música", "volume 40", "que música é essa?".
  Sem aparelho ativo, o Mano abre o Spotify do PC.
- **YouTube**: "abre um vídeo de receita de pão no YouTube" toca no visor; "pesquisa no YouTube aula de violão"
  mostra os resultados para escolher. "Fecha o vídeo" ou Esc fecha. Abrir vídeo pausa o Spotify.
- **Pesquisa**: "o que é fotossíntese?" / "quem foi Machado de Assis?" respondem falando com o resumo
  da Wikipedia (e cartão na tela); "pesquisa preço do dólar" abre o Google no navegador do PC.

## Cockpit Google

Configure na aba **Ajustes** (passo a passo na tela): projeto no Google Cloud com Gmail, Calendar e Tasks API,
app publicado "Em produção" (no modo Teste o login expira a cada 7 dias), cliente OAuth **App para computador**,
envio do JSON e "Conectar". Credenciais e token ficam em `data/` (fora do git).

- **Agenda**: próximos 7 dias de todas as agendas visíveis; aviso falado 10 min antes (`MANO_EVENT_HEADS_UP_MIN`).
  "Qual minha agenda de hoje/amanhã/da semana?", "qual meu próximo compromisso?",
  "marca dentista sexta às 10", "coloca na agenda reunião com a Ana amanhã às 15" (1 h na agenda principal).
- **E-mail** (só leitura): não lidos da caixa principal (sem promoções/social). "Tenho e-mail novo?", "lê meus e-mails".
- **Tarefas** (lista padrão do Google Tasks, sincroniza com o celular): "adiciona tarefa comprar pão amanhã",
  "coloca pagar internet nas tarefas", "quais são minhas tarefas?", "conclui a tarefa comprar pão".

## Segundo cérebro (Obsidian)

Aponte o vault na aba **Ajustes** (o Mano procura sozinho pastas com `.obsidian`). A aba **Notas** busca no vault
inteiro ignorando acentos, mostra a nota renderizada com `[[links]]` clicáveis, menções e botão "Abrir no Obsidian".

- "Anota que a reunião foi remarcada pra sexta" → acrescenta `- HH:MM texto` na seção `## Capturas` da nota do dia
  (pasta e formato lidos do plugin Daily Notes; sem configuração, usa a pasta onde já estão suas diárias e copia
  o frontmatter da diária mais recente). O Mano só acrescenta, nunca apaga nem reescreve.
- "Procura nas notas sobre lógica", "o que eu anotei sobre SIA?", "lê a nota sobre RenovarTech", "o que eu anotei hoje?".
- O índice (SQLite FTS5, dentro de `data/mano.db`) se atualiza a cada minuto.

## Modelo local e briefing

O Mano usa o **Ollama** já instalado neste PC (sobe o `ollama serve` sozinho quando precisa) e escolhe o melhor modelo
baixado (hoje o `gemma4:e2b-it-qat`). Troque o modelo, teste ou baixe outro na aba **Ajustes**. Neste notebook a primeira
pergunta leva ~40 s para carregar o modelo; as seguintes, poucos segundos. Ele sai da memória após 5 min sem uso.

- **Plano B dos comandos**: o que as regras não entendem vai para o modelo, que só *reescreve* a frase num comando conhecido
  ("preciso sair daqui a quarenta minutos, me dá um toque" → "me avisa em 40 minutos"). Quem executa continua sendo o parser.
  O visor mostra "entendi como …". Desligável em Ajustes.
- **Briefing** (aba Briefing): cole o endereço de blogs/sites (o feed RSS é achado sozinho) ou use as sugestões.
  Busca a cada 2 h; às 05:00 o modelo resume em 2–3 frases as até 30 notícias mais recentes (sem modelo, aparece o começo
  do artigo). "Quais as notícias?", "mais notícias".
- **Bom dia**: "fala Mano, bom dia" junta data, agenda, remédios, hábitos, tarefas, e-mails e manchetes. Pode tocar sozinho
  num horário escolhido na aba Briefing.
- **E-mails**: "resume meus e-mails" (ou o botão no card de e-mail) resume os não lidos da caixa principal.
- `.env`: `MANO_OLLAMA_URL` (ex.: o mini servidor), `MANO_LLM_MODEL`, `MANO_LLM_KEEP_ALIVE`, `MANO_BRIEFING_SUMMARIZE_AT`,
  `MANO_BRIEFING_FETCH_MIN`.

## Desenvolvimento

```powershell
# backend (porta 8765)
cd backend; .\.venv\Scripts\python.exe -m mano
# testes
cd backend; .\.venv\Scripts\python.exe -m pytest -q
# frontend com hot reload (porta 5173, faz proxy para o backend)
cd frontend; npm run dev
```

Configuração por `.env` na raiz (variáveis `MANO_*`, ver `backend/mano/config.py`). Ex.: `MANO_TTS_ENABLED=false` silencia a voz.

## Como adicionar uma skill

Guia completo em [docs/dev/skills.md](docs/dev/skills.md). Resumo:

1. Crie `backend/mano/skills/minha_skill.py` com uma classe `Skill`.
2. Marque handlers com `@intent("nome", patterns=[...], examples=[...])`. Os padrões rodam sobre o texto
   normalizado: minúsculo, sem acento, sem "Mano," no começo e com números em dígitos ("dez" → "10").
3. Se precisar de API para a UI, devolva um `APIRouter` em `router()`.
4. Registre a classe em `ALL_SKILLS` (`backend/mano/skills/__init__.py`) e adicione as frases em `docs/guia/comandos.md` (o teste `test_docs.py` confere).

## Fases

0. ✅ Fundação: backend, visor, parser PT-BR, voz de saída (Maria/SAPI), hora/data, timers
1. ✅ Voz: frase de ativação, reconhecimento offline (Vosk), push-to-talk
2. ✅ Rotina: remédios (repete até confirmar), hábitos, lembretes
3. ✅ Spotify, YouTube, pesquisa rápida
4. ✅ Gmail, Google Agenda, Google Tasks
5. ✅ Segundo cérebro (vault do Obsidian)
6. ✅ LLM local (Ollama) + briefing de notícias
7. Opcional: mini servidor (alertas no celular via ntfy, LLM remoto)
