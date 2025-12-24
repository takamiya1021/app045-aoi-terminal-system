<div align="center">

# Aoi-Terminals

**Androidスマホ・タブレットからでも「普段のターミナル」をそのまま扱える、Webベースのリモートターミナル**

[![Next.js][Next-shield]][Next-url]
[![React][React-shield]][React-url]
[![TypeScript][TypeScript-shield]][TypeScript-url]
[![Node.js][Node-shield]][Node-url]
[![Docker][Docker-shield]][Docker-url]
[![GitHub Actions][Actions-shield]][Actions-url]
[![License][License-shield]][License-url]

[デモを見る](#デモ) · [バグ報告](https://github.com/takamiya1021/app045-aoi-terminal-system/issues) · [機能リクエスト](https://github.com/takamiya1021/app045-aoi-terminal-system/issues)

</div>

---

## 📑 目次

- [概要](#概要)
  - [主な機能](#主な機能)
- [🚀 本番環境（プロダクション・運用）](#-本番環境プロダクション運用)
  - [前提条件](#前提条件)
  - [1. 最短起動（GHCR・推奨）](#1-最短起動ghcr推奨)
  - [2. Docker Composeで起動](#2-docker-composeで起動)
  - [使い方・運用手順](#使い方運用手順)
- [🛠️ 開発環境（デバッグ・カスタマイズ）](#️-開発環境デバッグカスタマイズ)
  - [前提条件](#前提条件-1)
  - [セットアップと起動](#セットアップと起動)
- [詳細仕様](#詳細仕様)
  - [認証・セッション](#認証セッション)
  - [環境設定](#環境設定)
- [謝辞](#謝辞)

---

## 概要

Aoi-Terminalsは、Androidスマホ・タブレットから快適にターミナル操作ができるWebベースのリモートターミナルシステムです。Tailscaleなどのプライベートネットワーク越しに、ワンタイム共有リンク（QR）で安全に接続できます。

### 主な機能

- 📱 **モバイル最適**: 日本語IMEに強く、Androidでも入力しやすい設計
- 🧩 **tmux操作UI**: 分割・切替などをボタンで操作（タッチ前提でも迷いにくい）
- 🔗 **ワンタイムQRログイン**: セキュリティのため、リンクは5分間のみ有効
- 🔐 **セキュア認証**: ランダムトークン自動生成、HTTPSでのCookie Secure対応
- 🎨 **モダンUI**: Claude Code on the Web風のクリーンなデザイン
- 📺 **全画面モード**: ボタン一発で没入感のある操作が可能

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## 🚀 本番環境（プロダクション・運用）

一般ユーザーの方や、安定して運用したい方向けの設定です。Dockerを使用します。

### 前提条件

1. **Docker**: [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) または WSL上のDockerが動作していること
3. **一般ユーザー**: `root` ではなく、標準の一般ユーザーで実行すること

### 1. 最短起動（GHCR・推奨）

ビルド不要で、1コマンドで全自動セットアップし、起動用CLIをご利用の環境へ導入します。

```bash
# インストーラーを実行 (インストールのみ完了します)
curl -L "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/install-docker.sh?v=$(date +%s)" | bash
```

> [!TIP]
> **更新方法**: 最新版に更新したい場合は、同じコマンドを再実行するだけでOKです。

### 2. 使い方・運用手順

インストール完了後は、専用のCLIツール `aoi-terminals` が使用可能になります。

1. **システムの起動**: ターミナルで `aoi-terminals start` を実行。コンテナが立ち上がり、QRコードが表示されます。
2. **情報の確認**: `aoi-terminals info` で現在のログインURL（トークン付き）を確認できます。
3. **モバイル接続**: 表示されたQRをスマホで読み取れば、24時間有効なセッションが開始されます。
4. **ホスト連携**: プロンプトが `ustar-wsl-2-2@STAR` のように表示され、WSLホストを直接操作できます。
5. **システムの停止**: `aoi-terminals stop` で全コンテナを安全に停止します。

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## 🛠️ 開発環境（デバッグ・カスタマイズ）

本システムの開発や、直接Node.jsを叩いて挙動を確認したい方向けの設定です。

### 前提条件

- **Node.js**: v20.0.0 以上
- **npm**: 最新版推奨
- **tmux**: インストール済みであること (`sudo apt install tmux`)
- **node-pty依存**: ビルド用に `python3`, `make`, `g++` が必要

### セットアップと起動

1. **リポジトリの準備**
   ```sh
   git clone https://github.com/takamiya1021/app045-aoi-terminal-system.git
   cd app045-aoi-terminal-system
   ```

2. **依存関係のインストールとビルド**
   ```sh
   npm run setup
   ```

3. **開発モードで起動**
   ```sh
   # バックエンド・フロントエンドをtmuxセッションで一括起動
   ./scripts/start.sh
   ```

4. **停止とログ確認**
   - **停止**: `./scripts/stop.sh`
   - **ログ**: `tmux attach -t terminal-system`

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## 詳細仕様

### 認証・セッション

| トークン体系 | 再利用 | 有効期間 | 用途 |
| :--- | :--- | :--- | :--- |
| **オーナー用** | **可能** | **24時間** | 自分用のメインアクセス。 |
| **シェア用** | **不可** | **6時間** | 他人・他端末への一時的な共有用。 |

- **リンク有効期限**: QRコード/URL自体の寿命は **5分間** です。

### 環境設定

主要な環境変数（`.env`ファイル）:

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `TERMINAL_TOKEN` | ログイン用トークン | 自動生成 |
| `ALLOWED_ORIGINS` | 許可するOrigin | `http://localhost:3101` |
| `TERMINAL_SSH_TARGET` | ブリッジ先ホスト | (Docker時必須) |

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## 謝辞

* **じぇみ（Gemini CLI）** - 創発的アイデアと実装のリード
* **クロ（Claude CLI）** - 堅実な実装と全体設計のサポート
* **チャッピー（Codex CLI）** - 精密な技術分析とデバッグのサポート

---
あおいさん - [@takamiya1021](https://github.com/takamiya1021)
