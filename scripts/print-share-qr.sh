#!/bin/bash

set -euo pipefail

# 起動直後に “共有リンク(ワンタイムトークン)” を発行して、ターミナルにURLとQRを出す。
# 前提:
# - backend が 3102 で起動している
# - TERMINAL_TOKEN が設定されている（start.sh が dev default を入れる）
#
# 重要:
# - QRのURLはスマホ等から到達できる必要があるため、可能なら TERMINAL_PUBLIC_BASE_URL を設定する。
#   例: http://192.168.1.10:3101  /  http://100.x.x.x:3101(Tailscale)

BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-3102}"
BACKEND_HTTP="http://${BACKEND_HOST}:${BACKEND_PORT}"
FRONTEND_PORT="${FRONTEND_PORT:-3101}"

ORIGIN_HEADER="${ORIGIN_HEADER:-http://localhost:${FRONTEND_PORT}}"

if [[ -z "${TERMINAL_TOKEN:-}" ]]; then
  echo "[share-qr] TERMINAL_TOKEN is not set. Cannot auto-generate share link."
  exit 1
fi

BASE_URL="${TERMINAL_PUBLIC_BASE_URL:-}"
if [[ -z "$BASE_URL" ]]; then
  # Tailscale 前提: MagicDNS(hostname) -> Tailscale IPv4 -> WSL内IP -> localhost の順で決める
  if command -v tailscale >/dev/null 2>&1; then
    dns_name="$(
      tailscale status --json 2>/dev/null \
        | node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); const n=j?.Self?.DNSName||''; process.stdout.write(String(n).replace(/\\.$/,''));" \
        2>/dev/null || true
    )"
    if [[ -n "$dns_name" ]]; then
      BASE_URL="http://${dns_name}:${FRONTEND_PORT}"
    else
      ts_ip="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
      if [[ -n "$ts_ip" ]]; then
        BASE_URL="http://${ts_ip}:${FRONTEND_PORT}"
      fi
    fi
  fi

  if [[ -z "$BASE_URL" ]]; then
    # ベストエフォート: WSL内IPを拾う（スマホから見える保証はない）
    ip_guess="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [[ -n "$ip_guess" ]]; then
      BASE_URL="http://${ip_guess}:${FRONTEND_PORT}"
    else
      BASE_URL="http://localhost:${FRONTEND_PORT}"
    fi
  fi
fi

echo "[share-qr] Waiting for backend health: ${BACKEND_HTTP}/health"
deadline=$((SECONDS + 20))
until curl -fsS "${BACKEND_HTTP}/health" >/dev/null 2>&1; do
  if (( SECONDS > deadline )); then
    echo "[share-qr] Backend health check timed out."
    exit 1
  fi
  sleep 0.2
done

cookie_jar="$(mktemp)"
cleanup() { rm -f "$cookie_jar"; }
trap cleanup EXIT

echo "[share-qr] Authenticating to backend (cookie session)..."
curl -fsS -c "$cookie_jar" \
  -H "Origin: ${ORIGIN_HEADER}" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"${TERMINAL_TOKEN}\"}" \
  "${BACKEND_HTTP}/auth" >/dev/null

echo "[share-qr] Requesting one-time link token..."
json="$(
  curl -fsS -b "$cookie_jar" \
    -H "Origin: ${ORIGIN_HEADER}" \
    -X POST "${BACKEND_HTTP}/link-token"
)"

url="$(
  BASE_URL="$BASE_URL" node -e "const j=JSON.parse(process.argv[1]); const base=process.env.BASE_URL; if(!j||!j.ok||!j.token){process.exit(2)}; process.stdout.write(base+'/?token='+encodeURIComponent(String(j.token)));" \
    "$json"
)"

expires_at="$(
  node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.expiresAt||''));" \
    "$json" 2>/dev/null || true
)"

echo "---"
echo "[share-qr] Share URL (one-time):"
echo "$url"
if [[ -n "$expires_at" ]]; then
  echo "[share-qr] ExpiresAt(ms): $expires_at"
fi
echo "---"

if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$url"
else
  echo "[share-qr] qrencode not found. Install to print QR in terminal:"
  echo "  sudo apt-get update && sudo apt-get install -y qrencode"
fi
