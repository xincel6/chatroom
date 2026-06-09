@echo off
cd /d "%~dp0"

REM Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js v20+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Check dependencies
if not exist "node_modules\" (
    echo [INFO] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM Check build output
if not exist "dist\server\index.js" (
    echo [INFO] Building project...
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Build failed.
        pause
        exit /b 1
    )
)

REM Check config
if not exist ".env" (
    if exist ".env.example" (
        copy /Y ".env.example" ".env" >nul
    )
)

REM Start server
echo [INFO] Starting server...
call npm run start:server

pause