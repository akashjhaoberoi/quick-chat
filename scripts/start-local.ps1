# Starts Quick Chat locally: Supabase (Docker in WSL) + the production server on http://localhost:3000.
# Usage: npm run local            (add -Rebuild to rebuild the app first)
param([switch]$Rebuild)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$wslRoot = (wsl -u root -e wslpath -a ($root -replace '\\', '/')).Trim()

# WSL shuts down when nothing is attached, which would stop Supabase. Keep one hidden session open.
$keepAlive = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -match 'sleep infinity' }
if (-not $keepAlive) {
  Start-Process wsl -ArgumentList '-u', 'root', '-e', 'sleep', 'infinity' -WindowStyle Hidden
}

Write-Host "Starting Supabase (first start after a reboot takes ~30s)..."
wsl -u root -e bash -c "cd '$wslRoot' && supabase start -x studio,postgres-meta,imgproxy,vector,logflare,supavisor,edge-runtime >/dev/null && supabase migration up >/dev/null && echo 'Supabase ready: http://127.0.0.1:54321  (emails: http://127.0.0.1:54324)'"
if ($LASTEXITCODE -ne 0) { throw "Supabase failed to start. Run: wsl -u root -e bash -c 'cd $wslRoot && supabase start'" }

Set-Location $root
if ($Rebuild -or -not (Test-Path ".next/BUILD_ID")) { npx next build }
Write-Host "Quick Chat: http://localhost:3000"
npx next start -p 3000
