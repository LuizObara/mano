# Instalação

O Mano foi feito para **Windows 10/11** (a voz de saída usa o SAPI do Windows e as notificações usam o sistema). Tudo roda localmente; a internet só é usada pelas integrações (Spotify, Google, Wikipedia, YouTube, feeds) e para baixar os modelos uma vez.

## Requisitos

| O quê | Versão | Para quê |
|---|---|---|
| Python | 3.12 | Backend |
| Node.js | 20 ou mais novo | Só para compilar o visor |
| Microsoft Edge | o do Windows | Abre o visor como app (janela própria) |
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
4. sobe o backend minimizado e abre o visor numa janela do Edge.

Opções do script:

| Comando | Efeito |
|---|---|
| `.\scripts\start.ps1` | Uso normal |
| `.\scripts\start.ps1 -Build` | Recompila o visor (depois de mudar o frontend) |
| `.\scripts\start.ps1 -NoWindow` | Só o backend, sem abrir janela |

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

O visor fica em <http://127.0.0.1:8765>. Para ter ícone e janela própria: no Edge, menu ⋯ → **Aplicativos** → **Instalar este site como aplicativo**.

## Modelo de linguagem local (opcional)

1. Instale o Ollama em <https://ollama.com/download>.
2. Baixe um modelo. Neste notebook o que equilibrou melhor qualidade e tempo foi o `gemma4:e2b-it-qat`; o `gemma3:1b` é mais rápido mas inventa fatos nos resumos. Pode baixar pela aba **Ajustes** do Mano ou pelo terminal:

   ```powershell
   ollama pull gemma4:e2b-it-qat
   ```

3. Não precisa deixar o Ollama aberto: o Mano sobe o `ollama serve` sozinho quando precisa.

Sem Ollama tudo continua funcionando; só ficam de fora o plano B dos comandos e os resumos (o briefing mostra o começo de cada artigo).

## Iniciar junto com o Windows

> Ainda não existe um script de instalação para isso (ver [O que falta](../pendencias.md)). O jeito mais simples, sem precisar de administrador, é um atalho na pasta Inicializar:

```powershell
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Mano.lnk")
$lnk.TargetPath = "powershell.exe"
$lnk.Arguments = '-WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\gustavo\Documents\projetos\mano\scripts\start.ps1"'
$lnk.Save()
```

Troque o caminho se o projeto estiver em outra pasta. Para só o backend (sem abrir o visor), acrescente ` -NoWindow` ao final dos argumentos. Para desfazer, apague `Mano.lnk` da pasta `shell:startup`.

Para os avisos de remédio funcionarem, o notebook precisa estar ligado e **sem suspender**: em Configurações → Sistema → Energia, ajuste "Suspender" para "Nunca" quando estiver na tomada.

## Atualizar

Depois de puxar mudanças do projeto:

```powershell
cd backend; .\.venv\Scripts\python.exe -m pip install -r requirements.txt; cd ..
cd frontend; npm install; cd ..
.\scripts\start.ps1 -Build
```

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

Backup = copiar a pasta `data\`. As notas continuam no seu vault; o Mano só acrescenta texto nelas.
