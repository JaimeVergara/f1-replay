@echo off
cd /d "%~dp0"
start "" http://localhost:5000
"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" app.py
