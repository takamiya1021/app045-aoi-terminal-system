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

# Load variables safely (strips surrounding quotes - handles multiple quote patterns)
read_env_value() {
  local key="$1"
  local file="$2"
  local val
  val="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d'=' -f2- || true)"
  # Remove surrounding double quotes if present (handle nested quotes too)
  while [[ "$val" == \"*\" ]]; do
    val="${val%\"}"
    val="${val#\"}"
  done
  # Remove surrounding single quotes if present
  while [[ "$val" == \'*\' ]]; do
    val="${val%\'}"
    val="${val#\'}"
  done
  printf "%s" "$val"
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
  # 1. Port Forwarding & IP Detection
  local detected_ip=""
  local wsl_ip=$(hostname -I | awk '{print $1}')
  
  # Try to detect Windows Tailscale IP (Best effort)
  if command -v tailscale.exe >/dev/null 2>&1; then
    detected_ip=$(tailscale.exe ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)
  fi
  
  if [[ -z "$detected_ip" ]] && [[ -f "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
    detected_ip=$("/mnt/c/Program Files/Tailscale/tailscale.exe" ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)
  fi

  # If we detected an IP, update the URL
  if [[ -n "$detected_ip" ]]; then
    # PUBLIC_BASE_URL is local, so we update it here for display
    PUBLIC_BASE_URL="http://${detected_ip}:${FRONTEND_PORT}"
    # Also export it so subprocesses (print-share-qr.sh) can use it
    export TERMINAL_PUBLIC_BASE_URL="$PUBLIC_BASE_URL"
    echo "[aoi-terminals]    (外部から接続するには、WindowsにTailscaleのインストールが必要じゃなぁ)"
  fi

  if [[ "$PUBLIC_BASE_URL" != http://localhost:* ]] && [[ "$PUBLIC_BASE_URL" != http://127.0.0.1:* ]]; then
    # Try to configure port forwarding (Best effort)
    echo "[aoi-terminals] 🔧 Configuring port forwarding..."
    local ps_script="$BASE_DIR/setup-port-forwarding.ps1"
    
    if [[ -f "$ps_script" ]]; then
      local win_script
      # wslpath might fail if interop is broken, suppress error
      win_script=$(wslpath -w "$ps_script" 2>/dev/null || echo "")
      if [[ -z "$win_script" ]]; then
         # Fallback for when wslpath fails but we can guess the path (e.g. \\wsl.localhost\Ubuntu...)
         # For now, just warn if we can't find it
         :
      fi
      
      if [[ -n "$win_script" ]]; then
        local ps_exe="powershell.exe"
        if ! command -v powershell.exe >/dev/null 2>&1; then
           # Search common paths
           for p in "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" "/mnt/c/Windows/Sysnative/WindowsPowerShell/v1.0/powershell.exe"; do
             if [[ -x "$p" ]]; then ps_exe="$p"; break; fi
           done
        fi
        
        # Execute PowerShell script
        if "$ps_exe" -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"$win_script\" -WSL_IP $wsl_ip' -Wait" < /dev/null >/dev/null 2>&1; then
           : # Success
        else
           # If failure (e.g. Interop broken), warn but don't exit
           echo "[aoi-terminals] ⚠️  Windows連携(Port Forward)の自動設定に失敗しました。"
           echo "[aoi-terminals]    (WSL Interopが無効、または管理者権限がありません)"
           echo "[aoi-terminals]    ※接続に問題がある場合は 'windows-run.bat' から起動してみてください。"
        fi
      fi
    else
      echo "(setup-port-forwarding.ps1 が見つからへん)"
    fi
  fi

  # 2. Start Containers
  echo "[aoi-terminals] 🚀 Launching production containers..."
  (
    cd "$BASE_DIR"
    set -a
    source "$ENV_FILE"
    set +a
    
    # ---------------------------------------------------------
    # DYNAMIC CONFIGURATION (Runtime)
    # ---------------------------------------------------------
    # WSLのIPは再起動で変わるため、毎回動的に取得して環境変数にセットする
    # これにより docker-compose.yml 内の ${HOST_IP} や ${SSH_TARGET} が
    # 正しい最新の値を参照できるようになる
    
    # ベースディレクトリ（スクリプト起動時に自動検出済み）
    export BASE_DIR="$BASE_DIR"

    # IP取得
    CURRENT_HOST_IP=$(hostname -I | awk '{print $1}')
    export HOST_IP="$CURRENT_HOST_IP"

    # SSHターゲット構築 (ユーザー名@IP)
    CURRENT_USER=$(whoami)
    export SSH_TARGET="${CURRENT_USER}@${CURRENT_HOST_IP}"

    # Tailscale IPをALLOWED_ORIGINSに動的追加（親シェルのdetected_ipを参照）
    if [[ -n "${detected_ip:-}" ]]; then
      tailscale_origin="http://${detected_ip}:${FRONTEND_PORT:-3101}"
      if [[ "$ALLOWED_ORIGINS" != *"$tailscale_origin"* ]]; then
        export ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${tailscale_origin}"
      fi
    fi

    echo "[aoi-terminals] 📁 Base Directory: $BASE_DIR"
    echo "[aoi-terminals] 🌍 Dynamic Host IP: $HOST_IP"
    echo "[aoi-terminals] 🎯 SSH Target: $SSH_TARGET"
    echo "[aoi-terminals] 🔐 CORS Allowed: $ALLOWED_ORIGINS"
    # ---------------------------------------------------------

    $COMPOSE_CMD up -d
  )

  echo "✅ System is online!"
  cmd_info
  cmd_qr

  # SSH Server Check (warning only, don't exit)
  if ! ss -tlnp 2>/dev/null | grep -q ':22 '; then
    echo ""
    echo "[aoi-terminals] ⚠️  SSHサーバーが起動していません。"
    echo "[aoi-terminals]    ターミナル接続するには、以下を実行してください："
    echo ""
    echo "    sudo service ssh start"
    echo ""
  fi
}

cmd_down() {
  echo "[aoi-terminals] 🛑 Stopping systems..."
  (
    cd "$BASE_DIR"
    set -a
    source "$ENV_FILE"
    set +a

    # 動的な値をexport（停止時も警告を出さないため）
    export BASE_DIR="$BASE_DIR"
    CURRENT_HOST_IP=$(hostname -I | awk '{print $1}')
    export HOST_IP="$CURRENT_HOST_IP"
    CURRENT_USER=$(whoami)
    export SSH_TARGET="${CURRENT_USER}@${CURRENT_HOST_IP}"

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
  echo "🔑 管理用トークン（Master Token）: $TERMINAL_TOKEN"
  echo "🔗 管理用URL:    ${PUBLIC_BASE_URL%/?}/?token=${TERMINAL_TOKEN}"
  echo "📁 Directory:   $BASE_DIR"
  echo "---"
  echo "⚠️  注意: 管理用トークンは安全に管理してください。一般ユーザーには共有しないでください。"
  echo "---"
}

cmd_qr() {
  echo "🔗 Generating secure login QR code..."
  if [[ -f "$BASE_DIR/print-share-qr.sh" ]]; then
    # Export variables so print-share-qr.sh uses them instead of reading from .env
    export TERMINAL_TOKEN
    export TERMINAL_PUBLIC_BASE_URL="${TERMINAL_PUBLIC_BASE_URL:-$PUBLIC_BASE_URL}"
    export FRONTEND_PORT
    export BACKEND_PORT="$(read_env_value "BACKEND_PORT" "$ENV_FILE")"
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
