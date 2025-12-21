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
# NOTE: TailscaleはWindows側にのみインストール（WSL2側には入れない）
if [[ -z "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
    # Windows側のTailscale exeを検索
    TAILSCALE_CMD=""
    if command -v tailscale.exe &> /dev/null; then
        TAILSCALE_CMD="tailscale.exe"
    elif [[ -f "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
        TAILSCALE_CMD="/mnt/c/Program Files/Tailscale/tailscale.exe"
    fi

    if [[ -n "$TAILSCALE_CMD" ]]; then
        TS_IP="$("$TAILSCALE_CMD" ip -4 2>/dev/null | tr -d '\r' | head -n 1 || true)"
        if [[ -n "$TS_IP" ]]; then
            export TERMINAL_PUBLIC_BASE_URL="http://${TS_IP}:3101"
        fi
    fi
fi


# Tailscale越しアクセス時にCORS/WS Originで弾かれないよう、許可Originを自動設定（未指定時）
# NOTE: backendはcredentials(cookie)を使うため、ワイルドカードは不可。実際に使うOriginだけ許可する。
if [[ -z "${ALLOWED_ORIGINS:-}" ]]; then
    ALLOWED_ORIGINS="http://localhost:3101,http://127.0.0.1:3101"
    if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
        # 末尾のスラッシュを落としてOriginとして扱う
        PUBLIC_ORIGIN="${TERMINAL_PUBLIC_BASE_URL%/}"
        ALLOWED_ORIGINS="${ALLOWED_ORIGINS},${PUBLIC_ORIGIN}"
    fi
    export ALLOWED_ORIGINS
fi

# Windows Port Forwarding Setup (Tailscale経由アクセス用)
if [[ -n "${TERMINAL_PUBLIC_BASE_URL:-}" ]]; then
    WSL_IP=$(hostname -I | awk '{print $1}')
    echo "🔧 Setting up Windows port forwarding..."
    echo "   WSL2 IP: $WSL_IP"
    echo "   Tailscale IP: $(echo $TERMINAL_PUBLIC_BASE_URL | sed 's|http://||' | cut -d: -f1)"

    # PowerShellスクリプトを管理者権限で実行（UACプロンプト表示）
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    SCRIPT_PATH_WIN=$(wslpath -w "$SCRIPT_DIR/setup-port-forwarding.ps1")
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
