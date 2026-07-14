@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo מפעיל את אפליקציית ניהול החקלאות...
start "regavim-agri-server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8777
timeout /t 2 /nobreak >nul
start "" "http://localhost:8777/"
echo.
echo החלון הזה מריץ את האפליקציה. אפשר למזער אותו.
echo כדי לסגור את האפליקציה - פשוט סגרו חלון זה ואת חלון השרת.
