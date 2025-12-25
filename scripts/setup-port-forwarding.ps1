# WSL2 Port Forwarding Setup Script
# This script configures Windows port forwarding to WSL2

param(
    [Parameter(Mandatory=$true)]
    [string]$WSL_IP
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WSL2 Port Forwarding Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "WSL2 IP Address: $WSL_IP" -ForegroundColor Yellow
Write-Host ""

# ポート一覧
$ports = @(3101, 3102)

foreach ($port in $ports) {
    Write-Host "Setting up port $port..." -ForegroundColor Green

    # 既存の設定を削除（エラーは無視）
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null

    # 新しい設定を追加
    $result = netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$WSL_IP

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Port $port forwarding configured" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Failed to configure port $port" -ForegroundColor Red
    }
}


# ------------------------------------------------------------------
# Tailscale IP Detection & .env Update
# ------------------------------------------------------------------

Write-Host "🔍 Detecting Windows Tailscale IP..." -ForegroundColor Cyan

$ts_ip = ""
if (Get-Command "tailscale.exe" -ErrorAction SilentlyContinue) {
    try {
        $ts_ip = (tailscale.exe ip -4 | Select-Object -First 1).Trim()
    } catch {}
} elseif (Test-Path "C:\Program Files\Tailscale\tailscale.exe") {
    try {
        $ts_ip = (& "C:\Program Files\Tailscale\tailscale.exe" ip -4 | Select-Object -First 1).Trim()
    } catch {}
}

if (-not [string]::IsNullOrWhiteSpace($ts_ip)) {
    Write-Host "  ✅ Found Tailscale IP: $ts_ip" -ForegroundColor Green

    # WSLパス (.env) の特定
    # このスクリプトは \\wsl.localhost\Ubuntu\... にあるはずなので、そこから .env を探す
    $scriptPath = $PSScriptRoot
    $envPath = Join-Path $scriptPath ".env"
    
    # フォールバック: 親ディレクトリ (scripts/../.env)
    if (-not (Test-Path $envPath)) {
        $envPath = Join-Path (Split-Path $scriptPath -Parent) ".env"
    }

    if (Test-Path $envPath) {
        Write-Host "  📝 Updating .env file at: $envPath" -ForegroundColor Cyan
        
        $envContent = Get-Content $envPath
        $newLine = "TERMINAL_PUBLIC_BASE_URL=`"http://${ts_ip}:3101`""
        
        $found = $false
        $newContent = @()
        foreach ($line in $envContent) {
            if ($line -match "^TERMINAL_PUBLIC_BASE_URL=") {
                $newContent += $newLine
                $found = $true
            } else {
                $newContent += $line
            }
        }
        
        if (-not $found) {
            $newContent += $newLine
        }
        
        Set-Content -Path $envPath -Value $newContent -Encoding UTF8
        Write-Host "  ✅ TERMINAL_PUBLIC_BASE_URL updated successfully!" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  .env file not found. Could not update settings." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  Tailscale IP not found (Tailscale not installed or not running?)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
