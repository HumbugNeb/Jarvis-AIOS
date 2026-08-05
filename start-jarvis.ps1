# JARVIS AIOS — one-click launcher.
# Boots the agent + HUD (hidden, only if not already running), waits for the HUD
# to be ready, then opens it as a borderless Chrome app window.
# Safe to double-click repeatedly: if JARVIS is already up, it just opens the window.

$ErrorActionPreference = "SilentlyContinue"

$root    = $PSScriptRoot
$agent   = Join-Path $root "agent"
$web     = Join-Path $root "web"
$url     = "http://localhost:3000"
$pidfile = Join-Path $root ".jarvis-pids"
$python  = Join-Path $agent ".venv\Scripts\python.exe"    # run hidden -> no taskbar window, normal logging
$node    = "C:\Program Files\nodejs\node.exe"
$next    = Join-Path $web "node_modules\next\dist\bin\next"
$chrome  = "C:\Program Files\Google\Chrome\Application\chrome.exe"

# Make node/npm resolvable in this fresh process.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:PYTHONUNBUFFERED = "1"   # so the agent's logs flush live into agent.run.log
$env:PYTHONUTF8 = "1"         # UTF-8 logging (avoids cp1252 crashes on special characters)

function Test-HudUp {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true }
    catch { return $false }
}

# This project's running processes — so we never stack duplicates.
function Get-JarvisAgents {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -match 'agent\.py' }
}
function Get-JarvisNodes {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jarvis-aios' }
}
function Stop-Jarvis {
    foreach ($p in @(Get-JarvisAgents) + @(Get-JarvisNodes)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    $owner = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
    if ($owner) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

# Reuse only when the HUD is serving AND an agent is alive; otherwise reset to a
# single clean instance (this is what stops agents/HUDs from piling up).
if ((Test-HudUp) -and (@(Get-JarvisAgents).Count -gt 0)) {
    Write-Host "JARVIS is already running - reusing it."
} else {
    Write-Host "Starting JARVIS clean (clearing any stragglers first)..."
    Stop-Jarvis

    $a = Start-Process -FilePath $python -ArgumentList "agent.py","dev" `
            -WorkingDirectory $agent -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $agent "agent.run.log") `
            -RedirectStandardError  (Join-Path $agent "agent.err.log")

    $h = Start-Process -FilePath $node -ArgumentList $next,"dev","-p","3000" `
            -WorkingDirectory $web -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $web "web.run.log") `
            -RedirectStandardError  (Join-Path $web "web.err.log")

    # Record PIDs so stop-jarvis.ps1 can shut the whole tree down.
    Set-Content -Path $pidfile -Value @($a.Id, $h.Id)

    # Wait up to ~90s for the HUD to answer.
    $deadline = (Get-Date).AddSeconds(90)
    while (-not (Test-HudUp) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
}

# Open the HUD as a clean Chrome app window (no tabs / address bar).
if (Test-Path $chrome) {
    Start-Process -FilePath $chrome -ArgumentList "--app=$url"
} else {
    Start-Process $url   # fallback: default browser
}
