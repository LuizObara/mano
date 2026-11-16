# Decisões

Registro curto do porquê de cada escolha, para não rediscutir à toa e saber quando vale revisitar.

## 1. Visor web servido pelo backend, não Electron

**Decisão:** React compilado, servido pelo FastAPI e aberto como app pelo navegador (`--app`; Chrome, com o Edge de reserva), instalável como PWA.
**Por quê:** num i3 com 12 GB, o Electron somaria 200–300 MB e um segundo Chromium. O Chrome (ou o Edge, que já vem no Windows) já está instalado, e o mesmo visor abre no celular quando houver acesso pela rede.
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

## 11. Iniciar com o Windows pelo registro do usuário

**Decisão:** valor `Mano` em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` apontando para `wscript.exe scripts\mano.vbs /segundo-plano`; no logon sobe só o backend, e o visor abre pelo atalho da Área de Trabalho, que não reinicia um Mano já no ar.
**Por quê:** o `winreg` é da biblioteca padrão (o atalho em `shell:startup` exigiria COM), não precisa de administrador e aparece em Gerenciador de Tarefas → Aplicativos de inicialização, onde o usuário também consegue desligar. Só o backend no logon porque os alarmes e a voz não dependem do visor, e uma janela abrindo a cada boot incomoda.
**Revisitar se:** o Mano precisar subir antes do logon (aí um serviço ou tarefa agendada) ou ganhar ícone na bandeja (ver decisão 1).

## 12. Aparelhos de áudio escolhidos pelo nome, no backend

**Decisão:** o visor só escolhe; quem abre o microfone e toca o som continua sendo o backend. A escolha fica em `data/voice.json` pelo **nome** do aparelho; a lista vem da API DirectSound do PortAudio e o padrão do Windows, do WASAPI. Com um alto-falante escolhido, alarmes e o *plim* passam do `winsound` para o `sounddevice` (`WavPlayer`), e o SAPI troca o `AudioOutput`; no "padrão do Windows" nada muda (`winsound`).
**Por quê:** o áudio precisa funcionar com o visor fechado (alarmes, voz), então não pode depender da Web Audio do navegador. O índice do PortAudio muda quando um fone Bluetooth conecta; o nome não. O MME corta os nomes em 31 caracteres e o WASAPI compartilhado exige a taxa nativa do aparelho, enquanto o DirectSound aceita os 16 kHz do Vosk. O `winsound` não escolhe aparelho, mas segue no padrão porque é o caminho já testado.
**Revisitar se:** o PortAudio passar a avisar aparelho novo sozinho (aí o **Atualizar lista** some) ou se a voz trocar de SAPI para Piper (aí ela também toca pelo `WavPlayer`).

## 13. Aparência: paletas prontas e destaque derivado, salvos no aparelho

**Decisão:** cinco paletas completas e afinadas à mão (claro e escuro), mais uma cor de destaque livre que troca só o mel (preenchimento, links, brilho), com a claridade ajustada em OKLCH para manter o contraste. Claro/escuro ganhou o "Sistema". Tudo no `localStorage` do navegador, sem rota no backend.
**Por quê:** deixar escolher todas as cores quebraria o contraste com facilidade; com paletas prontas cada combinação foi conferida, e o destaque livre cobre o "quero na minha cor" mexendo só onde dá para garantir a leitura. No aparelho porque o claro/escuro já era assim, porque o script do `index.html` precisa da escolha antes de qualquer rede para não piscar, e porque o celular e o PC podem querer coisas diferentes (tela, luz do ambiente).
**Revisitar se:** o visor passar a abrir em vários aparelhos (acesso pela rede, fase 7) e a pessoa quiser a mesma aparência em todos; aí o backend guarda e o aparelho mantém a cópia para não piscar.
