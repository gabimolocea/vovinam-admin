#!/usr/bin/env pwsh
# Quick Deploy Script for DigitalOcean App Platform
# Run this from repository root: .\scripts\deploy-prep.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 DigitalOcean Deployment Preparation" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

# Check if in correct directory
if (-not (Test-Path ".\backend\manage.py")) {
    Write-Host "❌ Error: Must run from repository root" -ForegroundColor Red
    Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow
    exit 1
}

# Generate Django secret key
Write-Host "📝 Generating Django Secret Key..." -ForegroundColor Cyan
$secretKey = python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error generating secret key. Is Django installed?" -ForegroundColor Red
    exit 1
}

# Check git status
Write-Host ""
Write-Host "📊 Checking Git Status..." -ForegroundColor Cyan
git status --short

$uncommitted = git status --porcelain
if ($uncommitted) {
    Write-Host ""
    Write-Host "⚠️  Warning: You have uncommitted changes" -ForegroundColor Yellow
    $response = Read-Host "Do you want to commit and push now? (y/n)"
    
    if ($response -eq 'y') {
        Write-Host ""
        $commitMsg = Read-Host "Enter commit message"
        git add .
        git commit -m "$commitMsg"
        git push origin main
        Write-Host "✅ Code pushed to GitHub" -ForegroundColor Green
    }
} else {
    Write-Host "✅ All changes committed" -ForegroundColor Green
    $response = Read-Host "Push to GitHub? (y/n)"
    if ($response -eq 'y') {
        git push origin main
        Write-Host "✅ Code pushed to GitHub" -ForegroundColor Green
    }
}

# Display deployment information
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Green
Write-Host "🎯 DEPLOYMENT CONFIGURATION" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green
Write-Host ""

Write-Host "Copy these Environment Variables to DigitalOcean:" -ForegroundColor Cyan
Write-Host ""
Write-Host "DEBUG=False" -ForegroundColor White
Write-Host "DJANGO_SECRET_KEY=$secretKey" -ForegroundColor White
Write-Host "DJANGO_SETTINGS_MODULE=crud.settings_production" -ForegroundColor White
Write-Host "ALLOWED_HOSTS=.ondigitalocean.app" -ForegroundColor White
Write-Host "CORS_ALLOWED_ORIGINS=https://your-frontend-url.vercel.app,http://localhost:5173" -ForegroundColor White
Write-Host "DATABASE_URL=`${db.DATABASE_URL}" -ForegroundColor White
Write-Host ""

Write-Host "=" * 60 -ForegroundColor Green
Write-Host "📋 NEXT STEPS" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green
Write-Host ""
Write-Host "1. Go to: https://cloud.digitalocean.com/apps" -ForegroundColor Yellow
Write-Host "2. Click 'Create App'" -ForegroundColor Yellow
Write-Host "3. Select GitHub → gabimolocea/vovinam-admin → main branch" -ForegroundColor Yellow
Write-Host "4. Set Source Directory: backend" -ForegroundColor Yellow
Write-Host "5. Add PostgreSQL Database (Basic - `$7/month)" -ForegroundColor Yellow
Write-Host "6. Add Environment Variables (see above)" -ForegroundColor Yellow
Write-Host "7. Deploy and wait ~5-10 minutes" -ForegroundColor Yellow
Write-Host "8. In Console tab, run: python manage.py createsuperuser" -ForegroundColor Yellow
Write-Host "9. Test: https://your-app.ondigitalocean.app/api/" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 Full guide: DEPLOY_BACKEND.md" -ForegroundColor Cyan
Write-Host "✅ Checklist: DEPLOYMENT_CHECKLIST.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "Estimated Cost: `$12/month (App + Database)" -ForegroundColor Green
Write-Host ""

# Save config to file
$configFile = ".\deployment-config.txt"
@"
DigitalOcean Deployment Configuration
Generated: $(Get-Date)

ENVIRONMENT VARIABLES:
======================
DEBUG=False
DJANGO_SECRET_KEY=$secretKey
DJANGO_SETTINGS_MODULE=crud.settings_production
ALLOWED_HOSTS=.ondigitalocean.app
CORS_ALLOWED_ORIGINS=https://your-frontend-url.vercel.app,http://localhost:5173
DATABASE_URL=`${db.DATABASE_URL}

APP PLATFORM SETTINGS:
======================
Repository: gabimolocea/vovinam-admin
Branch: main
Source Directory: backend
HTTP Port: 8000
Database: PostgreSQL 15 (Basic)

POST-DEPLOYMENT:
================
1. python manage.py createsuperuser
2. Test: https://your-app.ondigitalocean.app/api/

IMPORTANT: Update CORS_ALLOWED_ORIGINS and ALLOWED_HOSTS with actual frontend URL
"@ | Out-File -FilePath $configFile -Encoding UTF8

Write-Host "💾 Configuration saved to: $configFile" -ForegroundColor Magenta
Write-Host "⚠️  DO NOT commit this file (contains secret key)" -ForegroundColor Red
Write-Host ""
