# O que falta

Situação em novembro de 2026, com as fases 0 a 6 prontas.

## Configuração pendente (do seu lado)

Nada disso exige código; tudo se faz pelo visor (ver [Configuração](guia/configuracao.md)).

- [ ] Cadastrar os remédios de verdade na aba **Remédios** (com estoque, se quiser o aviso de reposição).
- [ ] Cadastrar os hábitos na aba **Hábitos**.
- [ ] Criar o app no Spotify Developer e colar o Client ID em **Ajustes**.
- [ ] Criar o projeto no Google Cloud, enviar o JSON e conectar em **Ajustes**. O Gmail e o resumo de e-mails só foram testados com uma conta simulada.
- [ ] Clicar em **Usar** no vault do Obsidian em **Ajustes** (se ainda não fez).
- [ ] Escolher os feeds do briefing na aba **Briefing**.
- [ ] Testar a frase de ativação com o microfone real e calibrar `MANO_WAKE_CONF`.
- [ ] Deixar o Mano iniciando com o Windows e o notebook sem suspender na tomada (ver [Instalação](guia/instalacao.md#iniciar-junto-com-o-windows)).

## Fase 7 (opcional, não iniciada)

Usa o mini servidor (Ubuntu Server, 8 GB, `192.168.15.85`).

- **Alertas no celular** com [ntfy](https://ntfy.sh) auto-hospedado: remédios e lembretes chegam ao celular mesmo com o notebook desligado ou suspenso. Precisa de um agendador no servidor (as doses do dia são enviadas para lá) ou o notebook passa a ser só o visor.
- **Modelo de linguagem remoto**: rodar o Ollama no servidor e apontar `MANO_OLLAMA_URL` para ele. Já funciona trocando a URL; falta instalar e medir (8 GB de RAM sem GPU deve rodar modelos de 1–4B, um pouco mais devagar que um desktop).
- **Acesso pela rede de casa**: abrir o visor no celular. Hoje o servidor escuta só em `127.0.0.1` e **não tem senha**; antes de mudar `MANO_HOST` é preciso pôr autenticação (pelo menos um token) e restringir à rede local.

## Limitações conhecidas

| Limitação | Por quê / contorno |
|---|---|
| Sem avisos com o notebook desligado ou suspenso | É o que a fase 7 resolve. Até lá: energia sem suspensão na tomada |
| Os resumos das 05:00 só rodam com o Mano aberto | Se o notebook estava suspenso e acordar até 06:00, a rodada acontece; se o Mano estava fechado, ela é pulada. Use **Resumir agora** |
| Primeira resposta do modelo local leva ~40 s | Carregar o modelo na memória de um i3 sem GPU. Depois de carregado: 3–10 s |
| Reconhecimento de voz às vezes erra palavras | Modelo Vosk pequeno (leve). Dá para trocar pelo grande com `MANO_VOSK_MODEL_PATH` (mais preciso, ~1,5 GB de RAM) |
| Frase de ativação pode disparar à toa ou não ouvir | Calibrar `MANO_WAKE_CONF`. Um modelo dedicado (openWakeWord) ficou para depois |
| A voz é a Maria do Windows | O plano previa Piper (voz neural offline); não foi feito |
| E-mail é só leitura | De propósito (permissão mínima). Responder/arquivar exigiria outra permissão do Google |
| Notas: só acrescenta, sem busca por significado | Busca por palavras (FTS5). Busca semântica com embeddings do Ollama está nas ideias |
| Tecnoblog e outros feeds com texto completo mostram legendas no "começo do artigo" | Só até o resumo do modelo ficar pronto |
| Sem migração de banco | Colunas novas em tabelas existentes exigem migração manual (ver [Convenções](dev/convencoes.md#banco-de-dados)) |
| Login Google em modo "Teste" expira a cada 7 dias | Publicar o app como "Em produção" (passo 3 da configuração) |
| Nos testes de voz aparecem linhas "Windows fatal exception: code 0xe0000002" | Ruído do faulthandler com o COM/Vosk; os testes passam. Use `-p no:faulthandler` para esconder |

## Ideias (sem compromisso)

- Script `scripts/install.ps1` que cria o atalho de inicialização e confere requisitos.
- Busca semântica nas notas (embeddings locais) e "relacionadas" na nota aberta.
- Voz Piper e palavra de ativação dedicada (openWakeWord).
- Previsão do tempo no "bom dia" (Open-Meteo não precisa de chave).
- Relatório semanal de hábitos e adesão aos remédios.
- Resumo semanal das capturas do Obsidian pelo modelo local.
- Briefing por tema (agrupar notícias parecidas de feeds diferentes).
- Empacotar o visor com Tauri se um dia quiser um executável.
