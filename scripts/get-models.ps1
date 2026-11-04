# Baixa os modelos de voz offline para data/models (não versionados).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root "data\models"
New-Item -ItemType Directory -Force $models | Out-Null

$name = "vosk-model-small-pt-0.3"
$target = Join-Path $models $name
if (Test-Path $target) {
    Write-Host "$name já existe."
} else {
    $zip = Join-Path $models "$name.zip"
    Write-Host "Baixando $name (~31 MB) de alphacephei.com..."
    Invoke-WebRequest "https://alphacephei.com/vosk/models/$name.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath $models
    Remove-Item $zip
    Write-Host "Modelo salvo em $target"
}
