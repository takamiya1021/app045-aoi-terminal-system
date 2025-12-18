#!/bin/bash

# Improved Terminal System Start Script (tmux mode)

# tmuxがインストールされているか確認
if ! command -v tmux &> /dev/null; then
    echo "📦 Installing tmux..."
    sudo apt update && sudo apt install -y tmux
fi

# TERMINAL_TOKEN を毎回ランダム発行（未指定時）
if [[ -z "${TERMINAL_TOKEN:-}" ]]; then
    TERMINAL_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")"
    export TERMINAL_TOKEN
fi

# qrencode がなければ入れる（起動時にQRを出すため）
if ! command -v qrencode &> /dev/null; then
    echo "📦 Installing qrencode (for share QR)..."
    sudo apt update && sudo apt install -y qrencode
fi

# 既存のセッションがあれば終了
tmux kill-session -t terminal-system 2>/dev/null

# Tailscale前提: TERMINAL_PUBLIC_BASE_URL を自動決定（未指定時）
if [[ -z "${TERMINAL_PUBLIC_BASE_URL:-}" ]] && command -v tailscale &> /dev/null; then
    TS_DNS="$(tailscale status --json 2>/dev/null | node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(0,'utf8')); const n=j?.Self?.DNSName||''; process.stdout.write(String(n).replace(/\\.$/,''));" 2>/dev/null || true)"
    if [[ -n "$TS_DNS" ]]; then
        export TERMINAL_PUBLIC_BASE_URL="http://${TS_DNS}:3101"
    else
        TS_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
        if [[ -n "$TS_IP" ]]; then
            export TERMINAL_PUBLIC_BASE_URL="http://${TS_IP}:3101"
        fi
    fi
fi

# Tailscale越しアクセス時にCORS/WS Originで弾かれないよう、許可Originを自動設定（未指定時）
# NOTE: backendはcredentials(cookie)を使うため、ワイルドカードは不可。実際に使うOriginだけ許可する。
if [[ -z "${ALLOWED_ORIGINS:-}" ]]; then
    ALLOWED_ORIGINS="http://localhost:3101"
    if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
        # 末尾のスラッシュを落としてOriginとして扱う
        PUBLIC_ORIGIN="${TERMINAL_PUBLIC_BASE_URL%/}"
        ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${PUBLIC_ORIGIN}"
    fi
    export ALLOWED_ORIGINS
fi

# 新しいtmuxセッションを作成 (デタッチモード)
echo "🚀 Starting System in tmux session 'terminal-system'..."
tmux new-session -d -s terminal-system -n backend "cd backend && npm run build && TERMINAL_TOKEN=${TERMINAL_TOKEN} PORT=3102 ALLOWED_ORIGINS=${ALLOWED_ORIGINS} npm run start"
tmux new-window -t terminal-system:1 -n frontend "cd frontend && npm run dev -- --hostname 0.0.0.0 --port 3101"

echo "---"
echo "✅ System started in tmux!"
echo "Session name: terminal-system"
echo "  - Window 0: Backend (Port 3102)"
echo "  - Window 1: Frontend (Port 3101)"
echo "---"
echo "Open: http://localhost:3101/"
echo "Login token (auto-issued this run): ${TERMINAL_TOKEN}"
echo "Backend allowed origins: ${ALLOWED_ORIGINS}"
if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
    echo "TERMINAL_PUBLIC_BASE_URL (for QR): ${TERMINAL_PUBLIC_BASE_URL}"
else
    echo "Optional (recommended for QR): set TERMINAL_PUBLIC_BASE_URL to a reachable URL (e.g. Tailscale/LAN IP): http://<ip>:3101"
fi
echo "To view logs, run: tmux attach -t terminal-system"
echo "To exit attach mode, press: Ctrl+B, then D"

echo "---"
echo "🔗 Generating one-time share QR..."
TERMINAL_TOKEN="${TERMINAL_TOKEN}" ./scripts/print-share-qr.sh || true
