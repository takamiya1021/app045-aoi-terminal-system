#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals Start Script for Docker Environment.
# (Inspired by development scripts/start.sh)

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ENV_FILE="$BASE_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Error: .env file not found in $BASE_DIR"
  echo "   Please run install-docker.sh first."
  exit 1
fi

# 1. サーバー設定の読み込み
# ---------------------------------------------------------
# .env から設定を読み込む（値にスペースがある場合を考慮）
read_env_value() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d'=' -f2- || true
}

TERMINAL_TOKEN="$(read_env_value "TERMINAL_TOKEN" "$ENV_FILE")"
PUBLIC_BASE_URL="$(read_env_value "TERMINAL_PUBLIC_BASE_URL" "$ENV_FILE")"
BACKEND_PORT="$(read_env_value "BACKEND_PORT" "$ENV_FILE")"
FRONTEND_PORT="$(read_env_value "FRONTEND_PORT" "$ENV_FILE")"

# 2. Windows Port Forwarding Setup
# ---------------------------------------------------------
if [[ "$PUBLIC_BASE_URL" != http://localhost:* ]] && [[ "$PUBLIC_BASE_URL" != http://127.0.0.1:* ]]; then
  WSL_IP=$(hostname -I | awk '{print $1}')
  echo "[aoi-terminals] 🔧 Setting up Windows port forwarding..."
  echo "   WSL2 IP: $WSL_IP"
  echo "   Public URL: $PUBLIC_BASE_URL"

  SCRIPT_PATH_WIN=$(wslpath -w "$BASE_DIR/setup-port-forwarding.ps1")
  
  # rootユーザー等でPATHが通っていないケースを考慮して絶対パスも試す
  PS_EXE="powershell.exe"
  if ! command -v powershell.exe >/dev/null 2>&1; then
    for path in "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" "/mnt/c/Windows/Sysnative/WindowsPowerShell/v1.0/powershell.exe"; do
      if [[ -x "$path" ]]; then
        PS_EXE="$path"
        break
      fi
    done
  fi
  
  # パイプ実行時でも入力を奪われないように /dev/null をリダイレクト
  "$PS_EXE" -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"$SCRIPT_PATH_WIN\" -WSL_IP $WSL_IP' -Wait" < /dev/null || true

  echo "   ✅ Port forwarding setup triggered (if admin approval was given)."
fi

# 3. Docker Containers 起動
# ---------------------------------------------------------
echo "[aoi-terminals] 🚀 Starting containers in: $BASE_DIR"
(
  cd "$BASE_DIR"
  
  # docker compose コマンドの特定
  COMPOSE_CMD=""
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    echo "❌ Error: docker compose not found."
    exit 1
  fi

  # .env をエクスポートしてから起動
  export $(grep -v '^#' .env | xargs)
  $COMPOSE_CMD up -d
)

echo "---"
echo "✅ System started in Docker!"
echo "Base Directory: $BASE_DIR"
echo "---"
echo "🔑 Login token: ${TERMINAL_TOKEN}"
echo "🔗 Login URL:   ${PUBLIC_BASE_URL%/?}/?token=${TERMINAL_TOKEN}"
echo "---"

# 4. QRコード表示
# ---------------------------------------------------------
echo "🔗 Generating one-time share QR..."
# print-share-qr.sh は同じディレクトリにある想定
if [[ -f "$BASE_DIR/print-share-qr.sh" ]]; then
  bash "$BASE_DIR/print-share-qr.sh"
fi

echo "To stop: (cd \"$BASE_DIR\" && docker compose down)"
echo "To view logs: (cd \"$BASE_DIR\" && docker compose logs -f)"
