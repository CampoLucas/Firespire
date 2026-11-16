@echo off
setlocal
title Firespire

cd /d "%~dp0web"
if errorlevel 1 goto failed

where node.exe >nul 2>&1
if errorlevel 1 (
    echo Node.js is required. Install Node.js 22.12 or later, then try again.
    goto failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo npm was not found. Reinstall Node.js, then try again.
    goto failed
)

if not exist "node_modules\.bin\next.cmd" (
    echo Installing dependencies. Internet access is required on first launch.
    call npm.cmd ci --include=dev
    if errorlevel 1 goto failed
)

call npx.cmd next telemetry disable
if errorlevel 1 goto failed

echo Starting Firespire. Your browser will open when the website is ready.
echo Keep this window open. Press Ctrl+C to stop the server.
echo.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$url = 'http://localhost:3000'; $deadline = (Get-Date).AddMinutes(2); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; if ($response.StatusCode -eq 200) { Start-Process $url; exit 0 } } catch {} Start-Sleep -Seconds 1 }; exit 1"
call npm.cmd run dev -- --port 3000
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo Firespire could not start. Check the error above.
pause
exit /b 1
