<#
Start both backend and frontend dev servers in separate PowerShell windows.
Usage (from repo root):
  .\scripts\start-dev.ps1
This script will:
  - Ensure backend virtualenv exists (create with default 'python' or py -3 if needed)
  - Activate venv and install backend requirements if not already installed
  - Run Django migrations and start the Django dev server on :8000 in a new window
  - Run `npm ci` and `npm run dev` for the frontend in a new window

Note: If your PowerShell execution policy blocks the script, run:
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
#>

param(
    [string]$RepoRoot = (Resolve-Path "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\.." ),
    [string]$BackendDir = "backend",
    [string]$FrontendDir = "frontend",
    [int]$BackendPort = 8000
)

$repo = Resolve-Path $RepoRoot
$backendPath = Join-Path $repo $BackendDir
$frontendPath = Join-Path $repo $FrontendDir
$venvPath = Join-Path $backendPath "venv"

Write-Host "Repo root: $repo"
Write-Host "Backend: $backendPath"
Write-Host "Frontend: $frontendPath"

# Helper to run a command in a new PowerShell window
function Start-NewWindow {
    param(
        [string]$WorkingDirectory,
        [string]$Command
    )
    Start-Process -FilePath pwsh -ArgumentList "-NoExit","-Command","Set-Location -Path '$WorkingDirectory'; $Command"
}

# If pwsh isn't available (older Windows), fall back to powershell.exe
if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
    function Start-NewWindow {
        param(
            [string]$WorkingDirectory,
            [string]$Command
        )
        Start-Process -FilePath powershell.exe -ArgumentList "-NoExit","-Command","Set-Location -Path '$WorkingDirectory'; $Command"
    }
}

# Prepare backend command: create venv if missing, activate, install deps, migrate, runserver
$backendCmd = @"
if (-not (Test-Path -Path "venv\Scripts\python.exe")) {
    Write-Host 'Creating virtualenv...'
    try {
        & py -3 -m venv venv
    } catch {
        & python -m venv venv
    }
}
# Activate and install
. .\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py runserver $BackendPort
"@

# Prepare frontend command: install and start
$frontendCmd = @"
npm ci
npm run dev
"@

Start-NewWindow -WorkingDirectory $backendPath -Command $backendCmd
Start-NewWindow -WorkingDirectory $frontendPath -Command $frontendCmd

Write-Host "Launched backend and frontend in new windows. Backend : $BackendPort"