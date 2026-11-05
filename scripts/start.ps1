# Sobe o Mano: compila o frontend se preciso, inicia o backend e abre o visor como app
# (janela do Chrome; do Edge se o Chrome não estiver instalado; MANO_BROWSER escolhe outro).
#   .\scripts\start.ps1            -> uso normal
#   .\scripts\start.ps1 -Build     -> força recompilar o frontend
#   .\scripts\start.ps1 -NoWindow  -> só o backend (ex.: iniciado no logon)
param([switch]$Build, [switch]$NoWindow)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
$port = if ($env:MANO_PORT) { $env:MANO_PORT } else { 8765 }
$url = "http://127.0.0.1:$port"

if (-not (Test-Path $py)) {
    Write-Host "Criando ambiente Python..."
    python -m venv (Join-Path $root "backend\.venv")
    & $py -m pip install -q -r (Join-Path $root "backend\requirements.txt")
}

if (-not (Test-Path (Join-Path $root "data\models\vosk-model-small-pt-0.3"))) {
    & (Join-Path $PSScriptRoot "get-models.ps1")
}

$dist = Join-Path $root "frontend\dist\index.html"
if ($Build -or -not (Test-Path $dist)) {
    Write-Host "Compilando o frontend..."
    Push-Location (Join-Path $root "frontend")
    if (-not (Test-Path "node_modules")) { npm install --no-fund --no-audit }
    npm run build
    Pop-Location
}

$backend = Start-Process -FilePath $py -ArgumentList "-m", "mano" -WorkingDirectory (Join-Path $root "backend") -PassThru -WindowStyle Minimized
Write-Host "Backend iniciado (PID $($backend.Id)). Aguardando $url ..."

for ($i = 0; $i -lt 40; $i++) {
    try { Invoke-RestMethod "$url/api/health" -TimeoutSec 1 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
}

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

if (-not $NoWindow) {
    # janela de app (sem abas nem barra); links externos, como as notícias, abrem no mesmo navegador
    Start-Process (Find-Browser) "--app=$url --start-maximized"
}
Write-Host "Mano no ar em $url"
