@echo off
cd /d "%~dp0"
title AUT-food-bot - Network Inspector
echo Starting Chrome inspector...
node tools\inspect.mjs
pause
