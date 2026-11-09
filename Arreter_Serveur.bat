@echo off
title Le Prof et l'IA - Arret du Serveur
echo ===================================================
echo     Arret de Le Prof et l'IA...
echo ===================================================
echo.

:: Tuer proprement le processus écoutant sur le port 3000
powershell -NoProfile -Command "& { Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo [OK] Serveur arrete et port 3000 libere.
timeout /t 2 >nul
exit
