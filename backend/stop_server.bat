@echo off
REM ─────────────────────────────────────────────────────────────
REM  stop_server.bat — kills the background uvicorn process
REM ─────────────────────────────────────────────────────────────

SET PORT=8000

echo [stop_server] Finding process on port %PORT% ...

FOR /F "tokens=5" %%P IN ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') DO (
    echo [stop_server] Killing PID %%P ...
    taskkill /PID %%P /F
)

echo [stop_server] Done.