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

Write-Host ""
Write-Host "Current port forwarding configuration:" -ForegroundColor Cyan
netsh interface portproxy show all

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
