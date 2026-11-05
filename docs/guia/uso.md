# Uso do dia a dia

Tudo que dá para falar dá para digitar na barra do visor, e quase tudo também tem botão. A lista completa de frases está em [Comandos aceitos](comandos.md).

## O visor

Abas no topo: **Início**, **Remédios**, **Hábitos**, **Notas**, **Briefing**, **Ajustes**. Ao lado, da esquerda para a direita:

- **Conectado**: o ponto verde indica que o visor está ligado ao Mano.
- **Microfone**: silencia o microfone. Mudo, o Mano não ouve o "fala Mano" nem o Ctrl+Espaço, e uma faixa discreta avisa isso no topo (o × oculta a faixa até você ligar o microfone de novo). A barra de comando continua funcionando e os avisos de remédio continuam falando. Fica salvo até você ligar de novo, mesmo reiniciando o Mano.
- **Alto-falante**: decide se a resposta de um comando digitado também é falada.
- **Sol/lua**: tema claro ou escuro. Na primeira vez segue o tema do Windows; depois fica o que você escolher, neste aparelho.
- **Painéis** (só no Início): escolhe quais painéis aparecem.

**Início**:

- **Assistente**: o orbe (pronto, ouvindo, pensando, falando, mudo), a última resposta e a barra de comando.
- **Relógio**: saudação, hora e o que vem a seguir hoje (compromissos, doses pendentes e timers).
  No pé do bloco, um mini painel troca a cada 10 s entre a música tocando (com pausar e pular) e as grades das últimas 12 semanas de hábitos e de remédios: quanto mais forte o mel, mais coisa feita no dia; vermelho é dia em que esqueceu remédio. Parado em cima com o mouse, ele não troca; os pontinhos embaixo escolhem a tela. Só aparece o que tem dado.
- **Painéis**: Agenda, Remédios e hábitos, Música, Timers, Tarefas, E-mail, Briefing e Últimos comandos. O olho riscado no canto de cada um oculta o painel; o botão **Painéis** (ou "Mostrar todos") traz de volta. Fica salvo neste aparelho, e o que está oculto continua funcionando por voz.

Avisos (remédio, timer, lembrete, compromisso) aparecem no canto da tela, são falados e viram notificação do Windows. "Para" ou "ok" dispensa o que estiver tocando.

## Falando com o Mano

1. Diga **"fala Mano"** (ou "ei Mano", "oi Mano") e espere o *plim*.
2. Fale o comando. Dá também para dizer tudo de uma vez: "fala Mano, timer de dez minutos pro arroz".
3. Sem frase de ativação: botão do microfone na barra ou **Ctrl+Espaço** com o visor em foco.

Enquanto o Mano fala, o microfone é ignorado (ele não ouve a si mesmo). O reconhecimento é offline e às vezes troca palavras ("timer" vira "time"); o parser já aceita as trocas mais comuns.

**Quando ele não entende:** se o modelo local estiver ligado, o Mano diz "Deixa eu pensar" e pede ao modelo para reescrever a frase como um comando conhecido. O visor mostra "entendi como …" para você conferir. A primeira vez depois de um tempo parado leva uns 40 s (o modelo carrega na memória); as seguintes, poucos segundos.

## Remédios

Na aba **Remédios**, cadastre nome, dose, horários, dias da semana e, se quiser, o estoque.

- No horário, o Mano avisa por voz, na tela e no Windows, e **repete a cada 5 minutos** até você dizer "tomei" (ou clicar).
- "Adia" empurra 10 minutos; "pula o remédio" marca como pulado.
- Depois de 2 horas sem resposta a dose vira "não tomada".
- Com estoque cadastrado, cada "tomei" desconta e o Mano avisa quando estiver acabando.
- O histórico dos últimos 14 dias mostra a adesão.

Importante: com o notebook desligado ou suspenso não há aviso. O aviso no celular está previsto na fase 7.

## Hábitos

Três tipos, escolhidos em **Novo hábito** (ou na engrenagem de cada um):

| Tipo | Exemplo | Como registra | Quando conta como feito |
|---|---|---|---|
| **Sim ou não** | Exercício | Botão "Marcar como feito" ou "fiz exercício" | Marcou no dia |
| **Com meta** | Água, 3 L por dia | Botões rápidos (+250 ml), "Outro…" ou "bebi 500 ml de água" | Somou a meta no dia |
| **Livre** | Leitura | Quantidade com observação ("10 páginas", "O Hobbit") ou "li 20 páginas" | Registrou qualquer coisa no dia |

Cada hábito tem unidade, meta opcional (por dia ou por semana), botões rápidos e dias da semana. Os registros guardam a hora, a observação e de onde vieram (visor, lembrete ou voz).

- **Visão geral**: um cartão por hábito (anel de progresso nos de meta diária, com o ritmo esperado para a hora) e a tabela **Esta semana**. Registrou sem querer? Logo depois aparece **Desfazer** por 10 s, e cada registro de hoje no rodapé do cartão tem um × para apagar. O pop-up de lembrete também tem **Desfazer**. Na tabela, clicar num dia marca ou desmarca os sim/não e abre o dia no detalhe para os outros.
- **Detalhe** (clique no nome): média por dia, meta batida, total, sequência e recorde, melhor dia, total da semana; gráfico por dia com a linha da meta (7 dias, 30 dias ou 12 semanas), grade de 12 semanas e os registros de qualquer dia, com editar, apagar e "registrar em outro dia".

