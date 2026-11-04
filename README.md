# Mano

Assistente pessoal local: visor + comandos por texto e por voz, rodando nesta máquina, sem nuvem.

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
- Ajustes no `.env`: `MANO_MED_REPEAT_MIN`, `MANO_MED_SNOOZE_MIN`, `MANO_MED_GIVE_UP_MIN`, `MANO_TOAST_ENABLED`.
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

1. Crie `backend/mano/skills/minha_skill.py` com uma classe `Skill`.
2. Marque handlers com `@intent("nome", patterns=[...], examples=[...])`. Os padrões rodam sobre o texto
   normalizado: minúsculo, sem acento, sem "Mano," no começo e com números em dígitos ("dez" → "10").
3. Se precisar de API para a UI, devolva um `APIRouter` em `router()`.
4. Registre a classe em `ALL_SKILLS` (`backend/mano/skills/__init__.py`) e adicione frases em `tests/test_parser.py`.

## Fases

0. ✅ Fundação: backend, visor, parser PT-BR, voz de saída (Maria/SAPI), hora/data, timers
1. ✅ Voz: frase de ativação, reconhecimento offline (Vosk), push-to-talk
2. ✅ Rotina: remédios (repete até confirmar), hábitos, lembretes
3. ✅ Spotify, YouTube, pesquisa rápida
4. Gmail, Google Agenda, Google Tasks
5. Segundo cérebro (vault do Obsidian)
6. LLM local (Ollama) + briefing de notícias
7. Opcional: mini servidor (alertas no celular via ntfy, LLM remoto)
