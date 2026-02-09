# Aoi-Terminals 技術設計書（v2/v3）

## 1. 技術スタック選定

### 1.1 確定した技術スタック

| レイヤー | 技術 | 選定理由 |
|---------|------|---------|
| **フロントエンド** | Vite + React 18 | 高速なHMR、静的ビルド→nginx配信でシンプル。SSR不要のSPA構成 |
| **ターミナル** | xterm.js（@xterm/xterm） | CJK/IME完全サポート、compositionEventで自前制御、実績豊富 |
| **UIライブラリ** | Tailwind CSS 3.x | モダンデザインが容易、カスタマイズ性高い |
| **バックエンド** | Node.js 20+ + Express | WebSocket統合が容易、ターミナルI/Oブリッジに最適 |
| **WebSocket** | ws（Node.js） | 軽量で高速、Express統合が簡単 |
| **PTY** | node-pty 1.x | PTY生成・シェル実行に最適（利用不可環境ではFallbackShellにフォールバック） |
| **ロガー** | winston | 構造化ログ、コンソール出力 |
| **フロントエンド配信** | nginx（Dockerコンテナ内） | Viteビルド成果物を静的配信。SPAフォールバック対応 |
| **コンテナ** | Docker（WSLネイティブdocker-ce） | `network_mode: host`でWSL2ネットワークをそのまま利用 |
| **パッケージ管理** | npm | 標準的 |

### 1.2 v1からの変更点（削除されたもの）

| 削除されたもの | 理由 |
|---------------|------|
| Next.js（SSR/App Router） | SSR不要。Vite + 静的ビルドでシンプル化 |
| SessionManager.tsx | tmuxのSessions(s)ボタンで代用。専用UIは過剰 |
| useTerminal.ts hook | App.tsxに統合。単一コンポーネントで状態管理が完結 |
| tmux-helper.ts（バックエンド） | フロントからtmuxプレフィックスキーを直接送信する方式に変更 |
| config/server-config.json | 環境変数で一元管理（Docker対応） |
| Docker Desktop | WSLネイティブDocker（docker-ce）を使用 |
| next.config.mjs, app/layout.tsx | Next.js関連ファイルすべて削除 |

### 1.3 設計判断の背景

- **Webベースの理由**: TermuxのSSHクライアントは日本語IMEとの相性が悪い。xterm.jsのcompositionEventで自前制御することで解決
- **QRコード認証**: ランダムトークンのスマホ手入力が苦痛。QRスキャンでワンタッチログイン
- **Docker使用理由**: 公開アプリの配布手段。`curl | bash`で1行インストール。npmは野良パッケージ問題で却下
- **ttyd不採用理由**: フロントエンドがCバイナリに埋め込み。IME/UIカスタマイズ不可

## 2. システムアーキテクチャ

### 2.1 全体構成図

```
┌─────────────────────────────────────────────────────────────┐
│                     クライアント（ブラウザ）                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Vite SPA (React 18)                                 │  │
│  │  ├─ App.tsx - メイン画面（認証/ターミナル/状態管理）  │  │
│  │  ├─ components/                                      │  │
│  │  │  ├─ Terminal.tsx      - xterm.js統合              │  │
│  │  │  ├─ ControlPanel.tsx  - 操作キー・矢印・IME      │  │
│  │  │  ├─ ShareLinkModal.tsx- QRコード共有リンク        │  │
│  │  │  ├─ TextInputModal.tsx- 日本語長文入力            │  │
│  │  │  ├─ Layout.tsx        - 全体レイアウト            │  │
│  │  │  └─ OfflineIndicator.tsx - オフライン表示         │  │
│  │  └─ hooks/                                           │  │
│  │     └─ useWebSocket.ts   - WebSocket接続管理         │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ HTTP / WebSocket                  │
│                          ▼                                  │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  Docker (network_mode: host)                                │
│  ┌───────────────────────▼───────────────────────────────┐ │
│  │  nginx コンテナ (Port 3101)                           │ │
│  │  └─ Viteビルド成果物を静的配信（SPA fallback）       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Node.js バックエンドコンテナ (Port 3102)             │ │
│  │  ├─ Express Server (認証API)                          │ │
│  │  ├─ WebSocket Server (ws)                             │ │
│  │  └─ PtyManager (node-pty + SSH bridge)                │ │
│  └───────────────────────┬───────────────────────────────┘ │
│                          │ SSH (コンテナ→ホスト)            │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  WSL2 Ubuntu ホスト                                         │
│  ├─ bash / tmux                                             │
│  └─ OpenSSH Server（鍵認証）                                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 通信フロー

#### 2.2.1 初回接続フロー

```
1. ブラウザ → nginx（静的配信）
   GET http://hostname:3101/
   → Viteビルド成果物（index.html + JS/CSS）を返却

