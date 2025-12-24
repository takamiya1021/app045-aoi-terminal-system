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
  local port="${FRONTEND_PORT:-3101}"

  if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
    printf "%s" "${TERMINAL_PUBLIC_BASE_URL%/}"
    return 0
  fi

  # Tailscale前提: MagicDNS(hostname) -> Tailscale IPv4 の順で探す（取れなければ後段へ）
  if command -v tailscale >/dev/null 2>&1; then
    if command -v python3 >/dev/null 2>&1; then
      local dns_name=""
      dns_name="$(
        tailscale status --json 2>/dev/null | python3 - <<'PY'
import sys, json
try:
  j = json.load(sys.stdin)
  dns = (((j.get("Self") or {}).get("DNSName")) or "").rstrip(".")
  print(dns, end="")
except Exception:
  pass
PY
      )"
      if [[ -n "$dns_name" ]]; then
        printf "http://%s:%s" "$dns_name" "$port"
        return 0
      fi
    fi

    local ts_ip=""
    ts_ip="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
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

DEFAULT_IMAGE_REPO="ghcr.io/takamiya1021/app045-aoi-terminal-system"
IMAGE_REPO="${AOI_TERMINALS_IMAGE_REPO:-$DEFAULT_IMAGE_REPO}"
if [[ -z "${AOI_TERMINALS_IMAGE_REPO:-}" ]]; then
  echo "[aoi-terminals] AOI_TERMINALS_IMAGE_REPO 未指定やからデフォルト使うで: ${DEFAULT_IMAGE_REPO}"
fi

TAG="${AOI_TERMINALS_TAG:-latest}"

BASE_DIR="${AOI_TERMINALS_DIR:-$HOME/.aoi-terminals}"
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

cat >"$BASE_DIR/docker-compose.yml" <<'YAML'
services:
  backend:
    image: ${AOI_TERMINALS_IMAGE_REPO}-backend:${AOI_TERMINALS_TAG:-latest}
    ports:
      - "3102:3102"
    extra_hosts:
      - "host.docker.internal:${HOST_IP}"
    volumes:
      - "${BASE_DIR:-$HOME/.aoi-terminals}/.ssh/id_rsa:/app/ssh_key:ro"
    environment:
      PORT: "3102"
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3101,http://127.0.0.1:3101}
      TERMINAL_TOKEN: ${TERMINAL_TOKEN:-valid_token}
      TERMINAL_LINK_TOKEN_TTL_SECONDS: ${TERMINAL_LINK_TOKEN_TTL_SECONDS:-300}
      TERMINAL_COOKIE_SECURE: ${TERMINAL_COOKIE_SECURE:-0}
      NODE_ENV: ${BACKEND_NODE_ENV:-development}
      TERMINAL_SSH_TARGET: "${SSH_TARGET}"
      TERMINAL_SSH_KEY: "/app/ssh_key"
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
TERMINAL_PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-http://localhost:3101,http://127.0.0.1:3101,${PUBLIC_ORIGIN}}
TERMINAL_LINK_TOKEN_TTL_SECONDS=${TERMINAL_LINK_TOKEN_TTL_SECONDS:-300}
TERMINAL_COOKIE_SECURE=${TERMINAL_COOKIE_SECURE:-0}
BACKEND_NODE_ENV=${BACKEND_NODE_ENV:-development}
BASE_DIR=${BASE_DIR}
HOST_IP=${HOST_IP}
SSH_TARGET=${SSH_TARGET}
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

  # 既存 .env でも必要事項は常に最新の状態で更新・追記
  ensure_env_value "TERMINAL_PUBLIC_BASE_URL" "$PUBLIC_BASE_URL" "$BASE_DIR/.env"
  append_allowed_origin_if_missing "$PUBLIC_ORIGIN" "$BASE_DIR/.env"
  ensure_env_value "BASE_DIR" "$BASE_DIR" "$BASE_DIR/.env"
  ensure_env_value "HOST_IP" "$HOST_IP" "$BASE_DIR/.env"
  ensure_env_value "SSH_TARGET" "$SSH_TARGET" "$BASE_DIR/.env"
fi

