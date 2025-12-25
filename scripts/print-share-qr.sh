#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals: QRコード表示スクリプト
# バックエンドから一時トークン（5分有効）を取得して、QRコードを表示します。

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-3102}"
BACKEND_HTTP="http://${BACKEND_HOST}:${BACKEND_PORT}"
FRONTEND_PORT="${FRONTEND_PORT:-3101}"
ORIGIN_HEADER="${ORIGIN_HEADER:-http://localhost:${FRONTEND_PORT}}"

# JSONから値を抜き出す軽量関数（node/jq がなくても動くように）
extract_json_string() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

if [[ -z "${TERMINAL_TOKEN:-}" ]]; then
  # .env があればそこから読み込む（Docker環境用）
  ENV_FILE="$(dirname "$0")/.env"
  if [[ -f "$ENV_FILE" ]]; then
    TERMINAL_TOKEN="$(grep -E "^TERMINAL_TOKEN=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' || true)"
    TERMINAL_PUBLIC_BASE_URL="$(grep -E "^TERMINAL_PUBLIC_BASE_URL=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' || true)"
    IMAGE_REPO="$(grep -E "^AOI_TERMINALS_IMAGE_REPO=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' || true)"
    TAG="$(grep -E "^AOI_TERMINALS_TAG=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' || true)"
    # ポート設定もあれば読み込む
    BACKEND_PORT="$(grep -E "^BACKEND_PORT=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' || true)"
    FRONTEND_PORT="$(grep -E "^FRONTEND_PORT=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' || true)"
  fi
fi

if [[ -z "${TERMINAL_TOKEN:-}" ]]; then
  echo "[share-qr] TERMINAL_TOKEN が設定されていません。"
  exit 1
fi

BASE_URL="${TERMINAL_PUBLIC_BASE_URL:-}"
if [[ -z "$BASE_URL" ]]; then
  # 以前のロジックでベストエフォートに取得
  ts_ip=""
  
  # 1. Try Windows Tailscale first
  if command -v tailscale.exe >/dev/null 2>&1; then
    ts_ip=$(tailscale.exe ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)
  fi
  
  if [[ -z "$ts_ip" ]] && [[ -f "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
    ts_ip=$("/mnt/c/Program Files/Tailscale/tailscale.exe" ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)
  fi



  if [[ -n "$ts_ip" ]]; then
    BASE_URL="http://${ts_ip}:${FRONTEND_PORT}"
  else
    echo "[share-qr] ℹ️ Windows側でTailscaleのIPが取得できませんでした。" >&2
    echo "[share-qr]    (外部から接続するには、WindowsにTailscaleをインストールすることをお勧めします)" >&2
  fi
  
  if [[ -z "$BASE_URL" ]]; then
    ip_guess="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [[ -n "$ip_guess" ]]; then
      BASE_URL="http://${ip_guess}:${FRONTEND_PORT}"
    else
      BASE_URL="http://localhost:${FRONTEND_PORT}"
    fi
  fi
fi

# バックエンドの準備ができるまで待つ（少し長めに）
deadline=$((SECONDS + 60))
until curl -fsS "${BACKEND_HTTP}/health" >/dev/null 2>&1; do
  if (( SECONDS > deadline )); then
    echo "[share-qr] サーバーの起動待ちがタイムアウトしました。"
    exit 1
  fi
  sleep 1
done

# トークン取得
cookie_jar="$(mktemp)"
cleanup() { rm -f "$cookie_jar"; }
trap cleanup EXIT

if curl -fsS -c "$cookie_jar" -H "Origin: ${ORIGIN_HEADER}" -H 'Content-Type: application/json' -d "{\"token\":\"${TERMINAL_TOKEN}\"}" "${BACKEND_HTTP}/auth" >/dev/null 2>&1; then
  json="$(curl -fsS -b "$cookie_jar" -H "Origin: ${ORIGIN_HEADER}" -X POST "${BACKEND_HTTP}/link-token" 2>/dev/null || true)"
  one_time_token="$(printf "%s" "$json" | extract_json_string "token" || true)"

  if [[ -n "$one_time_token" ]]; then
    URL="${BASE_URL%/}/?token=${one_time_token}"
    echo "---"
    echo "📱 Aoi-Terminals Login URL (One-Time / 5min):"
    echo "$URL"
    echo "---"

    if command -v qrencode >/dev/null 2>&1; then
      # -t UTF8 でハーフブロック文字を使用し、-m 2 で余白を削ってコンパクトにする
      qrencode -t UTF8 -m 2 "$URL"
    else
      # qrencodeがない場合はDocker経由で表示
      # 本番イメージ名に合わせて -frontend を付与
      IMAGE="${IMAGE_REPO:-ghcr.io/takamiya1021/app045-aoi-terminal-system}-frontend:${TAG:-latest}"
      if command -v docker >/dev/null 2>&1; then
        docker run --rm --pull=never --network=none -e URL="${URL}" "${IMAGE}" \
          node -e "require('qrcode').toString(process.env.URL,{type:'terminal',small:true,margin:2},(e,s)=>process.stdout.write(s))" 2>/dev/null || echo "qrencode をインストールしてください (sudo apt install qrencode)。"
      else
        echo "qrencode が見つかりません。"
      fi
    fi
  else
    echo "[share-qr] トークンの取得に失敗しました。"
  fi
else
  echo "[share-qr] 認証に失敗しました。"
fi