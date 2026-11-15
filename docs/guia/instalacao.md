# Instalação

O Mano foi feito para **Windows 10/11** (a voz de saída usa o SAPI do Windows e as notificações usam o sistema). Tudo roda localmente; a internet só é usada pelas integrações (Spotify, Google, Wikipedia, YouTube, feeds) e para baixar os modelos uma vez.

## Requisitos

| O quê | Versão | Para quê |
|---|---|---|
| Python | 3.12 | Backend |
| Node.js | 20 ou mais novo | Só para compilar o visor |
| Google Chrome (ou o Edge do Windows) | qualquer recente | Abre o visor como app (janela própria) |
| Voz "Microsoft Maria" | vem com o Windows em português | Fala do Mano |
| Ollama | opcional | Modelo de linguagem local (fase 6) |
| Espaço em disco | ~200 MB + modelos de linguagem (1–5 GB cada) | |

Máquina de referência: i3-6006U, 12 GB de RAM, sem GPU. Sem o modelo de linguagem carregado o Mano usa bem menos de 1,5 GB.

## Jeito rápido

Na raiz do projeto, no PowerShell:

```powershell
.\scripts\start.ps1
```

Na primeira vez o script:

1. cria o ambiente Python (`backend\.venv`) e instala `backend\requirements.txt`;
2. baixa o modelo de voz Vosk em português (~31 MB) para `data\models` (`scripts\get-models.ps1`);
3. instala as dependências do visor e compila (`frontend\dist`);
4. sobe o backend em segundo plano, sem janela de terminal (o log fica em `data\logs\mano.log`), e abre o visor numa janela de app do Chrome (do Edge, se o Chrome não estiver instalado). Links do visor, como as notícias, abrem nesse mesmo navegador.

Nas outras vezes ele recompila o visor sozinho quando o código do frontend mudou (por exemplo, depois de um `git pull`) e, se já houver um Mano no ar, fecha o antigo antes de abrir o novo. Então "reiniciar" é só rodar o script de novo.

Opções do script:

| Comando | Efeito |
|---|---|
| `.\scripts\start.ps1` | Uso normal: backend escondido, visor aberto |
| `.\scripts\start.ps1 -Here` | Backend neste terminal, com os logs (bom para o terminal do VS Code); Ctrl+C fecha |
| `.\scripts\start.ps1 -Stop` | Fecha o Mano que estiver no ar |
| `.\scripts\start.ps1 -Build` | Força recompilar o visor (normalmente não precisa) |
| `.\scripts\start.ps1 -NoWindow` | Só o backend, sem abrir o visor (é o que roda no logon) |
| `.\scripts\start.ps1 -Open` | Se o Mano já está no ar, só abre o visor; senão sobe normalmente (é o que o atalho usa) |
| `scripts\mano.vbs` | Dois cliques: abre o Mano sem nenhuma janela de terminal. Aceita `/abrir` (= `-Open`) e `/segundo-plano` (= `-NoWindow`) |

No VS Code há tarefas prontas (`.vscode\tasks.json`): Ctrl+Shift+P → "Tasks: Run Task" → **Mano: iniciar (logs neste terminal)**, **Mano: iniciar em segundo plano**, **Mano: fechar** ou **Mano: ver o log**.

Se o PowerShell bloquear scripts, rode uma vez: `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1`.

## Passo a passo manual

```powershell
# backend
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..

# modelo de voz
.\scripts\get-models.ps1

# visor
cd frontend
npm install
npm run build
cd ..

# rodar
cd backend
.\.venv\Scripts\python.exe -m mano
```

O visor fica em <http://127.0.0.1:8765>. Para ter ícone e janela própria: no Chrome, menu ⋮ → **Transmitir, salvar e compartilhar** → **Instalar página como app** (no Edge: menu ⋯ → **Aplicativos** → **Instalar este site como aplicativo**). Se você já tinha instalado pelo Edge, desinstale esse atalho e instale pelo Chrome, senão ele continua abrindo no Edge.

## Modelo de linguagem local (opcional)

1. Instale o Ollama em <https://ollama.com/download>.
2. Baixe um modelo. Neste notebook o que equilibrou melhor qualidade e tempo foi o `gemma4:e2b-it-qat`; o `gemma3:1b` é mais rápido mas inventa fatos nos resumos. Pode baixar pela aba **Ajustes** do Mano ou pelo terminal:

   ```powershell
   ollama pull gemma4:e2b-it-qat
   ```