2. ブラウザ → Node.jsバックエンド（HTTP）
   POST http://hostname:3102/auth { token }
   ✓ トークン有効 → HttpOnly Cookie 発行（セッション確立）
   ✗ トークン無効 → 401 Unauthorized

3. ブラウザ → Node.jsバックエンド (WebSocket)
   ws://hostname:3102 （Cookieで認証）

4. Node.js → 認証チェック（Cookieセッション + Origin制限）
   ✓ セッション有効 → WebSocket確立
   ✗ セッション無効 → WebSocket Close (1008)

5. Node.js → node-pty でSSH接続（または直接bash起動）
   SSH bridge: コンテナ → ホストのbash（鍵認証）
   PTY入出力を WebSocket に中継

6. SSH先ホストで tmux を自動起動
   tmux new-session -A -s <セッション名>
   （既存セッションがあれば再接続）

7. 双方向通信確立
   ブラウザ ←→ WebSocket ←→ PTY ←→ SSH ←→ tmux/bash
```

#### 2.2.2 キー入力フロー

```
ブラウザ（キー入力）
  ↓ xterm.js onData event
  ↓ WebSocket.send({ type: 'input', data: 'x' })
  ↓
Node.js WebSocket Server
  ↓ ptyManager.write(sessionId, 'x')
  ↓
PTY → SSH → bash / tmux
  ↓ コマンド実行・出力
  ↓
Node.js ← pty.onData
  ↓ WebSocket.send({ type: 'output', data: '...' })
  ↓
ブラウザ（ターミナル表示）
  ↓ terminal.write('...')  ※ tick + drain 方式でバッチ書き込み
```

#### 2.2.3 日本語IME入力フロー

```
ブラウザ（日本語入力開始）
  ↓ compositionstart event（isComposingRef = true）
  ↓
ブラウザ（変換中）
  ↓ xterm.js内部のtextareaからcompositionイベントがbubble
  ↓
ブラウザ（確定）
  ↓ compositionend event（isComposingRef = false）
  ↓ 確定文字を取得（保険的にonDataRef経由で送信）
  ↓ WebSocket.send({ type: 'input', data: '確定文字' })
  ↓
（以降、通常のキー入力フローと同じ）
```

#### 2.2.4 tmux操作（透過的動作）

tmuxはバックエンドで透過的に動作しており、ユーザーがtmux操作を意識する必要はない。

```
バックエンド（SSH接続時）
  ↓ tmux new-session -A -s <セッション名>
  ↓ tmuxセッション内でbashが起動
  ↓
ユーザー操作
  ↓ ターミナルに直接キー入力（通常のbash操作）
  ↓ tmuxはセッション維持のためにバックグラウンドで動作
  ↓
tmux操作が必要な場合
  ↓ ユーザーがターミナル上で直接 Ctrl+B を入力
  ↓ 通常のtmuxキーバインドとして動作
```

**v3からの変更**: v3ではTmuxPanel UIからtmuxプレフィックスキーをボタン操作で送信していた。v4ではTmuxPanelを削除し、tmuxはバックエンドでセッション維持のために透過的に動作する。ユーザーは通常tmuxの存在を意識せずにbashを操作する。必要に応じてターミナル上で直接Ctrl+B等のtmuxキーバインドを入力することも可能。

#### 2.2.5 共有リンク（ワンタイムトークン + QR）

```
1. ログイン済みユーザー → バックエンドへ共有トークン発行
   POST http(s)://hostname:3102/link-token（Cookie必須）
   body: { isShare: true }

2. バックエンド → ワンタイムトークンを返す
   { ok: true, token, expiresAt }
   - 期限: TERMINAL_LINK_TOKEN_TTL_SECONDS（デフォルト 5分）

