# ============================================
# SSL Certificate Generation Script
# Uses mkcert for local development certificates
# ============================================

$ErrorActionPreference = "Stop"

$SSL_DIR = Join-Path $PSScriptRoot "..\docker\nginx\ssl"

# Check if mkcert is installed
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host "mkcert is not installed. Installing via winget..." -ForegroundColor Yellow
    winget install FiloSottile.mkcert
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install mkcert. Please install manually:" -ForegroundColor Red
        Write-Host "  winget install FiloSottile.mkcert" -ForegroundColor Cyan
        Write-Host "  or download from: https://github.com/FiloSottile/mkcert/releases" -ForegroundColor Cyan
        exit 1
    }
    
    Write-Host "Please restart your terminal and run this script again." -ForegroundColor Yellow
    exit 0
}

# Create SSL directory if it doesn't exist
if (-not (Test-Path $SSL_DIR)) {
    New-Item -ItemType Directory -Path $SSL_DIR -Force | Out-Null
}

# Install local CA (first time only)
Write-Host "Installing local CA (requires admin privileges on first run)..." -ForegroundColor Cyan
mkcert -install

# Generate certificate for api.test.local
Write-Host "Generating SSL certificate for api.test.local..." -ForegroundColor Cyan
Push-Location $SSL_DIR
mkcert api.test.local localhost 127.0.0.1 ::1
Pop-Location

# Rename files to match nginx.conf expectations
$certFile = Join-Path $SSL_DIR "api.test.local+3.pem"
$keyFile = Join-Path $SSL_DIR "api.test.local+3-key.pem"
$newCertFile = Join-Path $SSL_DIR "api.test.local.pem"
$newKeyFile = Join-Path $SSL_DIR "api.test.local-key.pem"

if (Test-Path $certFile) {
    Move-Item -Path $certFile -Destination $newCertFile -Force
}
if (Test-Path $keyFile) {
    Move-Item -Path $keyFile -Destination $newKeyFile -Force
}

Write-Host ""
Write-Host "SSL certificates generated successfully!" -ForegroundColor Green
Write-Host "  Certificate: $newCertFile" -ForegroundColor Gray
Write-Host "  Key: $newKeyFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Add the following to your hosts file (C:\Windows\System32\drivers\etc\hosts):" -ForegroundColor Yellow
Write-Host "  127.0.0.1 api.test.local" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then run: docker-compose up --build" -ForegroundColor Green
