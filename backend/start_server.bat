@echo off
REM ─────────────────────────────────────────────────────────────
REM  start_server.bat
REM  Activates your conda env, loads .env, and launches uvicorn
REM  as a background process (log → server.log).
REM ─────────────────────────────────────────────────────────────

REM ── CONFIG ───────────────────────────────────────────────────
SET CONDA_ENV=base
SET APP_DIR=%~dp0
SET PORT=8000
SET LOG_FILE=%APP_DIR%server.log
REM ─────────────────────────────────────────────────────────────

echo [start_server] Working dir : %APP_DIR%
echo [start_server] Conda env   : %CONDA_ENV%
echo [start_server] Port        : %PORT%
echo [start_server] Log file    : %LOG_FILE%

REM Load variables from .env (skip comment lines and blank lines)
IF EXIST "%APP_DIR%.env" (
    echo [start_server] Loading .env ...
    FOR /F "usebackq tokens=1,* delims==" %%A IN ("%APP_DIR%.env") DO (
        IF NOT "%%A"=="" IF NOT "%%A:~0,1%%"=="#" (
            SET %%A=%%B
            echo [start_server]   SET %%A=***
        )
    )
) ELSE (
    echo [start_server] WARNING: .env file not found at %APP_DIR%.env
)

REM ── Locate conda ─────────────────────────────────────────────
REM Try common install locations in order
SET CONDA_HOOK=

IF EXIST "%USERPROFILE%\anaconda3\Scripts\activate.bat"   SET CONDA_HOOK=%USERPROFILE%\anaconda3\Scripts\activate.bat
IF EXIST "%USERPROFILE%\miniconda3\Scripts\activate.bat"  SET CONDA_HOOK=%USERPROFILE%\miniconda3\Scripts\activate.bat
IF EXIST "C:\anaconda3\Scripts\activate.bat"              SET CONDA_HOOK=C:\anaconda3\Scripts\activate.bat
IF EXIST "C:\miniconda3\Scripts\activate.bat"             SET CONDA_HOOK=C:\miniconda3\Scripts\activate.bat
IF EXIST "C:\ProgramData\anaconda3\Scripts\activate.bat"  SET CONDA_HOOK=C:\ProgramData\anaconda3\Scripts\activate.bat
IF EXIST "C:\ProgramData\miniconda3\Scripts\activate.bat" SET CONDA_HOOK=C:\ProgramData\miniconda3\Scripts\activate.bat

IF "%CONDA_HOOK%"=="" (
    echo [start_server] ERROR: Could not find conda activate.bat in common locations.
    echo [start_server] Edit start_server.bat and set CONDA_HOOK manually, e.g.:
    echo [start_server]   SET CONDA_HOOK=C:\your\path\to\anaconda3\Scripts\activate.bat
    pause
    EXIT /B 1
)

echo [start_server] Found conda at: %CONDA_HOOK%
CALL "%CONDA_HOOK%" %CONDA_ENV%
IF ERRORLEVEL 1 (
    echo [start_server] ERROR: Failed to activate conda env "%CONDA_ENV%"
    pause
    EXIT /B 1
)
echo [start_server] Conda env "%CONDA_ENV%" activated.

REM Install python-dotenv if missing
pip show python-dotenv >nul 2>&1
IF ERRORLEVEL 1 (
    echo [start_server] Installing python-dotenv ...
    pip install python-dotenv --quiet
)

REM ── Launch uvicorn in background ──────────────────────────────
echo [start_server] Starting uvicorn in background ...
START "BidInfra-API" /B cmd /C "cd /D "%APP_DIR%" && uvicorn main:app --host 0.0.0.0 --port %PORT% --reload --reload-exclude "temp_files/*" >> "%LOG_FILE%" 2>&1"

echo.
echo [start_server] Server started  ^>  http://localhost:%PORT%
echo [start_server] Logs            ^>  %LOG_FILE%
echo [start_server] To stop         ^>  run stop_server.bat
echo.
pause