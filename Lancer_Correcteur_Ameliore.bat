@echo off
setlocal enabledelayedexpansion
title Evaluation PE et PO - Console Serveur

echo ====================================================================
echo               Evaluation PE et PO - Lanceur Windows
echo ====================================================================
echo.

:: Dossier de l'application
cd /d "%~dp0"

:: 1. Vérification des prérequis (Node.js)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe ou n'est pas dans le PATH.
    echo Veuillez installer Node.js depuis https://nodejs.org/ pour lancer l'application.
    echo.
    pause
    exit /b
)

:: 2. Vérification et installation automatique des dépendances (node_modules)
if not exist "node_modules\" (
    echo [INFO] Dossier node_modules absent. Installation des dependances...
    cmd /c "npm.cmd install"
    if !errorlevel! neq 0 (
        echo [ERREUR] L'installation des dependances a echoue.
        pause
        exit /b
    )
)

:: 3. Libération du port 3000 si déjà occupé
echo [1/3] Nettoyage du port 3000...
powershell -NoProfile -Command "& { Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

:: 4. Démarrage du serveur local
echo [2/3] Demarrage du serveur local Next.js...
:: Compilation optimisee (mode production).
:: On ne recompile que si le code a change depuis le dernier build : le
:: demarrage reste quasi instantane les fois suivantes.
echo [INFO] Verification de la compilation...
powershell -NoProfile -Command "$b='.next/BUILD_ID'; if (-not (Test-Path $b)) { exit 1 }; $bt=(Get-Item $b).LastWriteTime; $srcs=@('src','package.json','next.config.ts') | Where-Object { Test-Path $_ }; $newer = Get-ChildItem -Path $srcs -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $bt } | Select-Object -First 1; if ($newer) { exit 1 } else { exit 0 }"
if !errorlevel! neq 0 (
    echo [INFO] Compilation de l'application en cours ^(peut prendre une minute^)...
    cmd /c "npm.cmd run build"
)
start /b cmd /c "npm.cmd run start"

:: 5. Attente dynamique du serveur (Polling actif au lieu d'un timeout de 10s)
echo [3/3] Attente du chargement de l'application...
echo.
echo Note : Ne fermez pas cette fenetre pendant l'utilisation.
echo.

set "max_attempts=30"
set "attempt=0"

:wait_loop
set /a attempt+=1
if !attempt! gtr !max_attempts! (
    echo.
    echo [ATTENTION] Le serveur met du temps a repondre.
    echo Ouverture du navigateur tout de meme...
    goto open_browser
)

:: Utilisation de PowerShell pour tester le port de manière non bloquante et rapide
powershell -Command "$tcp = New-Object System.Net.Sockets.TcpClient; $connect = $tcp.BeginConnect('localhost', 3000, $null, $null); $wait = $connect.AsyncWaitHandle.WaitOne(300); if ($tcp.Connected) { $tcp.Close(); exit 0 } else { exit 1 }" >nul 2>nul
if !errorlevel! neq 0 (
    <nul set /p =.
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

:open_browser
echo.
echo [OK] Serveur detecte et actif !
echo Ouverture de l'application dans votre navigateur...
start http://127.0.0.1:3000

echo.
echo ====================================================================
echo --- SERVEUR ACTIF (http://127.0.0.1:3000) ---
echo.
echo IMPORTANT : Ne fermez pas cette console pendant votre travail !
echo Si cette console est fermee, le serveur s'arrete et les fonctionnalites
echo (dont la generation de PDF) cesseront de fonctionner.
echo.
echo Pour arreter proprement le serveur lorsque vous avez termine :
echo Tapez 'Q' et appuyez sur Entree.
echo ====================================================================
echo.

:wait_quit
set "user_choice="
set /p "user_choice=Arreter le serveur ? (Tapez Q pour quitter) : "
if /i "%user_choice%"=="Q" goto do_shutdown
goto wait_quit

:do_shutdown
echo.
echo Arret du serveur et liberation du port 3000...
powershell -NoProfile -Command "& { Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo Au revoir !
timeout /t 2 >nul
exit
