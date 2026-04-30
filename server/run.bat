@echo off
REM Quick start script for AquaLens ML Backend (Windows)

echo.
echo ==========================================
echo AquaLens ML Backend - Quick Start
echo ==========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [X] Python is not installed. Please install Python 3.8+
    pause
    exit /b 1
)

cd /d "%~dp0"

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo [*] Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo [*] Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo [*] Installing dependencies...
pip install -r requirements.txt -q

REM Generate dataset and train model
echo [*] Training ML model (this may take 1-2 minutes)...
python setup.py

REM Start API server
echo.
echo ==========================================
echo [+] Setup Complete!
echo ==========================================
echo.
echo [*] Starting API server on http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.

python -m uvicorn main:app --reload --port 8000
pause
