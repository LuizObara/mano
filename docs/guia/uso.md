# Uso do dia a dia

Tudo que dá para falar dá para digitar na barra do visor, e quase tudo também tem botão. A lista completa de frases está em [Comandos aceitos](comandos.md).

## O visor

Abas no topo: **Início**, **Remédios**, **Hábitos**, **Notas**, **Briefing**, **Ajustes**. Ao lado, da esquerda para a direita:

- **Conectado**: o ponto verde indica que o visor está ligado ao Mano.
- **Microfone**: silencia o microfone. Mudo, o Mano não ouve o "fala Mano" nem o Ctrl+Espaço, e uma faixa discreta avisa isso no topo (o × oculta a faixa até você ligar o microfone de novo). A barra de comando continua funcionando e os avisos de remédio continuam falando. Fica salvo até você ligar de novo, mesmo reiniciando o Mano.
- **Alto-falante**: decide se a resposta de um comando digitado também é falada.
- **Sol/lua**: tema claro ou escuro. Na primeira vez segue o tema do Windows; depois fica o que você escolher, neste aparelho.
- **Painéis** (só no Início): escolhe quais painéis aparecem e tem o **Restaurar layout original**.

**Início**:

- **Assistente**: o orbe (pronto, ouvindo, pensando, falando, mudo), a última resposta e a barra de comando. Resposta curta aparece grande no centro. Resposta longa (como "o que você sabe fazer?") encolhe o orbe para o topo, mostra sua pergunta num balão e a resposta numa área com rolagem própria, sem empurrar a barra de comando; **Mostrar tudo** abre ela inteira e **Limpar resposta** volta ao orbe grande. Na lista de ajuda, tocar num exemplo manda aquele comando.
- **Relógio**: saudação, hora e o que vem a seguir hoje (compromissos, doses pendentes e timers).
  No pé do bloco, um mini painel mostra, uma de cada vez, a música tocando (com pausar e pular) e as grades das últimas 12 semanas de hábitos e de remédios: quanto mais forte o mel, mais coisa feita no dia; vermelho é dia em que esqueceu remédio. Ele não troca sozinho: os pontinhos embaixo escolhem a tela. Só aparece o que tem dado.
- **Painéis**: Agenda, Remédios e hábitos, Música, Timers, Tarefas, E-mail, Briefing e Últimos comandos. Briefing e Últimos comandos ficam lado a lado no fim, com a mesma altura, e o ícone de expandir abre cada um por cima da página: o Briefing com filtro por blog, resumo, "Marcar como lido" e "Guardar"; os comandos com busca, filtros (por voz, digitados, não entendidos), separação por dia, páginas para os mais antigos e um botão para repetir o comando. No próprio painel de comandos as setas também passam para os mais antigos. O olho riscado no canto de cada um oculta o painel; o botão **Painéis** (ou "Mostrar todos") traz de volta. Fica salvo neste aparelho, e o que está oculto continua funcionando por voz.
  Os painéis formam uma grade que você monta do seu jeito: **arraste pelo título** para mudar de lugar (os outros abrem espaço) e **puxe as bordas ou os cantos de baixo** para mudar largura e altura (as alças aparecem com o mouse em cima). Enquanto você não mexe na altura de um painel, ele acompanha o tamanho do conteúdo; depois de puxar a borda de baixo, a altura fica a escolhida e o que sobrar rola dentro do card. Briefing e Últimos comandos, quando ficam lado a lado, se alinham pelo topo. Tudo é salvo sozinho neste aparelho, separado para tela grande, média e celular. No celular os painéis ficam um embaixo do outro, sem arrastar. **Restaurar layout** (ao lado do título "Painéis" ou no botão Painéis) volta ao arranjo original.

Avisos (remédio, timer, lembrete, compromisso) aparecem no canto da tela, tocam um som, são falados e viram notificação do Windows. "Para" ou "ok" dispensa o que estiver tocando; no remédio, "para" só cala o som (a dose continua esperando "tomei").

## Alarmes e avisos

Em **Ajustes → Alarmes e avisos** cada tipo de alarme (Remédio, Timer, Lembrete e Hábitos) tem o seu jeito de tocar. **Testar** toca o alarme como ele vai soar de verdade; **Ajustar** abre o editor, que salva sozinho a cada mudança:

- **Som**: Sino, Despertador, Bipe digital, Plim, Suave, Cristal ou "Sem som". O ▶ ao lado ouve antes de escolher. **Usar um som meu** aceita um `.wav` (PCM 16 bits, até 2 min e 8 MB); a lixeira apaga.
- **Volume**: de 0 a 100%, relativo ao volume do Windows. Ao soltar o controle, toca uma amostra.
- **Tipo de alarme**: *toque único* (toca uma vez a cada aviso) ou *contínuo* (toca sem parar até você responder ou dizer "para").
- **Como avisar**: falar o aviso (depois do toque, para não embolar) e notificação do Windows. O aviso na tela aparece sempre.
- **Repetir até eu responder**: de quanto em quanto tempo repete e quando desiste. No remédio, "desistir" é marcar a dose como não tomada; tem também quanto o "adiar" empurra.
- **Restaurar padrão** volta ao que veio de fábrica.

