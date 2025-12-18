#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals "one command" installer for Docker.
#
# 使い方例（このスクリプトを raw.githubusercontent.com で配る想定）:
#   curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/install-docker.sh \
#     | AOI_TERMINALS_IMAGE_REPO=ghcr.io/<OWNER>/<REPO> TERMINAL_TOKEN=your_token bash
#
# NOTE:
# - ここでは GHCR 上のビルド済みイメージを pull して起動する（ビルド不要）。
# - 設定は ~/.aoi-terminals/.env に保存される。

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

if ! command -v docker >/dev/null 2>&1; then
  echo "[aoi-terminals] docker が見つからへん。Dockerを入れてからもう一回やってな。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[aoi-terminals] docker compose が使えへん。Docker Compose v2 を有効にしてな。"
  exit 1
fi

IMAGE_REPO="${AOI_TERMINALS_IMAGE_REPO:-}"
if [[ -z "$IMAGE_REPO" ]]; then
  echo "[aoi-terminals] AOI_TERMINALS_IMAGE_REPO が未指定やで。例: ghcr.io/<OWNER>/<REPO>"
  exit 1
fi

TAG="${AOI_TERMINALS_TAG:-latest}"

BASE_DIR="${AOI_TERMINALS_DIR:-$HOME/.aoi-terminals}"
mkdir -p "$BASE_DIR"

cat >"$BASE_DIR/docker-compose.yml" <<'YAML'
services:
  backend:
    image: ${AOI_TERMINALS_IMAGE_REPO}-backend:${AOI_TERMINALS_TAG:-latest}
    ports:
      - "3102:3102"
    environment:
      PORT: "3102"
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3101,http://127.0.0.1:3101}
      TERMINAL_TOKEN: ${TERMINAL_TOKEN:-valid_token}
      TERMINAL_LINK_TOKEN_TTL_SECONDS: ${TERMINAL_LINK_TOKEN_TTL_SECONDS:-300}
      TERMINAL_COOKIE_SECURE: ${TERMINAL_COOKIE_SECURE:-0}
      NODE_ENV: ${BACKEND_NODE_ENV:-development}
    restart: unless-stopped

  frontend:
    image: ${AOI_TERMINALS_IMAGE_REPO}-frontend:${AOI_TERMINALS_TAG:-latest}
    depends_on:
      - backend
    ports:
      - "3101:3101"
    environment:
      NODE_ENV: production
    restart: unless-stopped
YAML

# 既存 .env があれば尊重。無ければ初期値を書く。
if [[ ! -f "$BASE_DIR/.env" ]]; then
  # 未指定ならランダム発行（テスト/緊急用のつもりでも、デフォルト固定は危ない）
  if [[ -z "${TERMINAL_TOKEN:-}" ]]; then
    TERMINAL_TOKEN="$(generate_terminal_token)"
  fi

  cat >"$BASE_DIR/.env" <<ENV
AOI_TERMINALS_IMAGE_REPO=${IMAGE_REPO}
AOI_TERMINALS_TAG=${TAG}
TERMINAL_TOKEN=${TERMINAL_TOKEN}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:3101,http://127.0.0.1:3101}
TERMINAL_LINK_TOKEN_TTL_SECONDS=${TERMINAL_LINK_TOKEN_TTL_SECONDS:-300}
TERMINAL_COOKIE_SECURE=${TERMINAL_COOKIE_SECURE:-0}
BACKEND_NODE_ENV=${BACKEND_NODE_ENV:-development}
ENV
fi

echo "[aoi-terminals] Starting containers in: $BASE_DIR"
docker compose --env-file "$BASE_DIR/.env" -f "$BASE_DIR/docker-compose.yml" pull
docker compose --env-file "$BASE_DIR/.env" -f "$BASE_DIR/docker-compose.yml" up -d

echo "---"
echo "[aoi-terminals] OK"
echo "URL: http://localhost:3101"
if [[ -n "${TERMINAL_TOKEN:-}" ]]; then
  echo "Login token (generated this run): ${TERMINAL_TOKEN}"
else
  echo "Login token: see ${BASE_DIR}/.env (TERMINAL_TOKEN=...)"
fi
echo "Stop: docker compose --env-file \"$BASE_DIR/.env\" -f \"$BASE_DIR/docker-compose.yml\" down"
echo "Logs: docker compose --env-file \"$BASE_DIR/.env\" -f \"$BASE_DIR/docker-compose.yml\" logs -f"