3. Não precisa deixar o Ollama aberto: o Mano sobe o `ollama serve` sozinho quando precisa.

Sem Ollama tudo continua funcionando; só ficam de fora o plano B dos comandos e os resumos (o briefing mostra o começo de cada artigo).

## Iniciar junto com o Windows

Com o Mano aberto, vá em **Ajustes → Inicialização**:

- **Iniciar com o Windows**: liga ou desliga. Ligado, o Mano sobe sozinho quando você entra no Windows, **só o backend e em segundo plano** (sem janela nem terminal): voz, alarmes e lembretes já funcionam. Não precisa de administrador.
- **Criar atalho**: põe um atalho **Mano** na Área de Trabalho, com o ícone do Mano. Dois cliques abrem o visor; se o Mano estiver fechado, ele sobe antes. Se ele já estiver no ar (por exemplo, iniciado com o Windows), o atalho **não reinicia** nada, só abre a janela.
- **Fechar o Mano**: encerra o Mano de vez (pede confirmação). Para abrir de novo, use o atalho.

### Como funciona por dentro

O interruptor grava um valor `Mano` em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (o registro do seu usuário) com o comando:

```
"C:\Windows\System32\wscript.exe" "<pasta do Mano>\scripts\mano.vbs" /segundo-plano
```

O `wscript` roda o `mano.vbs` sem janela, e ele chama `start.ps1 -NoWindow` com o PowerShell escondido. O atalho da Área de Trabalho chama o mesmo `mano.vbs`, com `/abrir`. O log continua em `data\logs\mano.log`.

O item aparece também em **Gerenciador de Tarefas → Aplicativos de inicialização** como "Mano" (com o ícone do Windows Script Host). Se você desativá-lo por lá, a tela de Ajustes mostra isso e religar pela tela reativa. Se mudar a pasta do projeto de lugar, a tela avisa que o item aponta para a pasta antiga e oferece **Corrigir**.

Sem abrir o Mano, dá para ligar pelo PowerShell (troque o caminho se o projeto estiver em outra pasta):

```powershell
Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" Mano '"C:\Windows\System32\wscript.exe" "C:\Users\gustavo\Documents\projetos\mano\scripts\mano.vbs" /segundo-plano'
```

Para desfazer: desligue em Ajustes ou rode `Remove-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" Mano`.

> Quem seguiu a versão antiga deste guia tem um `Mano.lnk` na pasta `shell:startup`, que abre o Mano com o visor. Apague esse atalho para não subir o Mano duas vezes no logon.

Para os avisos de remédio funcionarem, o notebook precisa estar ligado e **sem suspender**: em Configurações → Sistema → Energia, ajuste "Suspender" para "Nunca" quando estiver na tomada.

## Atualizar

Depois de puxar mudanças do projeto:

```powershell
cd backend; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; cd ..
.\scripts\start.ps1
```

O script recompila o visor (e roda `npm install` se o `package.json` mudou) e reinicia o Mano.

O banco (`data\mano.db`) cria tabelas novas sozinho ao iniciar. Ainda não há migrações para colunas novas em tabelas existentes (ver [Convenções](../dev/convencoes.md#banco-de-dados)).

## Onde ficam os seus dados

Tudo o que é pessoal fica em `data\` (fora do git):

| Arquivo | Conteúdo |
|---|---|
| `mano.db` | Remédios, doses, hábitos, lembretes, timers, histórico de comandos, feeds, notícias, índice das notas |
| `models\` | Modelo de voz Vosk |
| `sounds\` | Som de "plim" da ativação |
| `notes.json` | Caminho do vault do Obsidian |
| `spotify.json`, `spotify_token.json` | Client ID e login do Spotify |
| `google_client.json`, `google_token.json` | Credencial OAuth e login do Google |
| `llm.json` | Modelo escolhido e liga/desliga do modelo local |
| `briefing.json` | Horário do "bom dia" automático |
| `mano.ico` | Ícone do atalho da Área de Trabalho (gerado ao criar o atalho) |
| `logs\` | Log do backend quando roda escondido (`mano.log`) |

Backup = copiar a pasta `data\`. As notas continuam no seu vault; o Mano só acrescenta texto nelas.