3. フロント → 共有URLを生成し、QRコードを表示
   http(s)://<origin>/?token=<one-time-token>
   QRコード: qrcodeライブラリで動的生成

4. 共有URLを開いた端末 → /auth で1回だけログイン
   成功後、URLから token を削除（history.replaceState）
   セッション有効期間: シェア用6h / 通常24h
```

## 3. コンポーネント設計

### 3.1 フロントエンドコンポーネント構成

```
frontend/src/
├─ App.tsx                - メイン画面（認証/ターミナル/共有リンク/状態管理すべて）
├─ main.tsx               - Viteエントリーポイント
├─ components/
│  ├─ Terminal.tsx         - xterm.js統合（tick+drain出力、IME対応）
│  ├─ ControlPanel.tsx     - 基本コントロール（Esc/Tab/Enter/^C/^D/^Z/矢印/IME）
│  ├─ ShareLinkModal.tsx   - 共有リンク（QR）表示モーダル
│  ├─ TextInputModal.tsx   - 日本語長文入力モーダル
│  ├─ Layout.tsx           - 全体レイアウト（ヘッダー/フッター/ランタイムエラー表示）
│  └─ OfflineIndicator.tsx - オフライン状態バー表示
├─ hooks/
│  └─ useWebSocket.ts      - WebSocket接続・メッセージ送受信
└─ lib/
   └─ types.ts             - Client/Serverメッセージ型定義
```

### 3.2 バックエンドモジュール構成

```
backend/src/
├─ server.ts              - Expressサーバー（/auth, /session, /logout, /link-token, /health）
├─ websocket.ts           - WebSocketサーバー（Cookie認証 + Origin制限 + Keepalive）
├─ pty-manager.ts          - PTY生成・管理（SSH bridge / ローカル / Fallbackの3モード）
├─ auth.ts                - Cookie認証 / ワンタイムトークン / セッション管理
├─ config.ts              - 設定読み込み（環境変数 > config/server-config.json > デフォルト）
├─ logger.ts              - winston構造化ロガー
└─ types.ts               - メッセージ型定義
```

### 3.3 主要コンポーネント詳細

#### App.tsx（メインコンポーネント）

**責務**:
- 認証状態管理（トークン入力画面 / ターミナル画面の切り替え）
- URLトークンによる自動ログイン（`/?token=...`）
- WebSocket接続管理（useWebSocket hook経由）
- ターミナル出力バッファ管理（tick + drain方式）
- 仮想キーボード検知（visualViewport API）
- 共有リンク生成（QRコード動的生成）
- 全画面モード切り替え

#### Terminal.tsx（ターミナルコンポーネント）

**責務**:
- xterm.jsインスタンス生成・初期化
- FitAddonによる自動リサイズ（ResizeObserver連携）
- キーボード入力イベント処理（xterm.js onData）
- 日本語IMEイベント処理（compositionstart/end、保険的入力捕捉）
- 出力データのバッチ書き込み（tick + drain方式）

**Props**:
```typescript
interface TerminalComponentProps {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  incomingTick?: number;
  drainIncoming?: () => string[];
}
```

#### ControlPanel.tsx（コントロールUI）

**責務**:
- 特殊キーボタン（Esc, Tab, Enter）
- ショートカットボタン（Ctrl+C, Ctrl+D, Ctrl+Z）
- 矢印キー（逆T字配列）
- IMEボタン（TextInputModal起動）

**Props**:
```typescript
interface ControlPanelProps {
  onSendKey: (key: string) => void;
  onOpenTextInput?: () => void;
}
```

#### TmuxPanel.tsx（削除済み）

v3で実装されたtmux操作パネルは、v4で削除された。tmuxはバックエンドで透過的にセッション維持のために動作しており、ユーザーがtmux操作を意識する必要がないため。ControlPanelのみで操作が完結する。

#### ShareLinkModal.tsx（共有リンク）

**責務**:
- ワンタイムトークンの発行リクエスト
- QRコード生成・表示（qrcodeライブラリ）
- 共有URLのコピー機能
- 有効期限表示

**Props**:
```typescript
interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  qrDataUrl: string | null;
  expiresAt: number | null;
  error: string | null;
  busy: boolean;
  onGenerate: () => void;
}
```

#### TextInputModal.tsx（日本語長文入力）

**責務**:
- モーダルウィンドウ表示
- textareaでの長文入力（ブラウザネイティブIME使用）
- 仮想キーボード追従（visualViewport API）
- 入力内容のターミナル送信

**Props**:
```typescript
interface TextInputModalProps {
  isOpen: boolean;
  initialValue: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}
