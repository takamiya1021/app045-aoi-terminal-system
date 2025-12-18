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

# 既存 .env があれば基本は尊重。明示で TERMINAL_TOKEN を渡した時だけ上書きする。
token_source="existing"
if [[ ! -f "$BASE_DIR/.env" ]]; then
  token_source="generated"
  # 未指定ならランダム発行（テスト/緊急用のつもりでも、デフォルト固定は危ない）
  if [[ -z "${TERMINAL_TOKEN:-}" ]]; then
    TERMINAL_TOKEN="$(generate_terminal_token)"
  else
    token_source="provided"
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
else
  if [[ -n "${TERMINAL_TOKEN:-}" ]]; then
    token_source="provided"
    if grep -qE '^TERMINAL_TOKEN=' "$BASE_DIR/.env"; then
      sed -i "s/^TERMINAL_TOKEN=.*/TERMINAL_TOKEN=${TERMINAL_TOKEN}/" "$BASE_DIR/.env"
    else
      printf "\nTERMINAL_TOKEN=%s\n" "$TERMINAL_TOKEN" >>"$BASE_DIR/.env"
    fi
  fi
fi

echo "[aoi-terminals] Starting containers in: $BASE_DIR"
(
  cd "$BASE_DIR"
  "${COMPOSE[@]}" pull
  "${COMPOSE[@]}" up -d
)

echo "---"
echo "[aoi-terminals] OK"
echo "URL: http://localhost:3101"
final_token="${TERMINAL_TOKEN:-}"
if [[ -z "$final_token" ]]; then
  final_token="$(read_env_value "TERMINAL_TOKEN" "$BASE_DIR/.env" || true)"
fi

if [[ -n "$final_token" ]]; then
  case "$token_source" in
    provided) echo "Login token (provided): ${final_token}" ;;
    generated) echo "Login token (generated): ${final_token}" ;;
    *) echo "Login token: ${final_token}" ;;
  esac
else
  echo "Login token: see ${BASE_DIR}/.env (TERMINAL_TOKEN=...)"
fi

# 可能なら“ワンタイム共有リンク”もCLIに出す（ブラウザを開かなくてもスマホに渡せる）
if [[ "${AOI_TERMINALS_PRINT_SHARE:-1}" != "0" ]] && [[ -n "$final_token" ]]; then
  if command -v curl >/dev/null 2>&1; then
    BACKEND_HTTP="http://127.0.0.1:3102"
    deadline=$((SECONDS + 20))
    until curl -fsS "${BACKEND_HTTP}/health" >/dev/null 2>&1; do
      if (( SECONDS > deadline )); then
        echo "[aoi-terminals] share link: backend health timeout (skipped)"
        break
      fi
      sleep 0.2
    done

    if curl -fsS "${BACKEND_HTTP}/health" >/dev/null 2>&1; then
      cookie_jar="$(mktemp)"
      cleanup_share() { rm -f "$cookie_jar"; }
      trap cleanup_share EXIT

      if curl -fsS -c "$cookie_jar" -H 'Content-Type: application/json' -d "{\"token\":\"${final_token}\"}" "${BACKEND_HTTP}/auth" >/dev/null 2>&1; then
        json="$(curl -fsS -b "$cookie_jar" -X POST "${BACKEND_HTTP}/link-token" 2>/dev/null || true)"
        one_time_token="$(printf "%s" "$json" | extract_json_string "token" || true)"
        expires_at="$(printf "%s" "$json" | sed -n 's/.*"expiresAt"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' | head -n 1 || true)"

        if [[ -n "$one_time_token" ]]; then
          base_url="${TERMINAL_PUBLIC_BASE_URL:-http://localhost:3101}"
          share_url="${base_url%/}/?token=${one_time_token}"
          echo "---"
          echo "Share URL (one-time):"
          echo "${share_url}"
          if [[ -n "${expires_at:-}" ]]; then
            echo "ExpiresAt(ms): ${expires_at}"
          fi
          if command -v qrencode >/dev/null 2>&1; then
            qrencode -t ANSIUTF8 "${share_url}"
          else
            echo "(QR) qrencode not found. Install to print QR in terminal:"
            echo "  sudo apt-get update && sudo apt-get install -y qrencode"
          fi
        else
          echo "[aoi-terminals] share link: could not get one-time token (skipped)"
        fi
      else
        echo "[aoi-terminals] share link: auth failed (skipped)"
      fi
    fi
  else
    echo "[aoi-terminals] share link: curl not found (skipped)"
  fi
fi

echo "Stop: (cd \"$BASE_DIR\" && ${COMPOSE_LABEL} down)"
echo "Logs: (cd \"$BASE_DIR\" && ${COMPOSE_LABEL} logs -f)"
