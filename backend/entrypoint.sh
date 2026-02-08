#!/bin/bash
set -e

# SSH秘密鍵のUID互換性チェック
# ホスト側のSSH鍵のUIDとコンテナ内のUIDが異なる場合、
# コンテナ内にコピーして正しいパーミッション（600）を設定する

if [ -f "/app/ssh_key" ]; then
  # ホスト側のSSH鍵の所有者UIDを取得
  SSH_KEY_UID=$(stat -c '%u' /app/ssh_key)
  # コンテナ内の現在のUID（nodeユーザー = 1000）
  CONTAINER_UID=$(id -u)

  if [ "$SSH_KEY_UID" -eq "$CONTAINER_UID" ]; then
    # UIDが同じ場合：そのまま使用（何もしない）
    echo "[entrypoint] SSH key UID matches container UID ($CONTAINER_UID) - using directly"
  else
    # UIDが異なる場合：コンテナ内にコピーして権限設定
    echo "[entrypoint] SSH key UID ($SSH_KEY_UID) differs from container UID ($CONTAINER_UID)"
    echo "[entrypoint] Copying SSH key to /tmp with correct permissions..."
    cp /app/ssh_key /tmp/ssh_key
    chmod 600 /tmp/ssh_key
    export TERMINAL_SSH_KEY=/tmp/ssh_key
    echo "[entrypoint] SSH key prepared at /tmp/ssh_key"
  fi
fi

# メインプロセス起動
exec node dist/server.js
