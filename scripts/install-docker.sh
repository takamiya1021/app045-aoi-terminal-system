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

# 1. 基本設定の読み込み
# ---------------------------------------------------------
CONFIG_NAME="install-config.sh"
# curl | bash 実行時や環境による BASH_SOURCE の挙動を吸収する
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd || echo ".")"

if [[ -f "$SCRIPT_DIR/$CONFIG_NAME" ]]; then
  source "$SCRIPT_DIR/$CONFIG_NAME"
else
  # ネットワーク経由での実行時、またはファイルが無い場合のデフォルト
  DEFAULT_IMAGE_REPO="ghcr.io/takamiya1021/app045-aoi-terminal-system"
  DEFAULT_TAG="latest"
  DEFAULT_INSTALL_DIR="$HOME/.aoi-terminals"
  FRONTEND_PORT_DEFAULT="3101"
  BACKEND_PORT_DEFAULT="3102"
  DEFAULT_LINK_TOKEN_TTL="300"
  DEFAULT_COOKIE_SECURE="0"
  DEFAULT_ALLOWED_ORIGINS="http://localhost:3101,http://127.0.0.1:3101"
fi

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
    ts_ip="$("$ts_exe" ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)"
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

  printf "http://localhost:%s" "$port"
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
  printf "%s" "${line#${key}=}"
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -qE "^${key}=" "$file"; then
    # 値中に / があり得るので区切りは | を使う
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf "\n%s=%s\n" "$key" "$value" >>"$file"
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
  echo "[aoi-terminals] docker が見つからへん。Dockerを入れてからもう一回やってな。"
  exit 1
fi

COMPOSE=()
COMPOSE_LABEL=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
  COMPOSE_LABEL="docker compose"
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  # 一部環境（特にWSL/古めのLinux）では v1 系の docker-compose が入ってることがある
  COMPOSE=(docker-compose)
  COMPOSE_LABEL="docker-compose"
else
  echo "[aoi-terminals] docker compose が使えへん（v2 plugin も docker-compose も見つからん）。"
  echo "  - Docker Desktop を使ってるなら: Settings → Resources → WSL Integration でこのUbuntuをON"
  echo "  - Ubuntu側に入れるなら: sudo apt-get update && sudo apt-get install -y docker-compose-plugin"
  exit 1
fi

IMAGE_REPO="$DEFAULT_IMAGE_REPO"
TAG="$DEFAULT_TAG"

BASE_DIR="$DEFAULT_INSTALL_DIR"
mkdir -p "$BASE_DIR"
mkdir -p "$BASE_DIR/.ssh"

# SSH鍵の生成（コンテナからホストへの踏み台用）
SSH_KEY="$BASE_DIR/.ssh/id_rsa"
if [[ ! -f "$SSH_KEY" ]]; then
  echo "[aoi-terminals] 🔑 Generating SSH key for host access..."
  ssh-keygen -t rsa -b 4096 -f "$SSH_KEY" -N "" -C "aoi-terminals-bridge"
fi

# ホスト側の authorized_keys に登録（重複チェック付き）
PUB_KEY_CONTENT=$(cat "${SSH_KEY}.pub")
if ! grep -qF "$PUB_KEY_CONTENT" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
  echo "[aoi-terminals] 🔑 Registering public key to host's authorized_keys..."
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  echo "$PUB_KEY_CONTENT" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
fi

# ホストのユーザー名取得
CURRENT_USER=$(whoami)
# コンテナから見たホストIP（WSL2自身のIP）
HOST_IP=$(hostname -I | awk '{print $1}')
SSH_TARGET="${CURRENT_USER}@host.docker.internal"

PUBLIC_BASE_URL="$(detect_public_base_url)"
PUBLIC_ORIGIN="${PUBLIC_BASE_URL%/}"

