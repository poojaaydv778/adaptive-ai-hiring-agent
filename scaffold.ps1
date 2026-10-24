$ErrorActionPreference = "Stop"
$dirs = @(
  "frontend/src/components",
  "backend/app",
  "backend/data",
  "backend/tests"
)
$dirs | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
Write-Host "Project directory structure is ready." -ForegroundColor Green
