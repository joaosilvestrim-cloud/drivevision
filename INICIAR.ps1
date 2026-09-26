$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules')) {
    Write-Host 'Instale as dependências primeiro: npm ci'
    exit 1
}
Write-Host 'DriveData Assist: abra http://localhost:5173 no navegador.'
& node 'scripts/run-preview.mjs'
