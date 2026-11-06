@echo off
rem 브라우저는 파일로 연 화면에서 옆의 엑셀을 못 읽는다. 이 폴더를 내 컴퓨터 안에서만 열리는 주소로 띄운다
cd /d "%~dp0"
start "Screentone" /min python -m http.server 8765 --bind 127.0.0.1
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:8765/index.html"