```

#### Layout.tsx（全体レイアウト）

**責務**:
- ヘッダー/フッター/メインコンテンツのフレックスレイアウト
- visualViewport APIによるビューポート高さ追従（モバイルキーボード対策）
- ランタイムエラー収集・表示（window.onerror / unhandledrejection）
- OfflineIndicator統合

#### OfflineIndicator.tsx（オフライン表示）

**責務**:
- navigator.onLine状態監視
- オフライン時に画面上部に赤バー表示

## 4. データモデル設計

### 4.1 WebSocketメッセージ形式

#### クライアント → サーバー

```typescript
// キー入力（通常入力 + tmuxプレフィックスキー + IME確定文字）
interface InputMessage {
  type: 'input';
  data: string;
}

// リサイズ要求
interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

type ClientMessage = InputMessage | ResizeMessage;
```

#### サーバー → クライアント

```typescript
// ターミナル出力
interface OutputMessage {
  type: 'output';
  data: string;  // PTYからの出力（ANSIエスケープコード含む）
}

// 接続確立確認
interface ConnectedMessage {
  type: 'connected';
  sessionId: string;
  tmuxSession: string;
}

// エラー通知
interface ErrorMessage {
  type: 'error';
  message: string;
}

type ServerMessage = OutputMessage | ConnectedMessage | ErrorMessage;
```

### 4.2 設定管理

#### 環境変数（主要）

| 環境変数 | デフォルト | 説明 |
|---------|-----------|------|
| `PORT` | 3102（バックエンド） | バックエンドリスンポート |
| `ALLOWED_ORIGINS` | `http://localhost:3101` | CORS許可オリジン（カンマ区切り） |
| `TERMINAL_TOKEN` | `valid_token`（開発時のみ） | ログイントークン。本番は必須設定 |
| `TERMINAL_LINK_TOKEN_TTL_SECONDS` | 300（5分） | ワンタイムトークンの有効期間（秒） |
| `TERMINAL_COOKIE_SECURE` | `NODE_ENV`依存 | Cookie Secureフラグ強制 |
| `TERMINAL_SSH_TARGET` | なし | SSH接続先（例: `localhost`） |
| `TERMINAL_SSH_KEY` | なし | SSH秘密鍵パス |
| `TERMINAL_USE_TMUX` | `true` | tmux使用フラグ |
| `TERMINAL_TMUX_SESSION` | `aoi-terminals` | tmuxセッション名 |
| `NODE_ENV` | `development` | 環境（production/development） |

#### config.ts の読み込み優先順位

```
環境変数 > config/server-config.json > デフォルト値
```

## 5. ファイル構成

### 5.1 プロジェクトルート構成

```
aoi-terminal-system/
├─ frontend/                   # Vite + React フロントエンド
│  ├─ src/
│  │  ├─ App.tsx               - メイン画面
│  │  ├─ main.tsx              - エントリーポイント
│  │  ├─ components/           - UIコンポーネント群
│  │  ├─ hooks/                - カスタムhooks
│  │  └─ lib/                  - 型定義・ユーティリティ
│  ├─ public/
│  │  └─ terminal-logo.svg     - ロゴ
│  ├─ index.html               - Viteエントリー
│  ├─ vite.config.ts           - Vite設定
│  ├─ nginx.conf               - 本番nginx設定
│  ├─ Dockerfile               - マルチステージビルド（node→nginx）
│  ├─ tailwind.config.ts       - Tailwind CSS設定
│  ├─ postcss.config.mjs       - PostCSS設定
│  ├─ tsconfig.json
│  └─ package.json
│
├─ backend/                    # Node.js バックエンド
│  ├─ src/
│  │  ├─ server.ts             - Expressサーバー
│  │  ├─ websocket.ts          - WebSocketサーバー
│  │  ├─ pty-manager.ts        - PTY生成・管理
│  │  ├─ auth.ts               - 認証・セッション管理
│  │  ├─ config.ts             - 設定読み込み
│  │  ├─ logger.ts             - winstonロガー
│  │  └─ types.ts              - メッセージ型定義
│  ├─ config/
│  │  └─ server-config.json    - ポート・Origin許可（環境変数で上書き可）
│  ├─ entrypoint.sh            - Docker起動スクリプト（SSH鍵パーミッション修正）
│  ├─ Dockerfile               - マルチステージビルド（build→runtime）
│  ├─ tsconfig.json
│  └─ package.json
│
├─ scripts/                    # 運用スクリプト
│  ├─ install-docker.sh        - WSLネイティブDocker対応インストーラー
│  ├─ production-cli.sh        - 本番CLI生成
│  ├─ start.sh                 - 開発用起動
│  ├─ stop.sh                  - 停止
│  ├─ print-share-qr.sh       - /link-token を叩いてCLIにURL+QR表示
│  ├─ smoke-docker.sh          - Docker動作確認スモークテスト
│  └─ uninstall.sh             - アンインストール
│
├─ docker-compose.ghcr.yml     - 開発用（build + image指定）
├─ doc/                        - ドキュメント
└─ README.md
```

