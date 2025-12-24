#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals "one command" installer for Docker.
#
# 使い方例（このスクリプトを raw.githubusercontent.com で配る想定）:
#   curl -fsSL https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/install-docker.sh \
#     | AOI_TERMINALS_IMAGE_REPO=ghcr.io/takamiya1021/app045-aoi-terminal-system TERMINAL_TOKEN=your_token bash
#
# NOTE:
# - ここでは GHCR 上のビルド済みイメージを pull して起動する（ビルド不要）。
# - 設定は ~/.aoi-terminals/.env に保存される。

# 1. 基本設定
# ---------------------------------------------------------
# Rootユーザーチェック
if [[ $EUID -eq 0 ]]; then
   echo "❌ Error: This script must NOT be run as root."
   echo "   Please run as a normal user (e.g. your WSL default user)."
   echo ""
   echo "❌ エラー: このスクリプトは root ユーザーでは実行できません。"
   echo "   一般ユーザー（WSLのデフォルトユーザーなど）で実行してください。"
   exit 1
fi

# Dockerグループ所属チェック & 自動追加
# id コマンドで「このディストリビューション内での」グループ所属を確認
if ! id -nG "$USER" 2>/dev/null | grep -qw "docker"; then
  echo "⚠️ User '$USER' is not in the 'docker' group."
  echo "🔧 Adding user to 'docker' group (requires sudo)..."
  if sudo usermod -aG docker "$USER"; then
    echo "✅ Successfully added to docker group."
    echo "⚠️ IMPORTANT: You MUST restart your WSL terminal for this change to take effect."
    echo "   (Run 'wsl --terminate <DistroName>' from PowerShell, or close all terminal windows)"
    echo "⚠️ 重要: 設定を反映するために、必ずターミナル(WSL)を再起動してください。"
    echo ""
    echo "再起動後、以下を実行してください:"
    echo "  ~/.aoi-terminals/aoi-terminals start"
    exit 0
  else
    echo "❌ Failed to add user to docker group. Please run manually:"
    echo "   sudo usermod -aG docker $USER"
    exit 1
  fi
fi

DEFAULT_IMAGE_REPO="ghcr.io/takamiya1021/app045-aoi-terminal-system"
DEFAULT_TAG="latest"
DEFAULT_INSTALL_DIR="$HOME/.aoi-terminals"
FRONTEND_PORT_DEFAULT="3101"
BACKEND_PORT_DEFAULT="3102"
DEFAULT_LINK_TOKEN_TTL="300"
DEFAULT_COOKIE_SECURE="0"
DEFAULT_ALLOWED_ORIGINS="http://localhost:3101,http://127.0.0.1:3101"

# curl | bash 実行時や環境による BASH_SOURCE の挙動を吸収する
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd || echo ".")"

generate_terminal_token() {
  # 依存を増やさずに、それなりに強いトークンを作る（base64url）
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n' | tr '+/' '-_' | tr -d '='
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import os, base64
print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("="), end="")
PY
    return 0
  fi

  # openssl も python も無い環境向け（/dev/urandom + base64）
  dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '='
}

