#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals: Dedicated Production CLI
# ---------------------------------------------------------

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ENV_FILE="$BASE_DIR/.env"

# Fallback to the default installation directory if not found locally
if [[ ! -f "$ENV_FILE" ]] && [[ -f "$HOME/.aoi-terminals/.env" ]]; then
  ENV_FILE="$HOME/.aoi-terminals/.env"
  # Update BASE_DIR to the installed one so volumes/configs match
  BASE_DIR="$HOME/.aoi-terminals"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Error: Production environment not found."
  echo "   (Checked: $BASE_DIR/.env and $HOME/.aoi-terminals/.env)"
  echo "   Please run the installer first: bash scripts/install-docker.sh"
  exit 1
fi

# Load variables safely
read_env_value() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" | tail -n 1 | cut -d'=' -f2- || true
}

TERMINAL_TOKEN="$(read_env_value "TERMINAL_TOKEN" "$ENV_FILE")"
PUBLIC_BASE_URL="$(read_env_value "TERMINAL_PUBLIC_BASE_URL" "$ENV_FILE")"
FRONTEND_PORT="$(read_env_value "FRONTEND_PORT" "$ENV_FILE")"

# Determine docker compose command
COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "❌ Error: Docker Compose not found."
  exit 1
fi

usage() {
  echo "Aoi-Terminals Production CLI"
  echo ""
  echo "Usage: aoi-terminals [COMMAND]"
  echo ""
  echo "Commands:"
  echo "  up / start   : Start systems and set up port forwarding"
  echo "  down / stop  : Stop all systems"
  echo "  logs         : View system logs"
  echo "  info         : Show login information and URLs"
  echo "  qr           : Regenerate and display the login QR code"
  echo ""
}

cmd_up() {
  # 1. Port Forwarding (Tailscale/Local IP support)
  if [[ "$PUBLIC_BASE_URL" != http://localhost:* ]] && [[ "$PUBLIC_BASE_URL" != http://127.0.0.1:* ]]; then
    # Detect IP strictly using fixed logic
    local ts_exe=""
    if command -v tailscale.exe >/dev/null 2>&1; then
      ts_exe="tailscale.exe"
    elif [[ -f "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
      ts_exe="/mnt/c/Program Files/Tailscale/tailscale.exe"
    elif command -v tailscale >/dev/null 2>&1; then
      ts_exe="tailscale"
    fi

    local wsl_ip=$(hostname -I | awk '{print $1}')
    if [[ -n "$ts_exe" ]]; then
      local ts_ip="$("$ts_exe" ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)"
      if [[ -n "$ts_ip" ]]; then
         # Update URL if IP changed
         PUBLIC_BASE_URL="http://${ts_ip}:${FRONTEND_PORT}"
      fi
    fi

    echo "[aoi-terminals] 🔧 Configuring port forwarding..."
    local ps_script="$BASE_DIR/setup-port-forwarding.ps1"
    if [[ -f "$ps_script" ]]; then
      local win_script=$(wslpath -w "$ps_script")
      local ps_exe="powershell.exe"
      if ! command -v powershell.exe >/dev/null 2>&1; then
        for p in "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" "/mnt/c/Windows/Sysnative/WindowsPowerShell/v1.0/powershell.exe"; do
          if [[ -x "$p" ]]; then ps_exe="$p"; break; fi
        done
      fi
      "$ps_exe" -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"$win_script\" -WSL_IP $wsl_ip' -Wait" < /dev/null || true
    fi
  fi

  # 2. Start Containers
  echo "[aoi-terminals] 🚀 Launching production containers..."
  (
    cd "$BASE_DIR"
    export $(grep -v '^#' .env | xargs)
    
    # ---------------------------------------------------------
    # DYNAMIC CONFIGURATION (Runtime)
    # ---------------------------------------------------------
    # WSLのIPは再起動で変わるため、毎回動的に取得して環境変数にセットする
    # これにより docker-compose.yml 内の ${HOST_IP} や ${SSH_TARGET} が
    # 正しい最新の値を参照できるようになる
    
    # IP取得
    CURRENT_HOST_IP=$(hostname -I | awk '{print $1}')
    export HOST_IP="$CURRENT_HOST_IP"
    
    # SSHターゲット構築 (ユーザー名@IP)
    CURRENT_USER=$(whoami)
    export SSH_TARGET="${CURRENT_USER}@${CURRENT_HOST_IP}"
    
    echo "[aoi-terminals] 🌍 Dynamic Host IP: $HOST_IP"
    echo "[aoi-terminals] 🎯 SSH Target: $SSH_TARGET"
    # ---------------------------------------------------------

    $COMPOSE_CMD up -d
  )

  echo "✅ System is online!"
  cmd_info
  cmd_qr
}

cmd_down() {
  echo "[aoi-terminals] 🛑 Stopping systems..."
  (
    cd "$BASE_DIR"
    $COMPOSE_CMD down
  )
  echo "✅ Stopped."
}

cmd_logs() {
  (
    cd "$BASE_DIR"
    $COMPOSE_CMD logs -f
  )
}

cmd_info() {
  echo "---"
  echo "🔑 Login Token: $TERMINAL_TOKEN"
  echo "🔗 URL:         ${PUBLIC_BASE_URL%/?}/?token=${TERMINAL_TOKEN}"
  echo "📁 Directory:   $BASE_DIR"
  echo "---"
}

cmd_qr() {
  echo "🔗 Generating secure login QR code..."
  if [[ -f "$BASE_DIR/print-share-qr.sh" ]]; then
    bash "$BASE_DIR/print-share-qr.sh"
  else
    echo "❌ Error: print-share-qr.sh not found."
  fi
}

case "${1:-}" in
  up|start) cmd_up ;;
  down|stop) cmd_down ;;
  logs) cmd_logs ;;
  info) cmd_info ;;
  qr) cmd_qr ;;
  *) usage; exit 1 ;;
esac
