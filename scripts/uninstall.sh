#!/usr/bin/env bash
set -euo pipefail

# Aoi-Terminals Uninstaller
# ---------------------------------------------------------

BASE_DIR="$HOME/.aoi-terminals"
IMAGE_REPO="ghcr.io/takamiya1021/app045-aoi-terminal-system"

echo "========================================"
echo "  Aoi-Terminals アンインストーラー"
echo "========================================"
echo ""

# インストールされているか確認
if [[ ! -d "$BASE_DIR" ]]; then
  echo "❌ Aoi-Terminals はインストールされていません。"
  echo "   ($BASE_DIR が見つかりません)"
  exit 0
fi

echo "以下を削除します："
echo "  - Dockerコンテナ (aoi-terminals-backend, aoi-terminals-frontend)"
echo "  - 設定ディレクトリ ($BASE_DIR)"
echo "  - SSH authorized_keys から aoi-terminals-bridge 鍵"
echo ""

# 確認プロンプト
read -p "本当にアンインストールしますか？ [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "キャンセルしました。"
  exit 0
fi

echo ""

# 1. Dockerコンテナを停止・削除
echo "[1/4] Dockerコンテナを停止中..."
if [[ -f "$BASE_DIR/docker-compose.yml" ]]; then
  (
    cd "$BASE_DIR"
    if docker compose version >/dev/null 2>&1; then
      docker compose down --remove-orphans 2>/dev/null || true
    elif command -v docker-compose >/dev/null 2>&1; then
      docker-compose down --remove-orphans 2>/dev/null || true
    fi
  )
  echo "   ✅ コンテナを停止しました"
else
  echo "   ⏭️  docker-compose.yml が見つかりません（スキップ）"
fi

# 2. Dockerイメージを削除するか確認
echo ""
read -p "[2/4] Dockerイメージも削除しますか？ [y/N]: " remove_images
if [[ "$remove_images" =~ ^[Yy]$ ]]; then
  echo "   Dockerイメージを削除中..."
  docker rmi "${IMAGE_REPO}-backend:latest" 2>/dev/null || true
  docker rmi "${IMAGE_REPO}-frontend:latest" 2>/dev/null || true
  echo "   ✅ Dockerイメージを削除しました"
else
  echo "   ⏭️  Dockerイメージは保持します"
fi

# 3. authorized_keys から aoi-terminals-bridge 鍵を削除
echo ""
echo "[3/4] SSH authorized_keys から鍵を削除中..."
if [[ -f "$HOME/.ssh/authorized_keys" ]]; then
  if grep -q "aoi-terminals-bridge" "$HOME/.ssh/authorized_keys"; then
    grep -v "aoi-terminals-bridge" "$HOME/.ssh/authorized_keys" > "$HOME/.ssh/authorized_keys.tmp" || true
    mv "$HOME/.ssh/authorized_keys.tmp" "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    echo "   ✅ SSH鍵を削除しました"
  else
    echo "   ⏭️  aoi-terminals-bridge 鍵は登録されていません"
  fi
else
  echo "   ⏭️  authorized_keys が見つかりません"
fi

# 4. 設定ディレクトリを削除
echo ""
echo "[4/4] 設定ディレクトリを削除中..."
rm -rf "$BASE_DIR"
echo "   ✅ $BASE_DIR を削除しました"

echo ""
echo "========================================"
echo "  ✅ アンインストール完了！"
echo "========================================"
echo ""
echo "💡 注意: SSHサーバーは手動で停止してください："
echo "   sudo service ssh stop"
echo ""