Em Hábitos só se escolhe o som e o volume: quando e como cobrar fica em cada hábito.

**Horário silencioso**: entre os horários escolhidos os alarmes não tocam som nem falam; tela e notificação continuam. Por padrão o remédio toca mesmo assim (dá para desmarcar).

O som sai pelo próprio PC, então toca com o visor fechado. Com o notebook desligado ou suspenso não há aviso.

## Falando com o Mano

1. Diga **"fala Mano"** (ou "ei Mano", "oi Mano") e espere o *plim*.
2. Fale o comando. Dá também para dizer tudo de uma vez: "fala Mano, timer de dez minutos pro arroz".
3. Sem frase de ativação: botão do microfone na barra ou **Ctrl+Espaço** com o visor em foco.

Enquanto o Mano fala, o microfone é ignorado (ele não ouve a si mesmo). O reconhecimento é offline e às vezes troca palavras ("timer" vira "time"); o parser já aceita as trocas mais comuns.

**Quando ele não entende:** se o modelo local estiver ligado, o Mano diz "Deixa eu pensar" e pede ao modelo para reescrever a frase como um comando conhecido. O visor mostra "entendi como …" para você conferir. A primeira vez depois de um tempo parado leva uns 40 s (o modelo carrega na memória); as seguintes, poucos segundos.

## Remédios

Na aba **Remédios**, cadastre nome, dose, horários, dias da semana e, se quiser, o estoque.

- No horário, o Mano toca o sino, avisa por voz, na tela e no Windows, e **repete a cada 5 minutos** até você dizer "tomei" (ou clicar).
- "Adia" empurra 10 minutos; "pula o remédio" marca como pulado; **Silenciar** (ou "para") cala o som sem responder a dose.
- Depois de 2 horas sem resposta a dose vira "não tomada".
- Som, volume, intervalo, adiar e limite mudam em [Alarmes e avisos](#alarmes-e-avisos).
- Com estoque cadastrado, cada "tomei" desconta e o Mano avisa quando estiver acabando.
- **Histórico** (no topo da aba): uma grade com um quadrado por dia, de 3 meses, 6 meses ou 1 ano, com filtro por remédio. Quanto mais forte o mel, mais doses tomadas; telha com ponto é dia com dose esquecida; mel fraco é dia em que você pulou; tracejado é dia que ainda vai chegar; hoje tem contorno.
  - Passar o mouse (ou andar com as setas do teclado) mostra o dia: cada dose com o horário em que foi tomada e o atraso, o atraso médio e a sequência de dias sem esquecer.
  - Clicar fixa a dica e libera as correções: **Tomei, marcar** (tomou e não avisou: fica tomada no horário marcado), **Foi pulado**, **Desfazer**, e **Tomei**/**Pular** nas doses de hoje. O estoque acompanha a correção. Esc ou clicar fora fecha.
  - Ao lado: adesão do período (tomadas ÷ tomadas + esquecidas; pular não conta como falha nem quebra a sequência), sequência atual, melhor sequência, esquecidas e o horário em que você costuma tomar cada remédio.
  - No celular, tocar num dia abre uma folha de baixo com as mesmas informações e setas para o dia anterior e o próximo.

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
- **Como avisar**: som pelo PC (toca mesmo com o visor fechado; qual som e o volume ficam em [Alarmes e avisos](#alarmes-e-avisos)), pop-up no canto do visor com botões de registrar, notificação do Windows e, se quiser, a voz do Mano. O pop-up some sozinho depois de 3 min (configurável).

Para não encher o saco:

- bateu a meta do dia, para de cobrar;
- registrou há menos tempo que o intervalo, o próximo aviso é pulado;
- **Agora não** (no pop-up) adia 15 min; **Chega por hoje** silencia aquele hábito até amanhã;
- **Pausar cobranças** (no topo da aba) pausa todos por 1 h, 2 h ou até amanhã. Remédios continuam avisando;
- avisos que caíram com o Mano desligado não tocam atrasados.

O detalhe mostra as **cobranças de hoje**: quantos avisos foram enviados, respondidos, pulados e adiados.

Por voz: "fiz exercício", "bebi um copo de água", "li 20 páginas do Hobbit", "quanto de água eu bebi hoje?", "pausa os lembretes de água", "chega de lembrete por hoje". Lista completa em [Comandos](comandos.md#hábitos).

## Lembretes e timers

- **Timer**: duração e, se quiser, um nome ("timer de 10 minutos pro arroz"). Tocando, o despertador soa sem parar e o aviso falado repete a cada 30 s por até 5 min (tudo ajustável em [Alarmes e avisos](#alarmes-e-avisos)).
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
