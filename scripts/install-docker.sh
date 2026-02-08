#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals v2 インストーラー
# WSLネイティブDocker + Tailscale（WSL上）前提
#
# 使い方:
#   curl -fsSL https://raw.githubusercontent.com/.../install-docker.sh | bash

# Rootユーザーチェック
if [[ $EUID -eq 0 ]]; then
   echo "❌ root では実行できません。一般ユーザーで実行してください。"
   exit 1
fi

# Dockerグループチェック
if ! id -nG "$USER" 2>/dev/null | grep -qw "docker"; then
  echo "⚠️ '$USER' が docker グループに所属していません。追加します..."
  if sudo usermod -aG docker "$USER"; then
    echo "✅ docker グループに追加しました。"
    echo "⚠️ WSLを再起動してから再実行してください。"
    exit 0
  else
    echo "❌ 追加に失敗しました。手動で実行: sudo usermod -aG docker $USER"
    exit 1
  fi
fi

# Docker確認
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker が見つかりません。先にDockerをインストールしてください。"
  exit 1
fi

COMPOSE=()
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "❌ docker compose が見つかりません。"
  exit 1
fi

# 設定値
GHCR_REPO="ghcr.io/takamiya1021/app045-aoi-terminal-system"
TAG="latest"
INSTALL_DIR="$HOME/.aoi-terminals"
FRONTEND_PORT="3101"
BACKEND_PORT="3102"

mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/.ssh"

# SSH鍵の生成（初回のみ）
SSH_KEY="$INSTALL_DIR/.ssh/id_rsa"
if [[ ! -f "$SSH_KEY" ]]; then
  echo "🔑 SSH鍵を生成..."
  ssh-keygen -t rsa -b 4096 -f "$SSH_KEY" -N "" -C "aoi-terminals-bridge" </dev/null
fi
if [[ ! -f "${SSH_KEY}.pub" ]]; then
  ssh-keygen -y -f "$SSH_KEY" </dev/null > "${SSH_KEY}.pub"
fi
chmod 600 "$SSH_KEY"
chmod 644 "${SSH_KEY}.pub"

# authorized_keysに登録
echo "[aoi-terminals] 🔑 SSH鍵を登録..."
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
PUB_KEY=$(cat "${SSH_KEY}.pub")
grep -v "aoi-terminals-bridge" "$HOME/.ssh/authorized_keys" 2>/dev/null > "$HOME/.ssh/authorized_keys.tmp" || true
echo "$PUB_KEY" >> "$HOME/.ssh/authorized_keys.tmp"
mv "$HOME/.ssh/authorized_keys.tmp" "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"

# Tailscale IP検出（WSL上）
detect_public_url() {
  if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
    printf "%s" "${TERMINAL_PUBLIC_BASE_URL%/}"
    return
  fi
  if command -v tailscale >/dev/null 2>&1; then
    local ts_ip
    ts_ip="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
    if [[ -n "$ts_ip" ]]; then
      printf "http://%s:%s" "$ts_ip" "$FRONTEND_PORT"
      return
    fi
  fi
  printf "http://localhost:%s" "$FRONTEND_PORT"
}

# トークン生成
generate_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n' | tr '+/' '-_' | tr -d '='
  else
    dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '='
  fi
}

# 既存トークンの保持 or 新規生成
if [[ -n "${TERMINAL_TOKEN:-}" ]]; then
  TOKEN="$TERMINAL_TOKEN"
elif [[ -f "$INSTALL_DIR/.env" ]]; then
  TOKEN="$(grep -E '^TERMINAL_TOKEN=' "$INSTALL_DIR/.env" | tail -1 | cut -d'=' -f2- | tr -d '"' || true)"
fi
if [[ -z "${TOKEN:-}" ]]; then
  TOKEN="$(generate_token)"
fi

PUBLIC_URL="$(detect_public_url)"
PUBLIC_ORIGIN="${PUBLIC_URL%/}"
CURRENT_USER=$(whoami)