### Cobranças

Ligue a **Cobrança** na configuração do hábito:

- **Quando**: a cada X minutos dentro de uma janela (água: a cada 30 min, das 8 h às 22 h) ou em horários fixos (leitura: 21 h, só se ainda não registrou nada no dia).
- **Fração por lembrete**: para metas diárias, o Mano divide a meta pelos avisos da janela e sugere quanto fazer em cada um (3 L em 28 avisos ≈ 100 ml). Dá para mudar.
- **Mensagem**: texto seu, com `{faltam}`, `{fração}`, `{feito}`, `{meta}` e `{nome}`. A prévia ao lado mostra como fica.
- **Como avisar**: bip pelo PC (toca mesmo com o visor fechado), pop-up no canto do visor com botões de registrar, notificação do Windows e, se quiser, a voz do Mano. O pop-up some sozinho depois de 3 min (configurável).

Para não encher o saco:

- bateu a meta do dia, para de cobrar;
- registrou há menos tempo que o intervalo, o próximo aviso é pulado;
- **Agora não** (no pop-up) adia 15 min; **Chega por hoje** silencia aquele hábito até amanhã;
- **Pausar cobranças** (no topo da aba) pausa todos por 1 h, 2 h ou até amanhã. Remédios continuam avisando;
- avisos que caíram com o Mano desligado não tocam atrasados.

O detalhe mostra as **cobranças de hoje**: quantos avisos foram enviados, respondidos, pulados e adiados.

Por voz: "fiz exercício", "bebi um copo de água", "li 20 páginas do Hobbit", "quanto de água eu bebi hoje?", "pausa os lembretes de água", "chega de lembrete por hoje". Lista completa em [Comandos](comandos.md#hábitos).

## Lembretes e timers

- **Timer**: duração e, se quiser, um nome ("timer de 10 minutos pro arroz"). Tocando, ele repete o aviso a cada 30 s por até 5 min.
- **Lembrete**: um texto e um momento ("me lembra de pagar o boleto amanhã às 10", "me lembra em 20 minutos de tirar o bolo"). Momentos aceitos: "em/daqui a N minutos/horas", "às 15", "às 3 e meia", "hoje/amanhã/depois de amanhã", dias da semana ("sexta às 10").

## Agenda, e-mail e tarefas (Google)

- A agenda mostra os próximos 7 dias de todas as agendas visíveis e avisa 10 minutos antes de cada compromisso.
- "Marca dentista sexta às 10" cria um evento de 1 hora na agenda principal.
- E-mail é só leitura: não lidos da caixa principal, sem promoções e redes sociais. "Resume meus e-mails" pede um resumo ao modelo local e avisa quando fica pronto.
- Tarefas usa a lista padrão do Google Tasks, então aparece também no celular.

## Notas (Obsidian)

- **Pastas**: à esquerda, a árvore do vault como no Obsidian, com o número de notas de cada pasta. Cada área de topo ganha uma cor, e prefixos como "10-19" ou "21" aparecem separados do nome. Clicar numa pasta mostra, no meio, as notas dela e das pastas de dentro, agrupadas por subpasta (as notas diárias vêm da mais nova para a mais antiga).
- **Busca**: ignora acentos e dá mais peso ao título. Os resultados aparecem no meio, agrupados pela pasta de origem, com os trechos encontrados destacados.
- **Leitura**: a nota aparece formatada, com tags, `[[links]]` clicáveis, a lista de onde ela é mencionada e o botão **Abrir no Obsidian**.
- **Captura**: o campo do topo, ou "anota que…" por voz, acrescenta `- HH:MM texto` na seção `## Capturas` da nota do dia.
- O índice se atualiza a cada minuto.

## Briefing

- Adicione blogs e sites na aba **Briefing**. O Mano busca novidades a cada 2 horas.
- Às 05:00 o modelo local resume as notícias novas em 2–3 frases. Antes disso, ou sem modelo, aparece o começo do artigo. O botão **Resumir agora** adianta a rodada.
- Abas: **Novidades** (não lidas), **Últimos 3 dias** e **Salvas** (estrela). Notícias ouvidas por voz contam como lidas.
- Por voz: "quais as notícias?" lê as três mais recentes, "mais notícias" continua.

## Bom dia

"Fala Mano, bom dia" junta num só resumo falado: a data, a agenda de hoje, os remédios, os hábitos que faltam, as tarefas, os e-mails não lidos e a manchete mais recente. Cada parte só entra se estiver configurada. No card **Bom dia** da aba Briefing dá para escolher um horário para ele falar isso sozinho.

## Música, vídeo e pesquisa

- **Spotify**: tocar artista, música, álbum, playlist ou curtidas; pausar, continuar, pular, voltar, volume, "que música é essa?".
- **YouTube**: "abre um vídeo de…" toca o primeiro resultado no próprio visor; "pesquisa no YouTube…" mostra resultados para escolher. Abrir vídeo pausa o Spotify. "Fecha o vídeo" ou Esc fecha.
- **Pesquisa**: "o que é…" e "quem foi…" respondem falando com o resumo da Wikipedia e um cartão na tela; "pesquisa…" abre o Google no navegador do PC.
