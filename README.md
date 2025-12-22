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
  - [スクリーンショット](#スクリーンショット)
  - [主な機能](#主な機能)
  - [技術スタック](#技術スタック)
- [はじめに](#はじめに)
  - [前提条件](#前提条件)
  - [インストール](#インストール)
    - [最短起動（推奨）](#最短起動推奨)
    - [Docker Composeで起動](#docker-composeで起動)
    - [開発環境で起動](#開発環境で起動)
- [使い方](#使い方)
- [テスト](#テスト)
- [ロードマップ](#ロードマップ)
- [コントリビューション](#コントリビューション)
- [ライセンス](#ライセンス)
- [コンタクト](#コンタクト)
- [謝辞](#謝辞)

---

## 概要

Aoi-Terminalsは、Androidスマホ・タブレットから快適にターミナル操作ができるWebベースのリモートターミナルシステムです。Tailscaleなどのプライベートネットワーク越しに、ワンタイム共有リンク（QR）で安全に接続できます。

**なぜAoi-Terminalsが必要か？**

- 🚀 **モバイルファースト設計**: 従来のターミナルはPCでの利用を前提としており、スマホ・タブレットでは操作が困難でした
- 🔒 **セキュア共有**: ワンタイムQRコードで一時的なアクセスを安全に提供
- 🎯 **日本語IME完全対応**: モバイルでの日本語入力が快適に動作
- 📱 **PWA対応**: インストール可能で、アプリライクな体験を提供

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

### スクリーンショット

<div align="center">
  <img src="frontend/public/screenshot-main.png" alt="Aoi-Terminals メイン画面" width="800">
  <p><em>Androidスマホからターミナルにアクセスしている様子</em></p>

  <br/>

  <img src="frontend/public/screenshot-terminal.png" alt="Aoi-Terminals ターミナル操作画面" width="800">
  <p><em>ターミナル操作とtmuxコントロールの様子</em></p>
</div>

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

### 主な機能

- 📱 **モバイル快適**: 日本語IMEに強く、Androidでも入力しやすい設計
- 🧩 **tmux操作UI**: 分割・切替などをボタンで操作（タッチ前提でも迷いにくい）
- 🔗 **2種類のQRコード**:
  - **初回ログイン用**: 何度でも使える固定トークン（起動時に表示）
  - **Share (QR)**: 1回だけ使えるワンタイムリンク（ログイン後に発行、5分間有効）
- 🧷 **セッション維持**: Cookieセッションでログイン状態を保持（通常24時間、シェア用6時間）
- 🧼 **シンプル起動**: ローカル開発 / Dockerのどちらでも起動可能
- 🔐 **セキュア認証**: ランダムトークン自動生成、HTTPSでのCookie Secure対応
- 🎨 **モダンUI**: Claude Code on the Web風のクリーンなデザイン
- 🌐 **PWA対応**: オフライン対応、インストール可能、Service Worker強制更新機能

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

### 技術スタック

このプロジェクトは、以下の技術を使用して構築されています：

#### フロントエンド
* [![Next.js][Next-shield]][Next-url] - React フレームワーク（v14 App Router）
* [![React][React-shield]][React-url] - UI ライブラリ
* [![TypeScript][TypeScript-shield]][TypeScript-url] - 型安全な開発
* [![Tailwind CSS][Tailwind-shield]][Tailwind-url] - ユーティリティファーストCSS
* [![xterm.js][xterm-shield]][xterm-url] - ターミナルエミュレータ
* [![PWA][PWA-shield]][PWA-url] - next-pwa（Service Worker、オフライン対応）

#### バックエンド
* [![Node.js][Node-shield]][Node-url] - JavaScript ランタイム
* [![Express][Express-shield]][Express-url] - Webフレームワーク
* [![WebSocket][WebSocket-shield]][WebSocket-url] - リアルタイム双方向通信
* [![node-pty][node-pty-shield]][node-pty-url] - PTY（仮想端末）管理

#### インフラ・ツール
* [![Docker][Docker-shield]][Docker-url] - コンテナ化
* [![GitHub Actions][Actions-shield]][Actions-url] - CI/CD（GHCR自動publish）
* [![tmux][tmux-shield]][tmux-url] - ターミナルマルチプレクサ

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## はじめに

Aoi-Terminalsをローカル環境で実行するための手順を説明します。

### 前提条件

以下のソフトウェアがインストールされている必要があります：

#### Docker使用（推奨）
* Docker Desktop または Docker Engine + Compose
  ```sh
  # Dockerバージョン確認
  docker --version
  docker compose version
  ```

#### Dockerを使用しない場合
* Node.js 20以上
  ```sh
  # Node.jsバージョン確認
  node --version  # v20.0.0以上
  ```
* npm
  ```sh
  npm install npm@latest -g
  ```
* tmux
  ```sh
  # WSL/Ubuntuの場合
  sudo apt-get install tmux
  ```

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

### インストール

#### 最短起動（推奨）

GitHub Container Registry（GHCR）に公開されているビルド済みイメージを使用して、1コマンドで起動できます。

```bash
curl -fsSL https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/install-docker.sh \
  | bash
```

**自動で行われること**:
- ✅ Docker イメージのダウンロード
- ✅ ログイントークンの自動生成（または指定したトークンを使用）
- ✅ 設定ファイルの作成（`~/.aoi-terminals/.env`）
- ✅ コンテナの起動
- ✅ ワンタイム共有QRコードの表示

**カスタムトークンを使用する場合**:
```bash
curl -fsSL https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/install-docker.sh \
  | TERMINAL_TOKEN=your_custom_token bash
```

起動後、ブラウザで `http://localhost:3101` にアクセスしてください。

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

#### Docker Composeで起動

リポジトリをクローンして、ローカルでビルド・起動する場合：

1. リポジトリをクローン
   ```sh
   git clone https://github.com/takamiya1021/app045-aoi-terminal-system.git
   cd app045-aoi-terminal-system
   ```

2. 環境変数ファイルを作成
   ```sh
   cp .env.docker.example .env
   ```

3. 環境変数を編集（必要に応じて）
   ```sh
   nano .env  # または vi .env
   ```

4. Docker Composeで起動
   ```sh
   docker compose up -d --build
   ```

5. ブラウザで `http://localhost:3101` にアクセス

**停止**:
```sh
docker compose down
```

**ログ確認**:
```sh
docker compose logs -f
```

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

#### 開発環境で起動

WSL/Linux環境で、Node.jsを直接使用して起動する場合：

1. 依存関係をインストール
   ```sh
   npm run setup
   ```

2. 起動スクリプトを実行
   ```sh
   npm start
   # または
   ./scripts/start.sh
   ```

3. ブラウザで `http://localhost:3101` にアクセス

**停止**:
```sh
./scripts/stop.sh
```

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## 使い方

### 基本的な使用方法

1. **ログイン**
   - ブラウザで `http://localhost:3101` にアクセス
   - **方法1**: ログイントークンを手入力（起動時に表示されたトークンを使用）
   - **方法2**: 初回ログイン用QRコードをスキャン（起動時に表示、**何度でも使える**）
   - **セッション有効期間**: 24時間（自動ログアウトなし）

2. **ターミナル操作**
   - 通常のターミナルと同様にコマンドを入力
   - モバイルの場合、画面上のコントロールボタンで特殊キーを入力可能

3. **共有リンク発行**（一時的なアクセスを他の人に渡す場合）
   - ログイン後、`Share (QR)` ボタンをクリック
   - **ワンタイムQRコード**が表示される（**1回だけ使える**、5分間有効）
   - QRをスキャンするか、URLをコピーして共有
   - **共有リンク経由のセッション**: 6時間有効（セキュリティのため短め）

   > **Note**
   > 初回ログイン用QRコードとは異なり、Share (QR)で発行したリンクは1回使用すると無効化されます。

4. **tmux操作**
   - tmuxパネルを展開して、ウィンドウ分割・切替などをボタンで操作

### 環境設定

主要な環境変数（`.env`ファイルで設定）:

| 変数名 | 説明 | デフォルト値 |
|--------|------|-------------|
| `TERMINAL_TOKEN` | ログイン用トークン | 自動生成 |
| `ALLOWED_ORIGINS` | 許可するOrigin（CORS） | `http://localhost:3101` |
| `TERMINAL_LINK_TOKEN_TTL_SECONDS` | 共有リンクの有効期限（秒） | `300` (5分) |
| `TERMINAL_COOKIE_SECURE` | Cookie Secure属性 | `0` (HTTP時) |

**Tailscale/LAN経由でアクセスする場合**:
```env
ALLOWED_ORIGINS=http://your-tailscale-hostname:3101,http://your-ip:3101
```

詳細なドキュメントは [doc/](doc/) ディレクトリを参照してください。

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## テスト

### 全テストの実行

```bash
npm test
```

### フロントエンドのみ
```bash
npm run test:frontend
```

### バックエンドのみ
```bash
npm run test:backend
```

### E2Eテスト
```bash
npm run test:e2e
```

**既にサーバーが起動している場合**:
```bash
npm run test:e2e:existing
```

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## ロードマップ

- [x] 基本的なターミナル機能
- [x] tmux統合
- [x] 日本語IME対応
- [x] ワンタイム共有QR
- [x] PWA対応
- [x] Docker配布（GHCR）
- [ ] セッション管理UI
  - [ ] アクティブなtmuxウィンドウ一覧
  - [ ] ウィンドウ名の変更
- [ ] ファイル転送機能
  - [ ] ドラッグ&ドロップでアップロード
  - [ ] ダウンロード機能
- [ ] マルチユーザー対応
- [ ] コマンド履歴・ブックマーク

詳細は[Issues](https://github.com/takamiya1021/app045-aoi-terminal-system/issues)をご覧ください。

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## コントリビューション

コントリビューションは大歓迎です！以下の手順でプルリクエストをお送りください。

1. プロジェクトをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエストを開く

### コントリビューションガイドライン

- **Issue報告時**: 再現手順、期待される動作、実際の動作、環境情報を含めてください
- **プルリクエスト時**: 変更内容の説明、関連するIssue番号、テストの実行結果を含めてください
- **コーディング規約**: ESLintとPrettierの設定に従ってください

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## ライセンス

TBD

<!-- ライセンスが決定次第、以下のような形式で記載してください
Distributed under the MIT License. See `LICENSE` for more information.
-->

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## コンタクト

あおいさん - [@takamiya1021](https://github.com/takamiya1021)

プロジェクトリンク: [https://github.com/takamiya1021/app045-aoi-terminal-system](https://github.com/takamiya1021/app045-aoi-terminal-system)

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

## 謝辞

このプロジェクトの開発にあたり、以下のリソースとツールに感謝します：

* [xterm.js](https://xtermjs.org/) - 強力なターミナルエミュレータ
* [node-pty](https://github.com/microsoft/node-pty) - PTY実装
* [Next.js](https://nextjs.org/) - Reactフレームワーク
* [Tailwind CSS](https://tailwindcss.com/) - CSSフレームワーク
* [tmux](https://github.com/tmux/tmux) - ターミナルマルチプレクサ
* [Claude Code on the Web](https://claude.ai) - UIデザインのインスピレーション
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) - READMEテンプレート

**特別な謝辞**:
* チャッピー（Codex CLI） - 技術設計と実装のサポート

<p align="right">(<a href="#目次">トップへ戻る</a>)</p>

---

<!-- MARKDOWN LINKS & IMAGES -->
[Next-shield]: https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white
[Next-url]: https://nextjs.org/
[React-shield]: https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black
[React-url]: https://reactjs.org/
[TypeScript-shield]: https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Node-shield]: https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white
[Node-url]: https://nodejs.org/
[Docker-shield]: https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
[Actions-shield]: https://img.shields.io/github/actions/workflow/status/takamiya1021/app045-aoi-terminal-system/publish-ghcr.yml?style=for-the-badge&logo=github-actions&logoColor=white
[Actions-url]: https://github.com/takamiya1021/app045-aoi-terminal-system/actions
[License-shield]: https://img.shields.io/badge/License-TBD-lightgrey?style=for-the-badge
[License-url]: #ライセンス
[Tailwind-shield]: https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[xterm-shield]: https://img.shields.io/badge/xterm.js-5.5-000000?style=for-the-badge
[xterm-url]: https://xtermjs.org/
[PWA-shield]: https://img.shields.io/badge/PWA-Enabled-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white
[PWA-url]: https://web.dev/progressive-web-apps/
[Express-shield]: https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white
[Express-url]: https://expressjs.com/
[WebSocket-shield]: https://img.shields.io/badge/WebSocket-Ready-010101?style=for-the-badge
[WebSocket-url]: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
[node-pty-shield]: https://img.shields.io/badge/node--pty-1.0-339933?style=for-the-badge
[node-pty-url]: https://github.com/microsoft/node-pty
[tmux-shield]: https://img.shields.io/badge/tmux-Integrated-1BB91F?style=for-the-badge
[tmux-url]: https://github.com/tmux/tmux
