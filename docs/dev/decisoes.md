# Decisões

Registro curto do porquê de cada escolha, para não rediscutir à toa e saber quando vale revisitar.

## 1. Visor web servido pelo backend, não Electron

**Decisão:** React compilado, servido pelo FastAPI e aberto como app pelo Edge (`--app`), instalável como PWA.
**Por quê:** num i3 com 12 GB, o Electron somaria 200–300 MB e um segundo Chromium. O Edge já está no Windows, e o mesmo visor abre no celular quando houver acesso pela rede.
**Revisitar se:** precisar de atalho global de teclado com o visor fechado, ícone na bandeja ou executável único (aí Tauri, que usa o WebView2 do Windows sem reescrever o visor).

## 2. Comandos por regras; o modelo de linguagem só como plano B

**Decisão:** parser de regras em PT-BR (regex + matchers) para tudo. O modelo local só reescreve frases que as regras não entenderam e faz trabalhos em lote.
**Por quê:** sem GPU o modelo gera 5–10 tokens/s e leva ~40 s para carregar. As regras respondem em milissegundos, são previsíveis e testáveis. Fazer o modelo apenas *traduzir* para um comando conhecido mantém a execução nas regras: ele não inventa ações.
**Revisitar se:** o Mano ganhar uma máquina com GPU (ou o mini servidor ficar bom o bastante), aí o modelo pode virar o primeiro passo com as regras como validação.

## 3. Python no backend

**Decisão:** FastAPI + SQLModel + APScheduler.
**Por quê:** a pilha de voz offline (Vosk), os clientes de Spotify/Google, o yt-dlp e o trafilatura são nativos de Python. Um processo só concentra voz, agendador e integrações.

## 4. Voz: Vosk com gramática para ativação, SAPI para falar

**Decisão:** frase de ativação com um reconhecedor Vosk limitado a "fala/ei/oi Mano" e limiar de confiança; comando com o Vosk livre; fala com a voz Maria do SAPI.
**Por quê:** funciona offline, leve no i3 e sem treinar modelo. "Mano" sozinho é curto demais e dispararia à toa, por isso a frase de duas palavras.
**Revisitar se:** houver falsos disparos demais (openWakeWord com modelo treinado) ou se a voz da Maria cansar (Piper `pt_BR`, voz neural offline). Ambos estavam no plano inicial e ficaram para depois.

## 5. SQLite, sem servidor de banco

**Decisão:** um arquivo `data/mano.db`; busca das notas com FTS5 no mesmo arquivo.
**Por quê:** um usuário, uma máquina; backup é copiar a pasta. O FTS5 com `remove_diacritics` resolve "logica" achar "Lógica" sem outra dependência.

## 6. Agendador em memória, reagendado a partir do banco

**Decisão:** APScheduler sem jobstore persistente; cada skill recria seus jobs no `start()` lendo o banco (timers, lembretes, doses).
**Por quê:** os jobs referenciam métodos de objetos vivos, o que o jobstore persistente não serializa bem. O estado verdadeiro já está nas tabelas. O teste `test_timer_survives_restart` garante que um timer volta depois de reiniciar.

## 7. Integrações sem segredo no código

**Decisão:** Spotify com PKCE (só Client ID); Google como "App para computador" com retorno na raiz (`http://127.0.0.1:8765/`); o usuário cola e envia as credenciais pela tela.
**Por quê:** nada sensível no repositório e nenhuma senha digitada pelo assistente. O retorno na raiz é o formato de loopback que o Google aceita para apps de computador.

## 8. Notas: o vault é do usuário

**Decisão:** o Mano lê o vault inteiro, mas só **acrescenta** texto na nota do dia, numa seção `## Capturas`, respeitando a configuração do Daily Notes ou o padrão que já existe.
**Por quê:** o vault é sincronizado e versionado pelo usuário; um assistente que reescreve notas é um risco que não vale a conveniência.

## 9. Briefing com resumos em lote de madrugada

**Decisão:** buscar feeds a cada 2 h, extrair o texto na hora e resumir tudo às 05:00; sem modelo, mostrar o começo do artigo.
**Por quê:** cada resumo leva ~45 s neste notebook. Em lote, de madrugada, o tempo não incomoda e o modelo não disputa memória com o uso do dia. Novos itens só entram se forem mais novos que o último guardado, para não ir puxando o acervo antigo.

## 10. Modelo padrão: Gemma 4 E2B (QAT)

**Decisão:** escolher automaticamente o melhor modelo instalado, com o `gemma4:e2b-it-qat` no topo da lista.
**Por quê:** num teste lado a lado neste notebook, o `gemma3:1b` foi 2× mais rápido mas inverteu um fato num resumo ("manteve" virou "elevou") e errou o plano B; o Gemma 4 E2B acertou os dois a 5–6 tokens/s.
**Revisitar se:** aparecer um modelo pequeno melhor em português, ou se o Ollama for para o mini servidor.
