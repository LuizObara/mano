# Documentação do Mano

O Mano é um assistente pessoal que roda inteiro neste notebook: visor no navegador, comandos por voz ("fala Mano") e por texto, rotina (remédios, hábitos, lembretes), cockpit Google, notas do Obsidian, música, vídeos, pesquisa e um briefing de notícias resumido por um modelo de linguagem local.

## Para usar

| Guia | Para quê |
|---|---|
| [Instalação](guia/instalacao.md) | Instalar do zero, baixar os modelos, abrir o visor e iniciar com o Windows |
| [Configuração](guia/configuracao.md) | Conectar Spotify, Google, Obsidian, modelo local e feeds; todas as variáveis do `.env` |
| [Uso do dia a dia](guia/uso.md) | Visor, abas, voz, remédios, hábitos, notas, briefing |
| [Comandos aceitos](guia/comandos.md) | Tudo o que dá para falar ou digitar, por assunto |
| [Solução de problemas](guia/problemas.md) | Microfone, voz, Spotify, Google, Ollama, feeds |
| [O que falta](pendencias.md) | Configurações pendentes, fase 7, limitações conhecidas e ideias |

## Para desenvolver

| Documento | Para quê |
|---|---|
| [Arquitetura](dev/arquitetura.md) | Como as peças se encaixam: backend, skills, voz, agendador, WebSocket, dados |
| [Criar uma skill](dev/skills.md) | Passo a passo e referência de `@intent`, `Reply`, rotas e eventos |
| [API e eventos](dev/api.md) | Rotas REST e mensagens do WebSocket |
| [Testes e verificação](dev/testes.md) | Como rodar, os dublês (Google, Ollama, web) e como testar sem mexer nos seus dados |
| [Convenções](dev/convencoes.md) | Idioma, estilo, versões, commits, segurança |
| [Decisões](dev/decisoes.md) | Por que cada escolha foi feita (e quando revisitar) |

## Em uma frase por fase

| Fase | O que entrou |
|---|---|
| 0 | Fundação: backend FastAPI, visor React, parser PT-BR, voz Maria (SAPI), hora/data, timers |
| 1 | Voz offline: frase de ativação, reconhecimento Vosk, push-to-talk |
| 2 | Rotina: remédios que repetem até confirmar, hábitos com sequência, lembretes |
| 3 | Spotify, YouTube no visor, pesquisa rápida (Wikipedia/Google) |
| 4 | Cockpit Google: Agenda, Gmail (leitura), Tarefas |
| 5 | Segundo cérebro: busca e captura no vault do Obsidian |
| 6 | Modelo local (Ollama): plano B dos comandos, briefing de notícias, "bom dia", resumo de e-mails |
| 7 | *Opcional, não feita:* mini servidor (alertas no celular, modelo remoto) |
