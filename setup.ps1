# Run from the project root in Windows PowerShell.
$ErrorActionPreference = "Stop"
Write-Host "Setting up frontend dependencies..." -ForegroundColor Cyan
Push-Location frontend
npm.cmd install
Pop-Location
Write-Host "Creating backend virtual environment and installing dependencies (includes PyTorch/Ultralytics YOLO)..." -ForegroundColor Cyan
Push-Location backend
if (!(Test-Path ".venv")) { py -m venv .venv }
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (!(Test-Path ".env")) { Copy-Item .env.example .env }
Pop-Location
Write-Host "Setup complete. YOLO model weights download automatically on first camera analysis. Run backend and frontend in separate terminals; see README.md." -ForegroundColor Green
