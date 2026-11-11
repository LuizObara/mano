# Sobe o Mano: recompila o visor se o código mudou, fecha um Mano que já esteja no ar, inicia o backend
# escondido (sem janela de terminal) e abre o visor como app (janela do Chrome; do Edge se o Chrome não
# estiver instalado; MANO_BROWSER escolhe outro).
#   .\scripts\start.ps1            -> uso normal: backend escondido, log em data\logs\mano.log
#   .\scripts\start.ps1 -Here      -> backend neste terminal (ex.: terminal do VS Code); Ctrl+C para
#   .\scripts\start.ps1 -Build     -> força recompilar o visor
#   .\scripts\start.ps1 -NoWindow  -> só o backend, sem abrir o visor (ex.: iniciado no logon)
#   .\scripts\start.ps1 -Stop      -> só fecha o Mano que estiver no ar
# Para abrir sem nenhum terminal (duplo clique ou atalho): scripts\mano.vbs
param([switch]$Build, [switch]$NoWindow, [switch]$Here, [switch]$Stop)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
$port = if ($env:MANO_PORT) { [int]$env:MANO_PORT } else { 8765 }
$url = "http://127.0.0.1:$port"
$data = if ($env:MANO_DATA_DIR) { $env:MANO_DATA_DIR } else { Join-Path $root "data" }

function Stop-Mano {
    # quem escuta na porta do Mano, e o python do .venv que o abriu (o .venv lança um python filho)
    $pids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
    if (-not $pids) { return $false }
    foreach ($id in $pids) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
        if (-not $proc -or $proc.CommandLine -notmatch "-m mano") {
            throw "A porta $port está ocupada por outro programa ($($proc.Name), PID $id). Feche-o ou use MANO_PORT."
        }
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        if ($parent -and $parent.CommandLine -match "-m mano") { Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue }
    }
    for ($i = 0; $i -lt 20 -and (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue); $i++) {
        Start-Sleep -Milliseconds 250
    }
    return $true
}

if ($Stop) {
    if (Stop-Mano) { Write-Host "Mano fechado." } else { Write-Host "O Mano não estava no ar." }
    return
}

if (-not (Test-Path $py)) {
    Write-Host "Criando ambiente Python..."
    python -m venv (Join-Path $root "backend\.venv")
    & $py -m pip install -q -r (Join-Path $root "backend\requirements.txt")
}

if (-not (Test-Path (Join-Path $root "data\models\vosk-model-small-pt-0.3"))) {
    & (Join-Path $PSScriptRoot "get-models.ps1")
}

# recompila quando algum arquivo do visor é mais novo que a última compilação (ex.: depois de um git pull)
$front = Join-Path $root "frontend"
$dist = Join-Path $front "dist\index.html"
$stale = -not (Test-Path $dist)
if (-not $stale) {
    $built = (Get-Item $dist).LastWriteTime
    $sources = @(Get-ChildItem (Join-Path $front "src"), (Join-Path $front "public") -Recurse -File) +
        @(Get-Item (Join-Path $front "index.html"), (Join-Path $front "package.json"), (Join-Path $front "vite.config.ts") -ErrorAction SilentlyContinue)
    $stale = [bool]($sources | Where-Object { $_.LastWriteTime -gt $built } | Select-Object -First 1)
}
if ($Build -or $stale) {
    Write-Host "Compilando o visor..."
    Push-Location $front
    # o npm e o Vite escrevem avisos no stderr; no PowerShell 5.1 isso não pode virar erro fatal
    $ErrorActionPreference = "Continue"
    try {
        # o npm atualiza node_modules\.package-lock.json a cada install: mais velho que o package.json = falta instalar
        $lock = "node_modules\.package-lock.json"
        if (-not (Test-Path $lock) -or (Get-Item "package.json").LastWriteTime -gt (Get-Item $lock).LastWriteTime) {
            npm install --no-fund --no-audit 2>&1 | ForEach-Object { "$_" }
        }
        npm run build 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) { throw "A compilação do visor falhou (veja acima)." }
    } finally {
        Pop-Location
        $ErrorActionPreference = "Stop"
    }
}

if (Stop-Mano) { Write-Host "Fechei o Mano que estava no ar para abrir o novo." }

function Find-Browser {
    # MANO_BROWSER: "chrome", "edge" ou o caminho de um .exe baseado no Chromium
    $pref = $env:MANO_BROWSER
    if ($pref -and $pref -notin @("chrome", "edge")) { return $pref }
    if ($pref -ne "edge") {
        $chrome = @(
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
        ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
        if ($chrome) { return $chrome }
    }
    return "msedge"
}
# janela de app (sem abas nem barra); links externos, como as notícias, abrem no mesmo navegador
$visorArgs = "--app=$url --start-maximized"

$env:PYTHONUNBUFFERED = "1"
$backendDir = Join-Path $root "backend"

if ($Here) {
    # backend neste terminal: os logs aparecem aqui e Ctrl+C fecha. O visor abre quando o backend responder.
    if (-not $NoWindow) {
        $open = "for(`$i=0;`$i -lt 60;`$i++){try{Invoke-RestMethod '$url/api/health' -TimeoutSec 1|Out-Null;" +
            "Start-Process '$(Find-Browser)' '$visorArgs';break}catch{Start-Sleep -Milliseconds 500}}"
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", $open
    }
    Write-Host "Mano em $url (Ctrl+C para fechar)"
    Push-Location $backendDir
    try { & $py -m mano } finally { Pop-Location }
    return
}

$logs = Join-Path $data "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
$backend = Start-Process -FilePath $py -ArgumentList "-m", "mano" -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden `
    -RedirectStandardError (Join-Path $logs "mano.log") -RedirectStandardOutput (Join-Path $logs "mano-saida.log")
Write-Host "Backend iniciado em segundo plano (PID $($backend.Id)). Aguardando $url ..."

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-RestMethod "$url/api/health" -TimeoutSec 1 | Out-Null; $ok = $true; break } catch { Start-Sleep -Milliseconds 500 }
    if ($backend.HasExited) { break }
}
if (-not $ok) {
    Write-Host "O backend não respondeu. Últimas linhas de $(Join-Path $logs 'mano.log'):" -ForegroundColor Yellow
    Get-Content (Join-Path $logs "mano.log") -Tail 20 -ErrorAction SilentlyContinue
    exit 1
}

if (-not $NoWindow) { Start-Process (Find-Browser) $visorArgs }
Write-Host "Mano no ar em $url. Para fechar: .\scripts\start.ps1 -Stop"
