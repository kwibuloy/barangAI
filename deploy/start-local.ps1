param([int]$Port = 8000)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
$checker = Join-Path $projectRoot 'apps/api/models/mobileclip2-s0'
$website = Join-Path $projectRoot 'apps/web/dist'
if (!(Test-Path -LiteralPath $python)) { throw 'Create .venv and install the API with its AI extra. See README.md.' }
if (!(Test-Path -LiteralPath (Join-Path $checker 'visual.onnx'))) { throw 'The category checker is missing. Run apps/api/tools/export_checker.py.' }
if (!(Test-Path -LiteralPath (Join-Path $website 'index.html'))) { throw 'Build the website first: cd apps/web; npm run build' }

# Optional keys from the git-ignored .env file in the repo root (see .env.example). Only these names are read,
# so the file can never point this local presentation at a remote database or storage. Values already set in
# the shell win over the file.
$allowed = 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_WORKERS_AI_TOKEN', 'CLOUDFLARE_VISION_MODEL', 'GEOCODER_CONTACT',
    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'
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

# Local presentation only. The checker's cutoff is not field calibrated.
$env:CHECKER_MODEL_DIR = $checker
$env:VALIDATED_EMBEDDING_MODEL_VERSION = 'mobileclip2-s0:effec85f7f21'
$env:CHECKER_THREADS = '2'
$env:GEOCODER = 'nominatim'
$env:STATIC_SITE_DIR = $website
$env:API_ROOT_PATH = ''
$env:COOKIE_SECURE = 'false'
$env:DATABASE_URL = 'sqlite:///' + (Join-Path $projectRoot 'barangai-dev.db').Replace('\', '/')
$env:MEDIA_STORAGE = 'local'
$env:PRIVATE_MEDIA_DIR = Join-Path $projectRoot 'private_media'

Write-Host "Local presentation: http://127.0.0.1:$Port"
Write-Host "Cloudflare photo descriptions: $cloudflare"
Write-Host 'AI suggestions are experimental and not field validated. Residents review them; staff verify every report.'
Push-Location (Join-Path $projectRoot 'apps/api')
try {
    & $python -m uvicorn barangai.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw "API exited with code $LASTEXITCODE" }
} finally { Pop-Location }
