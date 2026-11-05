# -DataFolder, -DatabasePath and -PhotoFolder are for deploy/demo.ps1: a throwaway copy of the app, labelled as a demo.
param([int]$Port = 8000, [switch]$Lan, [switch]$Demo, [string]$DataFolder = '', [string]$DatabasePath = '', [string]$PhotoFolder = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
$checker = Join-Path $projectRoot 'apps/api/models/mobileclip2-s0'
$website = Join-Path $projectRoot 'apps/web/dist'
if (!(Test-Path -LiteralPath $python)) { throw 'Create .venv and install the API with its AI extra, using deploy/constraints-render.txt. See README.md.' }
if (!(Test-Path -LiteralPath (Join-Path $checker 'visual.onnx'))) { throw 'The category checker is missing. Run apps/api/tools/export_checker.py.' }
if (!(Test-Path -LiteralPath (Join-Path $website 'index.html'))) { throw 'Build the website first: cd apps/web; npm run build' }

# Optional keys from the git-ignored .env file in the repo root (see .env.example). Only these names are read,
# so the file can never point this local server at a remote database or storage. Values already set in
# the shell win over the file.
$allowed = 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_WORKERS_AI_TOKEN', 'CLOUDFLARE_VISION_MODEL', 'GEOCODER_CONTACT', 'OPERATOR_NAME', 'PRIVACY_CONTACT'
# Google accepts neither a private network address as a callback nor sign-in from an app's web view, and a demo
# signs in with its own synthetic accounts.
if (!$Lan -and !$DataFolder) { $allowed += 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI' }
else { 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI' | ForEach-Object { [Environment]::SetEnvironmentVariable($_, $null, 'Process') } }
$keysFile = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $keysFile) {
    foreach ($line in Get-Content -LiteralPath $keysFile) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $allowed -contains $Matches[1]) {
            $name, $value = $Matches[1], $Matches[2].Trim('"', "'")
            if ($value -and -not [Environment]::GetEnvironmentVariable($name, 'Process')) {
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
}
$cloudflare = if ($env:CLOUDFLARE_ACCOUNT_ID -and $env:CLOUDFLARE_WORKERS_AI_TOKEN) { 'on' } else { 'off (no keys found)' }

# The checker's cutoff is not field calibrated.
$env:CHECKER_MODEL_DIR = $checker
$env:VALIDATED_EMBEDDING_MODEL_VERSION = 'mobileclip2-s0:effec85f7f21'
$env:CHECKER_THREADS = '2'
$env:GEOCODER = 'nominatim'
$env:STATIC_SITE_DIR = $website
$env:API_ROOT_PATH = ''
$env:DIRECT_CONNECTIONS = 'true'
$env:COOKIE_SECURE = 'false'
$env:DATABASE_URL = 'sqlite:///' + $(if ($DatabasePath) { $DatabasePath } else { Join-Path $projectRoot 'barangai-dev.db' }).Replace('\', '/')
$env:MEDIA_STORAGE = 'local'
$env:DEMO_MODE = if ($DataFolder) { 'true' } else { $null }
$env:PRIVATE_MEDIA_DIR = if ($PhotoFolder) { $PhotoFolder } else { Join-Path $projectRoot 'private_media' }

# Anyone on the Wi-Fi can reach the desk in phone mode, so demo staff accounts need saying out loud.
if ($Lan) {
    Push-Location (Join-Path $projectRoot 'apps/api')
    try {
        if ($Demo) { & $python -m barangai.lan_check --demo } else { & $python -m barangai.lan_check }
        if ($LASTEXITCODE -ne 0) { exit 1 }
    } finally { Pop-Location }
}

# Warnings and errors, kept after the window closes. Request lines hold addresses and pins, so they stay on screen.
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot 'logs') | Out-Null
$logConfig = Join-Path $projectRoot 'deploy/uvicorn-logging.json'

$bindAddress = '127.0.0.1'
Write-Host "BarangAI: http://127.0.0.1:$Port"
if ($Lan) {
    $bindAddress = '0.0.0.0'
    # The network card with the internet route, so virtual adapters such as WSL's aren't offered to phones.
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    $address = if ($route) { Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty IPAddress }
    Write-Host "Phone address: $(if ($address) { "http://${address}:$Port" } else { "http://<this PC's Wi-Fi address>:$Port" })"
    Write-Host 'Plain HTTP: use a trusted Wi-Fi network. If a phone cannot connect, see docs/mobile.md for the firewall rule.'
}
Write-Host "Cloudflare photo descriptions: $cloudflare"
$lastBackup = Join-Path $projectRoot 'barangai-dev.last-backup.txt'
if ($DataFolder) { Write-Host 'Demo mode: synthetic data in a throwaway folder. Nothing here needs a backup.' }
elseif (Test-Path -LiteralPath $lastBackup) { Write-Host "Last backup: $(Get-Content -LiteralPath $lastBackup -TotalCount 1)" }
else { Write-Host 'No backup yet. This laptop holds the only copy: run .\deploy\backup.ps1 -To <another drive>' -ForegroundColor Yellow }
Write-Host 'AI suggestions are experimental and not field validated. Residents review them; staff verify every report.'
Push-Location (Join-Path $projectRoot 'apps/api')
try {
    & $python -m uvicorn barangai.main:app --host $bindAddress --port $Port --timeout-keep-alive 30 --log-config $logConfig
    if ($LASTEXITCODE -ne 0) { throw "API exited with code $LASTEXITCODE" }
} finally { Pop-Location }