detect_public_base_url() {
  local port="$FRONTEND_PORT_DEFAULT"

  if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
    printf "%s" "${TERMINAL_PUBLIC_BASE_URL%/}"
    return 0
  fi

  # Tailscale優先: Windows側の tailscale.exe または Linux側の tailscale を探す
  local ts_exe=""
  if command -v tailscale.exe >/dev/null 2>&1; then
    ts_exe="tailscale.exe"
  elif [[ -f "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
    ts_exe="/mnt/c/Program Files/Tailscale/tailscale.exe"
  elif command -v tailscale >/dev/null 2>&1; then
    ts_exe="tailscale"
  fi

  if [[ -n "$ts_exe" ]]; then
    local ts_ip=""
    # Windows側のTailscaleが応答しない場合があるのでタイムアウト(2秒)を設定
    ts_ip="$(timeout 2s "$ts_exe" ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)"
    if [[ -n "$ts_ip" ]]; then
      printf "http://%s:%s" "$ts_ip" "$port"
      return 0
    fi
  fi

  # ベストエフォート: WSL内IPを拾う（LANから見える保証はない）
  local ip_guess=""
  ip_guess="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [[ -n "$ip_guess" ]]; then
    printf "http://%s:%s" "$ip_guess" "$port"
    return 0
  fi

  printf "http://localhost:%s" "$ip_guess" "$port"
}

read_env_value() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  local val="${line#${key}=}"
  # Remove surrounding quotes if present
  val="${val%\"}"
  val="${val#\"}"
  printf "%s" "$val"
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -qE "^${key}=" "$file"; then
    # 値中に / があり得るので区切りは | を使う
    sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$file"
  else
    printf "\n%s=\"%s\"\n" "$key" "$value" >>"$file"
  fi
}

append_allowed_origin_if_missing() {
  local origin="$1"
  local file="$2"

  if [[ -z "$origin" ]]; then
    return 0
  fi

  local current=""
  current="$(read_env_value "ALLOWED_ORIGINS" "$file" || true)"
  if [[ -z "$current" ]]; then
    ensure_env_value "ALLOWED_ORIGINS" "$origin" "$file"
    return 0
  fi

  # すでに含まれてたら何もしない
  if printf "%s" "$current" | tr ',' '\n' | grep -Fxq "$origin"; then
    return 0
  fi

  ensure_env_value "ALLOWED_ORIGINS" "${current},${origin}" "$file"
}

extract_json_string() {
  local key="$1"
  # 超軽量パーサ: {"token":"..."} の ... を抜く（tokenはbase64url想定）
  sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

if ! command -v docker >/dev/null 2>&1; then
  echo "[aoi-terminals] docker が見つかりません。Dockerをインストールしてから再実行してください。"
  exit 1
fi

COMPOSE=()
COMPOSE_LABEL=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
  COMPOSE_LABEL="docker compose"
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
  COMPOSE_LABEL="docker-compose"
else
  echo "[aoi-terminals] docker compose が使用できません。"
  exit 1
fi

IMAGE_REPO="$DEFAULT_IMAGE_REPO"
TAG="$DEFAULT_TAG"

BASE_DIR="$DEFAULT_INSTALL_DIR"
mkdir -p "$BASE_DIR"
mkdir -p "$BASE_DIR/.ssh"

# SSH鍵の生成
# SSH鍵の生成 (なければ作る)
SSH_KEY="$BASE_DIR/.ssh/id_rsa"
if [[ ! -f "$SSH_KEY" ]]; then
  echo "🔑 Generating SSH key..."
  ssh-keygen -t rsa -b 4096 -f "$SSH_KEY" -N "" -C "aoi-terminals-bridge"
  chmod 600 "$SSH_KEY"
fi

# 権限の自動修復 (常に実行)
echo "[debug] Before chown:"
ls -l "$SSH_KEY" || true

# コンテナ内のnodeユーザー(1000)が読めるように所有者を変更
if ! chown 1000:1000 "$SSH_KEY"; then
  echo "⚠️ Failed to chown $SSH_KEY to 1000:1000. Trying chmod 644..."
  chmod 644 "$SSH_KEY"
fi

echo "[debug] After chown/chmod:"
ls -l "$SSH_KEY"

# ホスト側の authorized_keys に登録
PUB_KEY_CONTENT=$(cat "${SSH_KEY}.pub")
if ! grep -qF "$PUB_KEY_CONTENT" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
  echo "[aoi-terminals] 🔑 Registering bridge key..."
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  echo "$PUB_KEY_CONTENT" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
fi

# ホストのユーザー名取得
CURRENT_USER=$(whoami)
# コンテナから見たホストIP
HOST_IP=$(hostname -I | awk '{print $1}')
# Docker Desktop on Windowsの場合、host.docker.internal は Windows側を指してしまう。
# WSL内のSSHサーバーに繋ぐため、直接IPを指定する。
SSH_TARGET="${CURRENT_USER}@${HOST_IP}"

PUBLIC_BASE_URL="$(detect_public_base_url)"
PUBLIC_ORIGIN="${PUBLIC_BASE_URL%/}"

# トークンの特定/生成
if [[ -n "${TERMINAL_TOKEN:-}" ]]; then
  token_source="provided"
elif [[ -f "$BASE_DIR/.env" ]]; then
  token_source="existing"
  TERMINAL_TOKEN="$(read_env_value "TERMINAL_TOKEN" "$BASE_DIR/.env")"
else
  token_source="generated"
  TERMINAL_TOKEN="$(generate_terminal_token)"
fi

cat >"$BASE_DIR/docker-compose.yml" <<YAML
services:
  backend:
    image: ${IMAGE_REPO}-backend:${TAG}
    ports:
      - "${BACKEND_PORT_DEFAULT%:*}:3102"
    extra_hosts:
      - "host.docker.internal:\${HOST_IP}"
    volumes:
      - "${BASE_DIR}/.ssh/id_rsa:/app/ssh_key:ro"
    environment:
      PORT: "3102"
      ALLOWED_ORIGINS: "${DEFAULT_ALLOWED_ORIGINS},${PUBLIC_ORIGIN}"
      TERMINAL_TOKEN: "${TERMINAL_TOKEN}"
      TERMINAL_LINK_TOKEN_TTL_SECONDS: "${DEFAULT_LINK_TOKEN_TTL}"
      TERMINAL_COOKIE_SECURE: "${DEFAULT_COOKIE_SECURE}"
      NODE_ENV: "production"
      TERMINAL_SSH_TARGET: "\${SSH_TARGET}"
      TERMINAL_SSH_KEY: "/app/ssh_key"
    restart: unless-stopped

  frontend:
    image: ${IMAGE_REPO}-frontend:${TAG}
    depends_on:
      - backend
    ports:
      - "${FRONTEND_PORT_DEFAULT}:3101"
    environment:
      NODE_ENV: production
    restart: unless-stopped
YAML

# .env は常に上書き（フォーマットを常に最新・正しい状態に保つ）
# ただし既存のトークンがあれば保持する
cat >"$BASE_DIR/.env" <<ENV
AOI_TERMINALS_IMAGE_REPO="${IMAGE_REPO}"
AOI_TERMINALS_TAG="${TAG}"
TERMINAL_TOKEN="${TERMINAL_TOKEN}"
TERMINAL_PUBLIC_BASE_URL="${PUBLIC_BASE_URL}"
ALLOWED_ORIGINS="${DEFAULT_ALLOWED_ORIGINS},${PUBLIC_ORIGIN}"
TERMINAL_LINK_TOKEN_TTL_SECONDS="${DEFAULT_LINK_TOKEN_TTL}"
TERMINAL_COOKIE_SECURE="${DEFAULT_COOKIE_SECURE}"
BACKEND_NODE_ENV="production"
BASE_DIR="${BASE_DIR}"
HOST_IP="${HOST_IP}"
SSH_TARGET="${SSH_TARGET}"
BACKEND_PORT="${BACKEND_PORT_DEFAULT}"
FRONTEND_PORT="${FRONTEND_PORT_DEFAULT}"
ENV
echo "[aoi-terminals] 📝 Updated environment file: $BASE_DIR/.env"

# 5. プロダクト用ツールとスクリプトの配置
# ---------------------------------------------------------
echo "[aoi-terminals] 🚚 Downloading production scripts..."

# QR表示スクリプト
curl -fsSL "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/print-share-qr.sh" > "$BASE_DIR/print-share-qr.sh"
chmod +x "$BASE_DIR/print-share-qr.sh"

# プロダクト専用CLI (aoi-terminals)
curl -fsSL "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/production-cli.sh" > "$BASE_DIR/aoi-terminals"
chmod +x "$BASE_DIR/aoi-terminals"

# 6. セットアップ完了と起動
# ---------------------------------------------------------
echo "---"
echo "✅ Installation Success!"
echo "---"
echo "Environment: PRODUCTION"
echo "Base Directory: $BASE_DIR"
echo "---"

# 初回起動は行わない（ユーザーに委ねる）
# echo "🚀 Starting the system for the first time..."
# bash "$BASE_DIR/aoi-terminals" start < /dev/null

echo ""
echo "✅ Installation Success!"
echo "---------------------------------------------------"
echo "To start the system, run:"
echo "  $BASE_DIR/aoi-terminals start"
echo "---------------------------------------------------"

echo ""
echo "💡 Usage:"
echo "   $BASE_DIR/aoi-terminals [start|stop|logs|info|qr]"
echo ""
