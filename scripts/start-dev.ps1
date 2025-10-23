<#
Start both backend and frontend dev servers in VS Code terminal tabs.
Usage (from repo root):
  .\scripts\start-dev.ps1
This script will:
  - Ensure backend virtualenv exists (create with default 'python' or py -3 if needed)
  - Activate venv and install backend requirements if not already installed
  - Run Django migrations and start the Django dev server on :8000 in VS Code terminal
  - Run `npm ci` and `npm run dev` for the frontend in VS Code terminal

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

# Helper to create VS Code terminal with a specific command
function Start-VSCodeTerminal {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command
    )
    
    # Create a temporary script file for the terminal command
    $tempScript = [System.IO.Path]::GetTempFileName() + ".ps1"
    $fullCommand = @"
Set-Location -Path '$WorkingDirectory'
Write-Host "Starting $Name..." -ForegroundColor Green
$Command
"@
    
    Set-Content -Path $tempScript -Value $fullCommand
    
    # Use VS Code command to create new terminal and run the script
    try {
        code --new-window --wait=false
        Start-Sleep -Seconds 2  # Give VS Code time to load
        & code --command "workbench.action.terminal.new"
        Start-Sleep -Seconds 1
        & code --command "workbench.action.terminal.sendSequence" --args "{ `"text`": `"& '$tempScript'`n`" }"
    } catch {
        Write-Warning "Could not create VS Code terminal. Falling back to current terminal."
        Set-Location -Path $WorkingDirectory
        Invoke-Expression $Command
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

# Check if running in VS Code integrated terminal
$isVSCodeTerminal = $env:TERM_PROGRAM -eq "vscode" -or $env:VSCODE_INJECTION -eq "1"

if ($isVSCodeTerminal) {
    Write-Host "Running in VS Code integrated terminal" -ForegroundColor Green
    
    # Start backend in current terminal
    Write-Host "Starting backend server..." -ForegroundColor Yellow
    Set-Location -Path $backendPath
    
    # Create venv if it doesn't exist
    if (-not (Test-Path -Path "venv\Scripts\python.exe")) {
        Write-Host 'Creating virtualenv...' -ForegroundColor Cyan
        try {
            & py -3 -m venv venv
        } catch {
            & python -m venv venv
        }
    }
    
    # Activate and prepare backend
    . .\venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    python manage.py makemigrations
    python manage.py migrate
    
    # Start backend server in background job
    Write-Host "Starting Django server on port $BackendPort..." -ForegroundColor Green
    Start-Job -Name "BackendServer" -ScriptBlock {
        param($BackendPath, $BackendPort)
        Set-Location -Path $BackendPath
        . .\venv\Scripts\Activate.ps1
        python manage.py runserver $BackendPort
    } -ArgumentList $backendPath, $BackendPort
    
    # Wait a moment then start frontend
    Start-Sleep -Seconds 3
    Write-Host "Starting frontend server..." -ForegroundColor Yellow
    Set-Location -Path $frontendPath
    
    # Install frontend dependencies if needed
    if (-not (Test-Path -Path "node_modules")) {
        Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
        npm ci
    }
    
    # Start frontend server
    Write-Host "Starting frontend development server..." -ForegroundColor Green
    npm run dev
    
} else {
    Write-Host "Not running in VS Code. Opening VS Code with terminals..." -ForegroundColor Yellow
    
    # Try to open VS Code and create terminals
    try {
        # Open VS Code in current directory
        & code .
        Start-Sleep -Seconds 3
        
        Write-Host "Please manually create terminals in VS Code and run:" -ForegroundColor Cyan
        Write-Host "Backend terminal (in $backendPath):" -ForegroundColor Yellow
        Write-Host $backendCmd -ForegroundColor White
        Write-Host ""
        Write-Host "Frontend terminal (in $frontendPath):" -ForegroundColor Yellow
        Write-Host $frontendCmd -ForegroundColor White
        
    } catch {
        Write-Error "Could not open VS Code. Please run the servers manually."
    }
}

Write-Host "Backend should be available at: http://localhost:$BackendPort" -ForegroundColor Green
Write-Host "Frontend should be available at: http://localhost:5173" -ForegroundColor Green