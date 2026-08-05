# JARVIS AIOS — shut down all agent + HUD processes for this project.
# Finds them by command line, so it works no matter how JARVIS was started.

$root    = $PSScriptRoot
$pidfile = Join-Path $root ".jarvis-pids"

$agents = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -match 'agent\.py' }
$nodes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jarvis-aios' }

$killed = 0
foreach ($p in @($agents) + @($nodes)) {
    taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null   # /T kills the process tree
    $killed++
}
# free port 3000 if anything still holds it
$owner = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($owner) { taskkill /PID $owner /T /F 2>$null | Out-Null; $killed++ }

Remove-Item $pidfile -ErrorAction SilentlyContinue

if ($killed -gt 0) { Write-Host "JARVIS stopped ($killed process(es))." }
else { Write-Host "No running JARVIS found." }