# 共通のQR表示スクリプトをダウンロードして保存（start.sh と完全に同じものを使う）
curl -fsSL "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/print-share-qr.sh" > "$BASE_DIR/print-share-qr.sh"
chmod +x "$BASE_DIR/print-share-qr.sh"

# WSL2のポートフォワーディング設定（Tailscale経由アクセス用）
# localhost/127.0.0.1 以外のIPが検出された場合のみ実行
if [[ "$PUBLIC_BASE_URL" != http://localhost:* ]] && [[ "$PUBLIC_BASE_URL" != http://127.0.0.1:* ]]; then
  WSL_IP=$(hostname -I | awk '{print $1}')
  echo "[aoi-terminals] 🔧 Setting up Windows port forwarding..."
  echo "   WSL2 IP: $WSL_IP"
  echo "   Public URL: $PUBLIC_BASE_URL"

  # PowerShellスクリプトをダウンロード
  curl -fsSL "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/setup-port-forwarding.ps1" > "$BASE_DIR/setup-port-forwarding.ps1"

  # PowerShellスクリプトを管理者権限で実行（UACプロンプト表示）
  SCRIPT_PATH_WIN=$(wslpath -w "$BASE_DIR/setup-port-forwarding.ps1")
  powershell.exe -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"$SCRIPT_PATH_WIN\" -WSL_IP $WSL_IP' -Wait" 2>/dev/null

  if [[ $? -eq 0 ]]; then
    echo "   ✅ Port forwarding configured!"
  else
    echo "   ⚠️  Port forwarding setup skipped (requires admin approval)"
    echo "   💡 Tip: Run manually with admin PowerShell:"
    echo "      netsh interface portproxy add v4tov4 listenport=3101 listenaddress=0.0.0.0 connectport=3101 connectaddress=$WSL_IP"
    echo "      netsh interface portproxy add v4tov4 listenport=3102 listenaddress=0.0.0.0 connectport=3102 connectaddress=$WSL_IP"
  fi
  echo ""
fi

echo "[aoi-terminals] Starting containers in: $BASE_DIR"
(
  cd "$BASE_DIR"
  "${COMPOSE[@]}" pull
  "${COMPOSE[@]}" up -d
)

echo "---"
echo "[aoi-terminals] OK"

# 開発環境の start.sh と全く同じスクリプトを実行してQRを表示
"$BASE_DIR/print-share-qr.sh"

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
    echo "Waiting for backend to be ready to generate QR code..."
    deadline=$((SECONDS + 60))
    until curl -fsS "${BACKEND_HTTP}/health" >/dev/null 2>&1; do
      if (( SECONDS > deadline )); then
        echo "[aoi-terminals] share link: backend health timeout (skipped)"
        break
      fi
      sleep 1
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
          base_url="${TERMINAL_PUBLIC_BASE_URL:-}"
          if [[ -z "$base_url" ]]; then
            base_url="$(read_env_value "TERMINAL_PUBLIC_BASE_URL" "$BASE_DIR/.env" || true)"
          fi
          if [[ -z "$base_url" ]]; then
            base_url="$PUBLIC_BASE_URL"
          fi
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
            # qrencode が無い環境が普通やから、ホストへの追加インストール前提にしない。
            # ここでは “既にpull済みの frontend イメージ” を使って Node(qrcode) でQRをANSI出力する。
            if command -v docker >/dev/null 2>&1; then
              frontend_image="${IMAGE_REPO}-frontend:${TAG}"
              if docker run --rm --pull=never --network=none -e SHARE_URL="${share_url}" "${frontend_image}" \
                node -e "const QR=require('qrcode'); QR.toString(process.env.SHARE_URL,{type:'terminal'},(e,s)=>{if(e){process.exit(1)}; process.stdout.write(s)})" \
                2>/dev/null; then
                :
              else
                echo "(QR) qrencode not found (and docker QR fallback failed). Install to print QR in terminal:"
                echo "  sudo apt-get update && sudo apt-get install -y qrencode"
              fi
            else
              echo "(QR) qrencode not found. Install to print QR in terminal:"
              echo "  sudo apt-get update && sudo apt-get install -y qrencode"
            fi
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
