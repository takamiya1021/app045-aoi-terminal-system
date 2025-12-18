# Aoi-Terminals

[![Node.js](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)](#)
[![Next.js](https://img.shields.io/badge/next.js-14-black?logo=next.js&logoColor=white)](#)

iPhone/iPadからでも「普段のターミナル」をそのまま扱える、Webベースのリモートターミナルです。  
Tailscaleなどのプライベートネットワーク越しに、ワンタイム共有リンク（QR）で安全に接続できます。

## デモURL

- TBD（ローカル起動: `http://localhost:3101`）

## スクショ

- TBD（後で差し替え）

## Features

- 📱 **モバイル快適**: 日本語IMEに強く、iPhone/iPadでも入力しやすい設計
- 🧩 **tmux操作UI**: 分割・切替などをボタンで操作（タッチ前提でも迷いにくい）
- 🔗 **Share (QR)**: “1回だけ使える” トークン付きURLを発行して共有
- 🧷 **セッション維持**: Cookieセッションでログイン状態を保持
- 🧼 **シンプル起動**: ローカル開発 / Dockerのどちらでも起動可能

## 主要機能の説明（利用者目線）

- **接続**: 画面のトークン入力で接続、もしくは共有QRのURLで接続できます。
- **共有**: ログイン後に `Share (QR)` からワンタイムURLを発行できます（期限つき）。
- **操作**: 画面上のコントロールから tmux 操作や特殊キー入力ができます。

## 技術スタック（ざっくり）

- フロントエンド: Next.js 14 / React 18 / Tailwind CSS
- ターミナル: xterm.js
- バックエンド: Node.js / Express / WebSocket
- PTY: node-pty
- PWA: next-pwa

## セットアップ

### 前提条件

- Docker（推奨）: Docker Desktop もしくは Docker Engine + Compose
- Dockerを使わない場合: Node.js 20+ / npm / tmux

### 最短起動（npmみたいに1コマンド）

GitHub Container Registry（GHCR）に公開した「ビルド済みイメージ」を pull して起動します（ローカルビルド不要）。

```bash
curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/install-docker.sh \
  | bash
```

※ `TERMINAL_TOKEN` は未指定なら自動生成され、`~/.aoi-terminals/.env` に保存されます。任意のトークンを指定したい場合は `TERMINAL_TOKEN=...` を付けて実行してください。

### 手順（Docker推奨）

```bash
cp .env.docker.example .env
docker compose up -d --build
```

- 起動後URL: `http://localhost:3101`
- 停止:

```bash
docker compose down
```

ヘルスチェック込みで一発確認したい場合:

```bash
./scripts/smoke-docker.sh
```

### 手順（開発: tmuxで起動）

```bash
./scripts/start.sh
```

## テスト

```bash
npm test
```

既にサーバ起動済みなら、E2Eを既存サーバに対して実行できます。

```bash
cd frontend
npx playwright test --config playwright.config.existing.ts
```

## プロジェクト構造（必要最小限）

- `frontend`: Web UI（PWA含む）
- `backend`: WebSocket + PTY + 認証API
- `scripts`: 起動補助スクリプト
- `doc`: 要件/設計/実装計画

## その他

- **ワンタイム共有リンクの期限**: `TERMINAL_LINK_TOKEN_TTL_SECONDS`（未指定は5分）
- **スマホ/Tailscaleで繋がらない時**: `ALLOWED_ORIGINS` に「実際に開くURL（`http://<host>:3101`）」を必ず含めてください（Cookie利用のためワイルドカードは不可）
- **Cookie Secure**: `TERMINAL_COOKIE_SECURE=1` で強制ON（DockerなどHTTP運用なら `0` 推奨）

## ビルド & デプロイ

### Dockerイメージ配布（メンテナ向け）

- GitHub Actions が `main` push と `v*` タグで GHCR に publish します: `.github/workflows/publish-ghcr.yml`
- イメージ名:
  - `ghcr.io/<OWNER>/<REPO>-backend:latest`
  - `ghcr.io/<OWNER>/<REPO>-frontend:latest`

- Dockerでの配布・デプロイを想定しています（`docker compose up -d --build` または “最短起動”）。
- リバースプロキシ（TLS終端）配下に置く場合は、`ALLOWED_ORIGINS` とCookie設定を環境に合わせて調整してください。

## 開発ドキュメントリンク

- 要件定義: `doc/improved-terminal-system-requirements.md`
- 技術設計: `doc/improved-terminal-system-design.md`
- 実装計画: `doc/improved-terminal-system-implementation.md`

## コントリビューション案内

- Issue / PR歓迎です（再現手順、期待挙動、環境情報があると助かります）。

## ライセンス

- TBD

## 作者 & 謝辞

- 作者: あおいさん
- 謝辞: チャッピー（Codex CLI）
