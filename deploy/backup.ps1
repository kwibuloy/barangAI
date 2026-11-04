# Backs up or restores the local server's database and photos. See docs/mobile.md.
#   .\deploy\backup.ps1 -To E:\BarangAI-backups
#   .\deploy\backup.ps1 -Restore E:\BarangAI-backups\barangai-backup-20261104-220000 [-Replace]   (stop the server first)
param([string]$To, [string]$Restore, [switch]$Replace)

$ErrorActionPreference = 'Stop'
if ([bool]$To -eq [bool]$Restore) { throw 'Pass either -To <folder> or -Restore <backup folder>.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$python = Join-Path $projectRoot '.venv/Scripts/python.exe'
# The same database and photo folder start-local.ps1 uses, whatever is set in this shell.
$env:DATABASE_URL = 'sqlite:///' + (Join-Path $projectRoot 'barangai-dev.db').Replace('\', '/')
$env:PRIVATE_MEDIA_DIR = Join-Path $projectRoot 'private_media'
Push-Location (Join-Path $projectRoot 'apps/api')
try {
    if ($To) { & $python -m barangai.backup create $To }
    elseif ($Replace) { & $python -m barangai.backup restore $Restore --replace }
    else { & $python -m barangai.backup restore $Restore }
    if ($LASTEXITCODE -ne 0) { throw 'Backup command failed.' }
} finally { Pop-Location }
