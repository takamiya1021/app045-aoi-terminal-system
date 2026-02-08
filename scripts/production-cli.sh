#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals v2: Production CLI
# WSLネイティブDocker + Tailscale（WSL上）前提

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ENV_FILE="$BASE_DIR/.env"

if [[ ! -f "$ENV_FILE" ]] && [[ -f "$HOME/.aoi-terminals/.env" ]]; then
  ENV_FILE="$HOME/.aoi-terminals/.env"
  BASE_DIR="$HOME/.aoi-terminals"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env が見つかりません。先にインストーラーを実行してください。"
  exit 1
fi

# .envから値を読む
read_env_value() {
  local val
  val="$(grep -E "^${1}=" "$2" | tail -n 1 | cut -d'=' -f2- || true)"
  val="${val%\"}"; val="${val#\"}"
  printf "%s" "$val"
}

TERMINAL_TOKEN="$(read_env_value "TERMINAL_TOKEN" "$ENV_FILE")"
PUBLIC_BASE_URL="$(read_env_value "TERMINAL_PUBLIC_BASE_URL" "$ENV_FILE")"
FRONTEND_PORT="$(read_env_value "FRONTEND_PORT" "$ENV_FILE")"

# docker compose コマンド検出
COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "❌ docker compose が見つかりません。"
  exit 1
fi

usage() {
  echo "Aoi-Terminals CLI"
  echo ""
  echo "Usage: aoi-terminals [COMMAND]"
  echo ""
  echo "Commands:"
  echo "  start / up  : システム起動"
  echo "  stop / down : システム停止"
  echo "  logs        : ログ表示"
  echo "  info        : 接続情報表示"
  echo "  qr          : QRコード再生成"
  echo ""
}

cmd_up() {
  # Tailscale IP検出（WSL上）
  local detected_ip=""
  if command -v tailscale >/dev/null 2>&1; then
    detected_ip=$(tailscale ip -4 2>/dev/null | head -n 1 || true)
  fi

  if [[ -n "$detected_ip" ]]; then
    PUBLIC_BASE_URL="http://${detected_ip}:${FRONTEND_PORT}"
    export TERMINAL_PUBLIC_BASE_URL="$PUBLIC_BASE_URL"
  fi

  # コンテナ起動
  echo "[aoi-terminals] 🚀 起動中..."
  (
    cd "$BASE_DIR"
    set -a; source "$ENV_FILE"; set +a

    # 動的設定（.envの静的値を上書き）
    export BASE_DIR="$BASE_DIR"
    export SSH_TARGET="$(whoami)@localhost"

    # Tailscale IPをALLOWED_ORIGINSに追加
    if [[ -n "${detected_ip:-}" ]]; then
      local ts_origin="http://${detected_ip}:${FRONTEND_PORT:-3101}"
      if [[ "$ALLOWED_ORIGINS" != *"$ts_origin"* ]]; then
        export ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${ts_origin}"
      fi
    fi

    $COMPOSE_CMD up -d
  )

  echo "✅ 起動完了"
  cmd_info

  # バックエンド起動待ち
  echo "[aoi-terminals] ⏳ バックエンド起動待ち..."
  local attempt=0
  while [[ $attempt -lt 30 ]]; do
    if curl -sS --max-time 2 "http://127.0.0.1:${BACKEND_PORT:-3102}/session" >/dev/null 2>&1; then
      break
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  if [[ $attempt -lt 30 ]]; then
    cmd_qr
  else
    echo "[aoi-terminals] ⚠️ バックエンドの起動に時間がかかっています。後で aoi-terminals qr を実行してください。"
  fi

  # SSH確認
  if ! ss -tlnp 2>/dev/null | grep -q ':22 '; then
    echo ""
    echo "[aoi-terminals] ⚠️ SSHサーバーが起動していません。"
    echo "    sudo service ssh start"
    echo ""
  fi
}

cmd_down() {
  echo "[aoi-terminals] 🛑 停止中..."
  (
    cd "$BASE_DIR"
    set -a; source "$ENV_FILE"; set +a
    export BASE_DIR="$BASE_DIR"
    export SSH_TARGET="$(whoami)@localhost"
    $COMPOSE_CMD down
  )
  echo "✅ 停止完了"
}

cmd_logs() {
  (cd "$BASE_DIR"; $COMPOSE_CMD logs -f)
}

cmd_info() {
  echo "---"
  echo "🔑 トークン: $TERMINAL_TOKEN"
  echo "🔗 URL: ${PUBLIC_BASE_URL%/}/?token=${TERMINAL_TOKEN}"
  echo "📁 Dir: $BASE_DIR"
  echo "---"
}

cmd_qr() {
  if [[ -f "$BASE_DIR/print-share-qr.sh" ]]; then
    export TERMINAL_TOKEN
    export TERMINAL_PUBLIC_BASE_URL="${TERMINAL_PUBLIC_BASE_URL:-$PUBLIC_BASE_URL}"
    export FRONTEND_PORT
    export BACKEND_PORT="$(read_env_value "BACKEND_PORT" "$ENV_FILE")"
    bash "$BASE_DIR/print-share-qr.sh"
  else
    echo "❌ print-share-qr.sh が見つかりません。"
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
