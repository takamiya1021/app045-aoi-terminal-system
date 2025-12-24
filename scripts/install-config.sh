#!/usr/bin/env bash
# Aoi-Terminals Docker Installer Configuration
# ---------------------------------------------------------
# このファイルを書き換えることで、インストーラーのデフォルト動作を変更できます。

# 1. 取得元のリポジトリ（Dockerイメージのビルド済み倉庫）
# デフォルト: takamiya1021 の公式リポジトリ
DEFAULT_IMAGE_REPO="ghcr.io/takamiya1021/app045-aoi-terminal-system"

# 2. イメージのタグ（バージョン）
DEFAULT_TAG="latest"

# 3. デフォルトのポート番号
FRONTEND_PORT_DEFAULT="3101"
BACKEND_PORT_DEFAULT="3102"

# 3. セキュリティ・有効期限設定
DEFAULT_LINK_TOKEN_TTL="300" # 5分
DEFAULT_COOKIE_SECURE="0"    # HTTP環境（WSL/Tailscale）を考慮してデフォルトはOFF

# 4. インストール先のディレクトリ
DEFAULT_INSTALL_DIR="$HOME/.aoi-terminals"
