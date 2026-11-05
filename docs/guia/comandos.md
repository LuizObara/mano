# Comandos aceitos

Vale para voz e para a barra de comando. Por voz, comece com **"fala Mano"** (ou "ei Mano", "oi Mano"); digitando, não precisa. Acentos, maiúsculas e números por extenso não importam: "timer de dez minutos" e "timer de 10 minutos" dão no mesmo.

As frases abaixo são exemplos: o Mano aceita variações (outros verbos, outros nomes, outros horários). Se uma frase não for entendida e o modelo local estiver ligado, ele tenta reescrevê-la num destes comandos (veja [o fim da página](#quando-o-mano-não-entende)). Diga **"o que você sabe fazer?"** para ouvir o resumo.

> Para desenvolvedores: a coluna **Intenção** é conferida pelo teste `backend/tests/test_docs.py`, que passa cada frase pelo parser. Se mudar um padrão, o teste avisa se esta página ficou desatualizada.

## Hora e data

| Diga | O que acontece | Intenção |
|---|---|---|
| "que horas são?" | Fala a hora | `clock.time` |
| "que dia é hoje?" | Fala o dia da semana e a data | `clock.date` |
| "fala Mano, que horas são?" | O mesmo, já com a frase de ativação | `clock.time` |

## Timers

| Diga | O que acontece | Intenção |
|---|---|---|
| "timer de 10 minutos pro arroz" | Timer com nome | `timer.start` |
| "coloca um timer de meia hora" | Timer sem nome | `timer.start` |
| "timer de 1 hora e 15 minutos" | Durações compostas | `timer.start` |
| "me avisa em 15 minutos" | Timer simples | `timer.start` |
| "quanto tempo falta?" | Fala o tempo restante de cada timer | `timer.list` |
| "cancela o timer do arroz" | Cancela pelo nome | `timer.cancel` |
| "cancela todos os timers" | Cancela todos | `timer.cancel` |

## Lembretes

| Diga | O que acontece | Intenção |
|---|---|---|
| "me lembra de pagar o boleto amanhã às 10" | Lembrete com dia e hora | `reminder.create` |
| "me lembra em 20 minutos de tirar o bolo" | Lembrete daqui a pouco | `reminder.create` |
| "me lembra de ligar pra minha mãe sexta às 19" | Dias da semana também valem | `reminder.create` |
| "quais são meus lembretes?" | Lista os próximos | `reminder.list` |
| "cancela o lembrete do boleto" | Cancela pelo texto | `reminder.cancel` |

Momentos aceitos: "em/daqui a N minutos/horas", "às 15", "às 3 e meia", "hoje", "amanhã", "depois de amanhã", dias da semana.

## Remédios

| Diga | O que acontece | Intenção |
|---|---|---|
| "tomei o remédio" | Confirma a dose pendente e para o aviso | `meds.taken` |
| "tomei" | O mesmo | `meds.taken` |
| "pula o remédio" | Marca a dose como pulada | `meds.skip` |
| "adia" | Com o aviso tocando: lembra de novo em 10 minutos | `meds.snooze` |
| "quais remédios de hoje?" | Doses de hoje e a situação de cada uma | `meds.status` |
| "já tomei o remédio hoje?" | O mesmo | `meds.status` |

O cadastro (nome, dose, horários, dias, estoque) é feito na aba **Remédios**.

## Hábitos

| Diga | O que acontece | Intenção |
|---|---|---|
| "fiz exercício" | Marca um hábito sim/não de hoje (procura pelo nome mais parecido) | `habit.done` |
| "marca leitura como feita" | O mesmo | `habit.done` |
| "desmarca leitura" | Desfaz a marcação de hoje | `habit.undo` |
| "quais hábitos faltam?" | Lista o que falta hoje (com quanto falta nos de meta) | `habit.pending` |
| "bebi 500 ml de água" | Registra no hábito de água (ml ou litros) | `habit.log` |
| "bebi um copo de água" | Copo = 250 ml, garrafa = 500 ml, xícara = 200 ml | `habit.log` |
| "bebi meio litro" | 500 ml | `habit.log` |
| "li 20 páginas" | Registra na leitura; "li 20 páginas do Hobbit" guarda o livro como observação | `habit.log` |
| "registra 10 minutos de meditação" | Registra em qualquer hábito por quantidade | `habit.log` |
| "quanto de água eu bebi hoje?" | Quanto fez e quanto falta para a meta | `habit.progress` |
| "quantas páginas eu li essa semana?" | Total da semana | `habit.progress` |
| "pausa os lembretes de água" | Sem cobrança desse hábito até amanhã | `habit.silence` |
| "chega de lembrete por hoje" | Nenhum hábito cobra até amanhã (remédios continuam) | `habit.pause` |
| "pausa as cobranças por 2 horas" | Pausa geral; sem tempo dito, 1 hora | `habit.pause` |

## Agenda (Google)

| Diga | O que acontece | Intenção |
|---|---|---|
| "qual minha agenda de hoje?" | Compromissos de hoje | `calendar.day` |
| "o que eu tenho amanhã?" | Compromissos de amanhã | `calendar.day` |
| "minha agenda da semana" | Próximos compromissos da semana | `calendar.day` |
| "qual meu próximo compromisso?" | O próximo, com quando começa | `calendar.next` |
| "marca dentista sexta às 10" | Cria evento de 1 h na agenda principal | `calendar.create` |
| "coloca na agenda reunião com a Ana amanhã às 15" | O mesmo | `calendar.create` |

## Tarefas (Google Tasks)

| Diga | O que acontece | Intenção |
|---|---|---|
| "adiciona tarefa comprar pão" | Nova tarefa na lista padrão | `tasks.add` |
| "adiciona tarefa ligar pro contador amanhã" | Com data de entrega | `tasks.add` |
| "coloca pagar internet nas tarefas" | Outra forma | `tasks.add` |
| "quais são minhas tarefas?" | Lista, avisando as atrasadas | `tasks.list` |
| "conclui a tarefa comprar pão" | Marca como concluída | `tasks.done` |

## E-mail (Gmail, só leitura)

| Diga | O que acontece | Intenção |
|---|---|---|
| "tenho e-mail novo?" | Quantos não lidos e os 3 mais recentes | `gmail.unread` |
| "lê meus e-mails" | O mesmo | `gmail.unread` |
| "resume meus e-mails" | Resumo pelo modelo local (avisa quando fica pronto) | `gmail.summary` |

## Notas (Obsidian)

| Diga | O que acontece | Intenção |
|---|---|---|
| "anota que a reunião foi remarcada pra sexta" | Acrescenta na nota do dia, com hora | `notes.capture` |
| "procura nas notas sobre lógica de programação" | Busca no vault e mostra os resultados | `notes.search` |
| "o que eu anotei sobre SIA?" | O mesmo | `notes.search` |
| "lê a nota sobre RenovarTech" | Abre a nota no visor e lê o começo | `notes.read` |
| "o que eu anotei hoje?" | Lê as capturas de hoje | `notes.today` |

## Spotify (Premium)

| Diga | O que acontece | Intenção |
|---|---|---|
| "toca Djavan" | Toca o artista (ou música, se achar melhor) | `spotify.play` |
| "toca a música Oceano" | Uma música específica | `spotify.play` |
| "toca o álbum Acabou Chorare" | Um álbum | `spotify.play` |
| "toca a playlist de estudo" | Uma playlist (suas primeiro) | `spotify.play` |
| "toca minhas músicas curtidas" | Suas curtidas | `spotify.play` |
| "pausa a música" | Pausa | `spotify.pause` |
| "continua a música" | Retoma | `spotify.resume` |
| "próxima música" | Pula | `spotify.next` |
| "música anterior" | Volta | `spotify.previous` |
| "aumenta o volume" | +15% (ou "abaixa o volume") | `spotify.volume` |
| "volume 40" | Volume exato | `spotify.volume` |
| "que música é essa?" | Fala música e artista | `spotify.now` |

## YouTube

| Diga | O que acontece | Intenção |
|---|---|---|
| "abre um vídeo de receita de pão no YouTube" | Toca o primeiro resultado no visor | `youtube.play` |
| "pesquisa no YouTube aula de violão" | Mostra resultados para escolher | `youtube.play` |
| "fecha o vídeo" | Fecha o player (Esc também) | `youtube.close` |

## Pesquisa

| Diga | O que acontece | Intenção |
|---|---|---|
| "o que é fotossíntese?" | Responde com o resumo da Wikipedia | `search.whatis` |
| "quem foi Machado de Assis?" | O mesmo | `search.whatis` |
| "pesquisa previsão do tempo" | Abre a busca do Google no PC | `search.web` |

## Briefing e bom dia

| Diga | O que acontece | Intenção |
|---|---|---|
| "bom dia" | Data, agenda, remédios, hábitos, tarefas, e-mails e manchetes | `briefing.day` |
| "como está meu dia?" | O mesmo, a qualquer hora | `briefing.day` |
| "quais as notícias?" | Lê as 3 novidades mais recentes dos seus feeds | `briefing.news` |
| "mais notícias" | Continua de onde parou | `briefing.more` |

## Avisos e ajuda

| Diga | O que acontece | Intenção |
|---|---|---|
| "para" | Dispensa o que estiver tocando (timer, lembrete, remédio) | `alerts.dismiss` |
| "ok" | O mesmo | `alerts.dismiss` |
| "o que você sabe fazer?" | Resume as habilidades e mostra exemplos na tela | `help` |

## Quando o Mano não entende

Com o modelo local ligado (aba Ajustes), frases fora dos padrões vão para o modelo, que só **traduz** para um comando conhecido; quem executa continua sendo o parser. Exemplos que funcionaram nos testes:

| Você disse | Entendido como |
|---|---|
| "bota uma musiquinha do Caetano pra mim" | "toca Caetano" |
| "preciso sair daqui a quarenta minutos, me dá um toque" | "me avisa em 40 minutos" |
| "tô com saudade de ouvir Legião Urbana" | "toca Legião Urbana" |
| "o que tá pegando na agenda hoje" | "qual minha agenda de hoje?" |
| "joga na minha lista de afazeres lavar o carro" | "adiciona tarefa lavar o carro" |

Se nem o modelo achar um comando ("conta uma piada"), a resposta é "Não entendi". Frases de uma palavra só não vão para o modelo.