### 5.2 Docker構成

#### docker-compose.ghcr.yml（開発用）

```yaml
services:
  backend:
    build: backend
    image: aoi-terminals-backend:latest
    network_mode: "host"
    environment:
      PORT: "3102"
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:3101,http://127.0.0.1:3101}
      TERMINAL_TOKEN: ${TERMINAL_TOKEN:-valid_token}
      TERMINAL_SSH_TARGET: ${TERMINAL_SSH_TARGET:-localhost}
      TERMINAL_SSH_KEY: ${TERMINAL_SSH_KEY}
      # ... その他環境変数
    volumes:
      - ./backend/ssh_key:/app/ssh_key:ro
    restart: unless-stopped

  frontend:
    build: frontend
    image: aoi-terminals-frontend:latest
    network_mode: "host"
    depends_on:
      - backend
    restart: unless-stopped
```

#### 本番用（~/.aoi-terminals/docker-compose.yml）

- `image`のみ指定（GHCRからpull）
- `build`なし
- install-docker.shが自動生成

#### フロントエンドDockerfile（マルチステージ）

```
Stage 1 (build): node:20 → npm ci → vite build → dist/
Stage 2 (runtime): nginx:alpine → dist/ をコピー → nginx配信
```

#### バックエンドDockerfile（マルチステージ）

```
Stage 1 (build): node:20 + python3/make/g++ → npm ci → tsc → dist/
Stage 2 (runtime): node:20 + tmux/bash/openssh-client → node dist/server.js
```

## 6. API・インターフェース定義

### 6.1 HTTP API

| エンドポイント | メソッド | 認証 | 説明 |
|---------------|--------|------|------|
| `/health` | GET | 不要 | ヘルスチェック |
| `/auth` | POST | トークン | ログイン（Cookie発行） |
| `/session` | GET | Cookie | セッション有効性確認 |
| `/logout` | POST | Cookie | ログアウト（セッション破棄） |
| `/link-token` | POST | Cookie | ワンタイムトークン発行（QR/共有リンク用） |

### 6.2 WebSocket API

| イベント | 方向 | データ形式 | 説明 |
|---------|------|-----------|------|
| connection | C→S | - | WebSocket接続確立（Cookie + Origin検証） |
| message | C→S | `InputMessage` | キー入力（通常 + tmuxプレフィックス + IME） |
| message | C→S | `ResizeMessage` | ターミナルリサイズ |
| message | S→C | `OutputMessage` | ターミナル出力 |
| message | S→C | `ConnectedMessage` | 接続確立通知（sessionId, tmuxSession） |
| message | S→C | `ErrorMessage` | エラー通知 |
| ping/pong | S↔C | - | Keepalive（30秒間隔） |
| close | C↔S | - | 接続切断（PTYセッションも終了） |

### 6.3 認証フロー

```
1. POST /auth { token } → Cookie発行
   - 固定トークン（TERMINAL_TOKEN環境変数）→ 通常セッション（24h）
   - ワンタイムトークン（isShare: false）→ 通常セッション（24h）
   - ワンタイムトークン（isShare: true）→ シェアセッション（6h）

2. WebSocket接続時 → Cookie検証 + Origin制限
   - Cookie無効 → 1008 (Policy Violation)
   - Origin不一致 → 1008 (Origin Not Allowed)
```