# docker-compose.yml 生成（v2: network_mode: host、ローカルイメージ名）
cat >"$INSTALL_DIR/docker-compose.yml" <<'YAML'
services:
  backend:
    image: aoi-terminals-backend:latest
    network_mode: "host"
    volumes:
      - "${BASE_DIR}/.ssh/id_rsa:/app/ssh_key:ro"
    environment:
      PORT: "${BACKEND_PORT}"
      ALLOWED_ORIGINS: "${ALLOWED_ORIGINS}"
      TERMINAL_TOKEN: "${TERMINAL_TOKEN}"
      TERMINAL_LINK_TOKEN_TTL_SECONDS: "${TERMINAL_LINK_TOKEN_TTL_SECONDS}"
      TERMINAL_COOKIE_SECURE: "${TERMINAL_COOKIE_SECURE}"
      NODE_ENV: "${BACKEND_NODE_ENV}"
      TERMINAL_SSH_TARGET: "${SSH_TARGET}"
      TERMINAL_SSH_KEY: "/app/ssh_key"
    restart: unless-stopped

  frontend:
    image: aoi-terminals-frontend:latest
    network_mode: "host"
    depends_on:
      - backend
    restart: unless-stopped
YAML

# .env 生成
cat >"$INSTALL_DIR/.env" <<ENV
TERMINAL_TOKEN="${TOKEN}"
TERMINAL_PUBLIC_BASE_URL="${PUBLIC_URL}"
ALLOWED_ORIGINS="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT},${PUBLIC_ORIGIN}"
TERMINAL_LINK_TOKEN_TTL_SECONDS="300"
TERMINAL_COOKIE_SECURE="0"
BACKEND_NODE_ENV="production"
BACKEND_PORT="${BACKEND_PORT}"
FRONTEND_PORT="${FRONTEND_PORT}"
BASE_DIR="${INSTALL_DIR}"
SSH_TARGET="${CURRENT_USER}@localhost"
ENV

# スクリプト配置
# ローカルリポジトリから実行された場合はコピー、そうでなければGitHubからダウンロード
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
if [[ -n "$SCRIPT_DIR" ]] && [[ -f "$SCRIPT_DIR/print-share-qr.sh" ]] && [[ -f "$SCRIPT_DIR/production-cli.sh" ]]; then
  echo "[aoi-terminals] 📁 ローカルリポジトリからスクリプトをコピー..."
  cp "$SCRIPT_DIR/print-share-qr.sh" "$INSTALL_DIR/print-share-qr.sh"
  cp "$SCRIPT_DIR/production-cli.sh" "$INSTALL_DIR/aoi-terminals"
else
  echo "[aoi-terminals] 📥 GitHubからスクリプトをダウンロード..."
  REPO_RAW="https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts"
  curl -fsSL "$REPO_RAW/print-share-qr.sh" > "$INSTALL_DIR/print-share-qr.sh"
  curl -fsSL "$REPO_RAW/production-cli.sh" > "$INSTALL_DIR/aoi-terminals"
fi
chmod +x "$INSTALL_DIR/print-share-qr.sh" "$INSTALL_DIR/aoi-terminals"

# Dockerイメージ: ローカルビルド済みがあればそのまま使用、なければGHCRから取得
if docker image inspect "aoi-terminals-backend:latest" >/dev/null 2>&1 && \
   docker image inspect "aoi-terminals-frontend:latest" >/dev/null 2>&1; then
  echo "[aoi-terminals] ✅ ローカルビルド済みイメージを使用"
else
  echo "[aoi-terminals] 📥 GHCRからDockerイメージを取得..."
  docker pull "${GHCR_REPO}-backend:${TAG}"
  docker pull "${GHCR_REPO}-frontend:${TAG}"
  docker tag "${GHCR_REPO}-backend:${TAG}" "aoi-terminals-backend:latest"
  docker tag "${GHCR_REPO}-frontend:${TAG}" "aoi-terminals-frontend:latest"
fi

echo ""
echo "✅ インストール完了！"
echo "---"
echo "📁 インストール先: $INSTALL_DIR"
echo ""
echo "起動: $INSTALL_DIR/aoi-terminals start"
echo "停止: $INSTALL_DIR/aoi-terminals stop"
echo ""
