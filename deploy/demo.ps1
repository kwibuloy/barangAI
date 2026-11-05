# One command to record a demo: a throwaway database and photo folder under demo/ (git-ignored, never the real ones),
# filled with the synthetic story, served with every screen labelled "Demo data".
#   .\deploy\demo.ps1                  Serve on http://127.0.0.1:8001, seeding first if demo/ is empty
#   .\deploy\demo.ps1 -Fresh           Throw the demo database and photos away and start again
#   .\deploy\demo.ps1 -Lan             Also serve phones on the same Wi-Fi (demo staff accounts allowed, by -Demo)
#   .\deploy\demo.ps1 -SeedOnly        Prepare and stop, without serving
# Passwords are generated once, into demo/passwords.txt, and are never printed here.
param([int]$Port = 8001, [switch]$Lan, [switch]$Fresh, [switch]$SeedOnly, [string]$Folder = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Create .venv and install the API with its AI extra, using deploy/constraints-render.txt. See README.md.' }

$demoDir = if ($Folder) { [IO.Path]::GetFullPath($Folder) } else { Join-Path $projectRoot 'demo' }
$database = Join-Path $demoDir 'barangai-demo.db'
$photos = Join-Path $demoDir 'private_media'
$passwordFile = Join-Path $demoDir 'passwords.txt'
$realDatabase = [IO.Path]::GetFullPath((Join-Path $projectRoot 'barangai-dev.db'))
$realPhotos = [IO.Path]::GetFullPath((Join-Path $projectRoot 'private_media'))
# Whatever -Folder says: this script deletes what it finds here, so it can never be the live data's folder.
if ([IO.Path]::GetFullPath($demoDir).TrimEnd('\', '/') -in @([IO.Path]::GetFullPath($projectRoot).TrimEnd('\', '/'), $realPhotos.TrimEnd('\', '/'))) {
    throw 'The demo folder must not be the project root or the real photo folder.'
}
if ([IO.Path]::GetFullPath($database) -eq $realDatabase -or [IO.Path]::GetFullPath($photos) -eq $realPhotos) {
    throw 'The demo must not use the real database or photos.'
}

if ($Fresh -and (Test-Path -LiteralPath $demoDir)) {
    # Only what this script made: a folder someone pointed -Folder at keeps anything else in it.
    foreach ($name in 'barangai-demo.db', 'barangai-demo.db-wal', 'barangai-demo.db-shm', 'private_media', 'passwords.txt') {
        $item = Join-Path $demoDir $name
        if (Test-Path -LiteralPath $item) { Remove-Item -LiteralPath $item -Recurse -Force }
    }
}
New-Item -ItemType Directory -Force -Path $photos | Out-Null

function New-DemoPassword {
    $bytes = New-Object byte[] 18
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return ([Convert]::ToBase64String($bytes) -replace '[+/=]', 'x')
}
if (!(Test-Path -LiteralPath $passwordFile)) {
    @(
        '# Synthetic demo accounts on this laptop only. Git-ignored; removed by -Fresh. Do not share the staff or admin ones.'
        "resident=$(New-DemoPassword)"
        "staff=$(New-DemoPassword)"
        "admin=$(New-DemoPassword)"
    ) | Set-Content -LiteralPath $passwordFile -Encoding utf8
}
$passwords = @{}
foreach ($line in Get-Content -LiteralPath $passwordFile) {
    if ($line -match '^(resident|staff|admin)=(.+)$') { $passwords[$Matches[1]] = $Matches[2] }
}

$env:DATABASE_URL = 'sqlite:///' + $database.Replace('\', '/')
$env:PRIVATE_MEDIA_DIR = $photos
$env:MEDIA_STORAGE = 'local'
$env:DEMO_MODE = 'true'

if (!(Test-Path -LiteralPath $database)) {
    $env:SEED_DEMO_PASSWORD = $passwords['resident']
    $env:SEED_DEMO_STAFF_PASSWORD = $passwords['staff']
    $env:SEED_DEMO_ADMIN_PASSWORD = $passwords['admin']
    Write-Host 'Seeding the synthetic story (about a minute, with faces and plates blurred)...'
    Push-Location (Join-Path $projectRoot 'apps/api')
    try {
        & $python -m barangai.seed_demo --story
        if ($LASTEXITCODE -ne 0) { throw "Seeding failed with code $LASTEXITCODE" }
    } finally {
        Pop-Location
        Remove-Item Env:SEED_DEMO_PASSWORD, Env:SEED_DEMO_STAFF_PASSWORD, Env:SEED_DEMO_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    }
}

Write-Host "Demo data: $demoDir"
Write-Host "Passwords: $passwordFile"
Write-Host 'Accounts: resident1@demo.test (to resident80), staff@demo.test (Salitran II),'
Write-Host '          staff-sampaloc-i@demo.test, staff-burol-i@demo.test, staff-paliparan-ii@demo.test, admin@demo.test'
Write-Host 'All of it is synthetic: every screen says "Demo data". See docs/presentation-demo.md for what may be said about it.'
if ($SeedOnly) { return }

& (Join-Path $PSScriptRoot 'start-local.ps1') -Port $Port -Lan:$Lan -Demo -DataFolder $demoDir -DatabasePath $database -PhotoFolder $photos