## 7. セキュリティ設計

### 7.1 認証・認可

- **トークン認証**: `POST /auth` でトークン送信、成功時にHttpOnly Cookieでセッション化
- **セッション管理**: サーバーサイドMap（メモリ内）。有効期限付き（通常24h / シェア6h）
- **ワンタイムトークン**: 1回使い切り + 有効期限（デフォルト5分）。QR/共有リンク用
- **Cookie設定**: HttpOnly, SameSite=Lax, Secure（本番時）
- **SSH認証**: 鍵認証のみ（BatchMode=yes）。StrictHostKeyCheckingは初回接続簡易化のため無効化

### 7.2 通信セキュリティ

- **HTTPS対応**: Tailscale VPN経由（自動TLS）またはリバースプロキシ
- **CORS**: `ALLOWED_ORIGINS`で明示的にOrigin制限
- **WebSocket Origin制限**: バックエンド側で接続時にOriginヘッダーを検証

### 7.3 入力サニタイズ

- **XSS対策**: React自動エスケープ（dangerouslySetInnerHTML使用禁止）
- **コマンドインジェクション対策**: node-ptyがPTY経由でエスケープ処理

### 7.4 コンテナセキュリティ

- **非rootユーザー**: バックエンドコンテナはnodeユーザーで実行
- **SSH鍵マウント**: read-only（`:ro`）でマウント
- **entrypoint.sh**: SSH鍵のパーミッション修正（600）を起動時に実施

## 8. パフォーマンス設計

### 8.1 最適化戦略

- **静的ファイル配信**: nginx（gzip圧縮、静的アセット1年キャッシュ、index.htmlはno-cache）
- **WebSocket接続**: Keep-Alive、Ping/Pong自動送信（30秒間隔）
- **ターミナル出力**: tick + drain方式でバッチ書き込み（React stateバッチ処理で中間チャンクを落とさない）
- **ターミナルリサイズ**: ResizeObserver + requestAnimationFrameで効率的にfit実行
- **初期ターミナルサイズ**: 38列x20行（モバイル寄り。PC/タブレットはWS接続後すぐにリサイズ）
- **重複入力防止**: 50ms以内の同一データを検知・スキップ（スマホブラウザの二重発火対策）

### 8.2 リソース制限

- **ターミナルスクロールバック**: 5000行
- **接続数**: 単一ユーザー想定（複数接続は別セッション生成）
- **不活性接続**: 30秒間隔のPing/Pongで検知、応答なしは自動切断

## 9. 全画面モード設計

### 9.1 実装方式

- **Fullscreen API**: ブラウザ標準の `Element.requestFullscreen()` を使用
- **UI統合**: ヘッダー右側にトグルボタンを配置
- **挙動**:
  - ユーザー操作（クリック/タップ）をトリガーに全画面化
  - アドレスバー、タブ、OSのステータスバー（モバイルブラウザによる）を非表示化
  - ターミナル領域を最大化
  - 再度ボタン押下で解除

## 10. UI/UXデザイン仕様

### 10.1 配色（ダークテーマ）

```css
/* ターミナル */
--terminal-bg: #0F172A;         /* slate-900系 */
--terminal-fg: #F3F4F6;         /* gray-100 */

/* UI全体 */
--bg-primary: slate-900;        /* メイン背景 */
--bg-surface: slate-800;        /* コントロールパネル等 */
--border: slate-700;            /* ボーダー */
--accent: orange-400/600;       /* アクセント（タイトル、tmuxボタン） */
--text-primary: slate-200;      /* メインテキスト */

/* 認証画面 */
--auth-bg: slate-950 → blue-950 グラデーション
--auth-accent: cyan-500;        /* 入力フォーカス、グロー効果 */
```

### 10.2 レイアウト構成

```
┌───────────────────────────────────────────────────────┐
│  Header                                                │
│  ┌─────────────┬──────────────────────────────────┐   │
│  │ Aoi-Terminals│              [全画面] [QR]       │   │
│  └─────────────┴──────────────────────────────────┘   │
├───────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │                                                 │ │
│  │           xterm.js ターミナル表示               │ │
│  │                                                 │ │
│  │         （画面の大部分を占有）                   │ │
│  │                                                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
├───────────────────────────────────────────────────────┤
│  Control Panel（常時表示）                             │
│  ┌───────────────────────────────────────────────┐   │
│  │ [Esc] [Tab] [Enter] [IME]  [  ▲  ]            │   │
│  │ [^C]  [^D]  [^Z]          [◀ ▼ ▶]            │   │
│  └───────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────────┤
│  Footer: (c) 2025 Aoi-Terminals                       │
└───────────────────────────────────────────────────────┘
```

