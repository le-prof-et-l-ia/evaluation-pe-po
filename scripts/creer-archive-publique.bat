@echo off
title Creation de l'archive publique Evaluation PE et PO
echo ====================================================================
echo     Creation de l'archive ZIP pour diffusion publique
echo ====================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0creer-archive-publique.ps1"
echo.
echo Operation terminee. Appuyez sur une touche pour fermer cette fenetre.
pause > nul