# 以前の .env や環境変数から TERMINAL_TOKEN を特定/生成して確定させる
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
      - "host.docker.internal:${HOST_IP}"
    volumes:
      - "${BASE_DIR}/.ssh/id_rsa:/app/ssh_key:ro"
    environment:
      PORT: "3102"
      ALLOWED_ORIGINS: "${DEFAULT_ALLOWED_ORIGINS},${PUBLIC_ORIGIN}"
      TERMINAL_TOKEN: "${TERMINAL_TOKEN}"
      TERMINAL_LINK_TOKEN_TTL_SECONDS: "${DEFAULT_LINK_TOKEN_TTL}"
      TERMINAL_COOKIE_SECURE: "${DEFAULT_COOKIE_SECURE}"
      NODE_ENV: "development"
      TERMINAL_SSH_TARGET: "${SSH_TARGET}"
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

# 既存 .env があれば基本は尊重。
if [[ "$token_source" == "generated" ]]; then

  cat >"$BASE_DIR/.env" <<ENV
AOI_TERMINALS_IMAGE_REPO=${IMAGE_REPO}
AOI_TERMINALS_TAG=${TAG}
TERMINAL_TOKEN=${TERMINAL_TOKEN}
TERMINAL_PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
ALLOWED_ORIGINS="${DEFAULT_ALLOWED_ORIGINS},${PUBLIC_ORIGIN}"
TERMINAL_LINK_TOKEN_TTL_SECONDS=${DEFAULT_LINK_TOKEN_TTL}
TERMINAL_COOKIE_SECURE=${DEFAULT_COOKIE_SECURE}
BACKEND_NODE_ENV=development
BASE_DIR=${BASE_DIR}
HOST_IP=${HOST_IP}
SSH_TARGET=${SSH_TARGET}
BACKEND_PORT=${BACKEND_PORT_DEFAULT}
FRONTEND_PORT=${FRONTEND_PORT_DEFAULT}
ENV
  echo "[aoi-terminals] 📝 Created new environment file: $BASE_DIR/.env"
else
  if [[ -n "${TERMINAL_TOKEN:-}" ]]; then
    token_source="provided"
    if grep -qE '^TERMINAL_TOKEN=' "$BASE_DIR/.env"; then
      sed -i "s/^TERMINAL_TOKEN=.*/TERMINAL_TOKEN=${TERMINAL_TOKEN}/" "$BASE_DIR/.env"
    else
      printf "\nTERMINAL_TOKEN=%s\n" "$TERMINAL_TOKEN" >>"$BASE_DIR/.env"
    fi
  fi

  # 既存 .env でも必要事項は常に最新の状態で更新・追記
  ensure_env_value "TERMINAL_PUBLIC_BASE_URL" "$PUBLIC_BASE_URL" "$BASE_DIR/.env"
  append_allowed_origin_if_missing "$PUBLIC_ORIGIN" "$BASE_DIR/.env"
  ensure_env_value "BASE_DIR" "$BASE_DIR" "$BASE_DIR/.env"
  ensure_env_value "HOST_IP" "$HOST_IP" "$BASE_DIR/.env"
  ensure_env_value "SSH_TARGET" "$SSH_TARGET" "$BASE_DIR/.env"
  ensure_env_value "BACKEND_PORT" "$BACKEND_PORT_DEFAULT" "$BASE_DIR/.env"
  ensure_env_value "FRONTEND_PORT" "$FRONTEND_PORT_DEFAULT" "$BASE_DIR/.env"
fi

# 5. 共通のスクリプトをダウンロード（start.sh と print-share-qr.sh）
# ---------------------------------------------------------
curl -fsSL "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/print-share-qr.sh" > "$BASE_DIR/print-share-qr.sh"
chmod +x "$BASE_DIR/print-share-qr.sh"

curl -fsSL "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/start-docker.sh" > "$BASE_DIR/start.sh"
chmod +x "$BASE_DIR/start.sh"

# 6. 起動処理の実行
# ---------------------------------------------------------
echo "---"
echo "[aoi-terminals] ✅ Installation complete!"
echo "Base Directory: $BASE_DIR"
echo "---"

# 開発環境の start.sh と同じ体験にするため、インストール直後に自動で起動する
echo "🚀 Automatically starting for the first time..."
# パイプ実行時でも入力を奪われないように /dev/null をリダイレクト
bash "$BASE_DIR/start.sh" < /dev/null

echo ""
echo "💡 To restart the system later, run:"
echo "   bash $BASE_DIR/start.sh"
echo ""