### 10.3 モバイル対応

- **仮想キーボード検知**: visualViewport APIで高さ変化を監視（threshold: 120px）
- **キーボード表示時**: ControlPanelを非表示にしてターミナル領域を確保
- **スクロール抑制**: キーボード表示中はbody/htmlのoverflow:hidden、touchAction:noneを設定
- **ビューポート追従**: Layout.tsxがvisualViewport.heightに応じてコンテナ高さを動的調整

### 10.4 アニメーション

- **ボタンホバー**: transition-colors
- **認証画面**: グラデーションアニメーション、グロー効果、フローティング

## 11. エラーハンドリング

### 11.1 エラー分類と対処

| エラー種別 | 検出方法 | ユーザー通知 | 対処 |
|-----------|---------|-------------|------|
| WebSocket接続失敗 | ws.onerror | コンソールログ | URL変更時に自動再接続 |
| WebSocket切断 | ws.onclose | 画面内に切断メッセージ表示 | Re-check Sessionボタン |
| 認証失敗 | 401応答 | 認証画面にエラーメッセージ | トークン再入力 |
| セッション無効 | /session 401 | 認証画面に遷移 | 再ログイン |
| PTY起動失敗 | pty.spawn例外 | Fallbackシェルに切り替え | 簡易シェルで動作継続 |
| ネットワークオフライン | navigator.onLine | 画面上部に赤バー | オンライン復帰で自動非表示 |
| ランタイムエラー | window.onerror, unhandledrejection | 画面左下にエラーバッジ | 展開して詳細確認・クリア可 |

### 11.2 PTY Fallbackモード

node-ptyが利用できない環境では、FallbackSessionクラスが簡易シェルを提供する:
- `bash -lc <command>`でコマンド実行
- `cd`ビルトインサポート
- バックスペース処理
- 1コマンドずつ逐次実行（並列実行なし）

## 12. テスト戦略

### 12.1 テストレベル

- **単体テスト（Jest + React Testing Library）**:
  - コンポーネント単位のテスト（Terminal, ControlPanel等）
  - hooksのテスト（useWebSocket）
  - バックエンドモジュールのテスト（auth, pty-manager, server, websocket, types, config）
- **手動テスト**:
  - 実機（iPad/iPhone/Android）でのIME入力検証
  - Docker環境でのSSH bridge動作確認
  - QRコード共有フローの確認

### 12.2 テストカバレッジ目標

- **重点テスト箇所**:
  - Cookie認証/ワンタイムトークンの発行・消費・期限切れ
  - WebSocket接続・認証拒否
  - IMEイベント処理
  - PTY生成・Fallback切り替え
  - メッセージ型定義の整合性

## 13. デプロイ・運用

### 13.1 Dockerデプロイ（本番）

```bash
# 1. install-docker.sh によるワンライナーインストール
curl -fsSL https://raw.githubusercontent.com/.../install-docker.sh | bash

# 2. ~/.aoi-terminals/docker-compose.yml が自動生成される
# 3. docker compose up -d で起動
cd ~/.aoi-terminals && docker compose up -d

# 4. QRコード表示（スマホからアクセス用）
./scripts/print-share-qr.sh
```

### 13.2 開発用起動

```bash
# docker-compose.ghcr.yml を使用（build + image）
docker compose -f docker-compose.ghcr.yml up --build

# または直接起動
cd frontend && npm run dev &   # Port 3101
cd backend && npm run dev &    # Port 3102
```

### 13.3 監視・ログ

- **バックエンドログ**: winston（構造化JSON + コンソール出力）
- **監視項目**:
  - WebSocket接続数（Keepalive間隔でチェック）
  - PTYセッション生存状態
  - 認証失敗ログ

---

## 次のステップ

- PWA対応（Service Worker、オフラインキャッシュ）
- HTTPS/wss自動対応（Let's Encrypt or Tailscale）
- GitHub Container Registry（GHCR）への自動プッシュ
