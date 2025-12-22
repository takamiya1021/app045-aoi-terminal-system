# 改良版Webターミナルシステム 技術設計書

## 1. 技術スタック選定

### 1.1 確定した技術スタック

| レイヤー | 技術 | 選定理由 |
|---------|------|---------|
| **Webサーバー** | Next.js（開発/配信） | 開発時は `next dev` をそのままWebサーバとして利用し、構成をシンプルに保つ |
| **フロントエンド** | React 18 + Next.js 14 | エコシステム充実、Claude Code on the Webと同系統 |
| **ターミナル** | xterm.js 5.x | CJK/IME完全サポート、実績豊富、アドオンが充実 |
| **UIライブラリ** | Tailwind CSS 3.x | Claude風のモダンデザインが容易、カスタマイズ性高い |
| **バックエンド** | Node.js 20+ + Express 5.x | WebSocket統合が容易、ターミナルI/Oブリッジに最適 |
| **WebSocket** | ws（Node.js） | 軽量で高速、Express統合が簡単 |
| **PTY** | node-pty 1.x | PTY生成、シェル実行に最適（環境によってはfallback） |
| **パッケージ管理** | npm | Next.jsとの親和性、標準的 |

### 1.2 バージョン情報

```json
{
  "next": "14.2.x",
  "react": "18.3.x",
  "xterm": "5.3.x",
  "xterm-addon-fit": "0.8.x",
  "xterm-addon-web-links": "0.9.x",
  "tailwindcss": "3.4.x",
  "express": "5.x",
  "ws": "8.17.x",
  "node-pty": "1.0.x"
}
```

## 2. システムアーキテクチャ

### 2.1 全体構成図

```
┌─────────────────────────────────────────────────────────────┐
│                     クライアント（ブラウザ）                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Next.js App (React)                                │  │
│  │  ├─ app/page.tsx  - メインターミナル画面            │  │
│  │  ├─ components/                                      │  │
│  │  │  ├─ Terminal.tsx  - xterm.js統合                │  │
│  │  │  ├─ ControlPanel.tsx - コントロールボタン        │  │
│  │  │  ├─ TmuxPanel.tsx - tmux操作パネル              │  │
│  │  │  ├─ SessionManager.tsx - セッション管理UI       │  │
│  │  │  └─ TextInputModal.tsx - 日本語入力モーダル     │  │
│  │  ├─ hooks/                                          │  │
│  │  │  ├─ useWebSocket.ts - WebSocket接続管理         │  │
│  │  │  └─ useTerminal.ts - ターミナル状態管理         │  │
│  │  └─ styles/ - Tailwind設定                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│                          │ HTTP/HTTPS (Tailscale VPN)       │
│                          ▼                                  │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│  WSL2 Ubuntu             │                                  │
│  ┌───────────────────────▼───────────────────────────────┐ │
│  │  Next.jsフロントエンド (Port 3101)                    │ │
│  │  ├─ App Router / UI配信                               │ │
│  │  └─ ブラウザで xterm.js が描画                         │ │
│  └───────────────────────┬───────────────────────────────┘ │
│                          │                                  │
│  ┌───────────────────────▼───────────────────────────────┐ │
│  │  Node.jsバックエンド (Port 3102)                      │ │
│  │  ├─ Express Server                                    │ │
│  │  ├─ WebSocket Server (ws)                             │ │
│  │  └─ PTY Manager (node-pty + fallback)                 │ │
│  └───────────────────────┬───────────────────────────────┘ │
│                          │                                  │
│  ┌───────────────────────▼───────────────────────────────┐ │
│  │  bash / tmux                                          │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 通信フロー

#### 2.2.1 初回接続フロー

```
1. ブラウザ → Next.jsページロード (HTTP)
   GET http://hostname:3101/

2. ブラウザ → Node.jsバックエンド（HTTP）
   POST http://hostname:3102/auth { token }
   ✓ トークン有効 → HttpOnly Cookie 発行（セッション確立）
   ✗ トークン無効 → 401 Unauthorized

3. ブラウザ → Node.jsバックエンド (WebSocket)
   ws://hostname:3102 （Cookieで認証）

4. Node.js → 認証チェック（Cookieセッション）
   ✓ セッション有効 → WebSocket確立
   ✗ セッション無効 → WebSocket Close (1008)

5. Node.js → node-pty でローカルシェル起動
   bash を起動し、入出力を WebSocket に中継
   ※ 環境によっては PTY が使えないため fallback shell を使用する

6. （任意）tmux 操作
   tmux helper 経由でコマンド実行・情報取得

7. Node.js ← tmux出力 → WebSocket → ブラウザ
   双方向通信確立
```

#### 2.2.2 キー入力フロー

```
ブラウザ（キー入力）
  ↓ onKey event (xterm.js)
  ↓ WebSocket.send({ type: 'input', data: 'x' })
  ↓
Node.js WebSocket Server
  ↓ pty.write('x')
  ↓
PTY → bash / tmux
  ↓ コマンド実行・出力
  ↓
Node.js ← pty.onData
  ↓ WebSocket.send({ type: 'output', data: '...' })
  ↓
ブラウザ（ターミナル表示）
  ↓ terminal.write('...')
```

#### 2.2.3 日本語IME入力フロー

```
ブラウザ（日本語入力開始）
  ↓ compositionstart event
  ↓ 変換候補表示領域確保
  ↓
ブラウザ（変換中）
  ↓ compositionupdate event
  ↓ 確定前文字表示（下線付き）
  ↓
ブラウザ（確定）
  ↓ compositionend event
  ↓ 確定文字を取得
  ↓ WebSocket.send({ type: 'input', data: '確定文字' })
  ↓
（以降、通常のキー入力フローと同じ）
```

#### 2.2.4 共有リンク（ワンタイムトークン + QR）

```
1. ログイン済みユーザー → バックエンドへ共有トークン発行
   POST http(s)://hostname:3102/link-token（Cookie必須）

2. バックエンド → ワンタイムトークンを返す
   { token, expiresAt }
   - 期限: TERMINAL_LINK_TOKEN_TTL_SECONDS（未指定 5分）

3. フロント/CLI → 共有URLを生成
   http(s)://<public-base>:3101/?token=<one-time-token>

4. 共有URLを開いた端末 → /auth で1回だけログイン
   成功後、URLから token を削除（history.replaceState）
```

## 3. コンポーネント設計

### 3.1 フロントエンドコンポーネント構成

```
frontend/src/
├─ app/
│  └─ page.tsx           - メイン画面（ログイン/ターミナル/共有リンク）
├─ components/
│  ├─ Terminal.tsx       - xterm.js統合（出力drain対応）
│  ├─ ControlPanel.tsx   - 基本コントロール（Ctrl/Alt/Esc/矢印/IME）
│  ├─ TmuxPanel.tsx      - tmux操作パネル
│  ├─ ShareLinkModal.tsx - 共有リンク（QR）表示
│  ├─ SessionManager.tsx - tmuxセッション表示（任意）
│  ├─ TextInputModal.tsx - 日本語長文入力モーダル
│  └─ Layout.tsx         - 全体レイアウト
├─ hooks/
│  └─ useWebSocket.ts    - WebSocket接続・メッセージ送受信
└─ lib/
   └─ types.ts           - Client/Serverメッセージ型
```

### 3.2 バックエンドモジュール構成

```
backend/
├─ src/
│  ├─ server.ts          - Expressサーバー（/auth,/session,/logout,/link-token）
│  ├─ websocket.ts       - WebSocketサーバー（Cookieセッション認証）
│  ├─ pty-manager.ts     - PTY生成・管理（node-pty + fallback）
│  ├─ auth.ts            - Cookieセッション/ワンタイム共有トークン
│  ├─ tmux-helper.ts     - tmuxコマンド実行・情報取得
│  └─ config.ts          - 設定ファイル読み込み
└─ config/
   └─ server-config.json - ポート/Origin許可など
```

### 3.3 実行時の補助スクリプト（QR自動出力）



```

scripts/

├─ start.sh              - tmuxでフロント/バック起動 + QR自動出力

├─ stop.sh               - 停止

├─ install-docker.sh     - Docker環境一発起動インストーラー

└─ print-share-qr.sh     - /link-token を叩いて CLI にURL+QR表示

```

### 3.3 主要コンポーネント詳細

#### Terminal.tsx（中核コンポーネント）

**責務**:
- xterm.jsインスタンス生成・初期化
- WebSocketとの接続管理
- キーボード入力イベント処理
- 日本語IMEイベント処理（compositionstart/update/end）
- ターミナルリサイズ処理

**Props**:
```typescript
interface TerminalProps {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  // WebSocket出力は短時間に大量のチャンクが来るため、tick + drain で受け取る
  incomingTick?: number;
  drainIncoming?: () => string[];
}
```

**主要メソッド**:
```typescript
- initTerminal(): void          // xterm.js初期化
- connectWebSocket(): void      // WebSocket接続
- handleInput(data: string): void  // 入力処理
- handleComposition(event: CompositionEvent): void  // IME処理
- resize(cols: number, rows: number): void  // リサイズ
```

#### ControlPanel.tsx（コントロールUI）

**責務**:
- 特殊キーボタン（Ctrl, Alt, Esc, Tab, Enter）
- 矢印キー、ナビゲーションキー
- ショートカットボタン（Ctrl+C, Ctrl+D, Ctrl+Z）
- TmuxPanelの展開/折りたたみ制御

**Props**:
```typescript
interface ControlPanelProps {
  onSendKey: (key: string) => void;
  onOpenTextInput?: () => void;
}
```

#### TmuxPanel.tsx（tmux操作）

**責務**:
- tmux基本操作ボタン（c, n, p, d, %, ", o, z, [）
- 展開/折りたたみアニメーション
- ボタン押下時のコマンド送信

**Props**:
```typescript
interface TmuxPanelProps {
  onSendCommand: (command: string, args?: string[]) => void;
}
```

#### SessionManager.tsx（セッション管理）

**責務**:
- tmuxウィンドウ一覧表示
- アクティブウィンドウのハイライト
- ウィンドウ切り替えボタン
- ウィンドウ名変更機能

**Props**:
```typescript
interface SessionManagerProps {
  sessions: TmuxSession[];
  activeWindow: number;
  onWindowSwitch: (windowIndex: number) => void;
  onWindowRename: (windowIndex: number, newName: string) => void;
}

interface TmuxSession {
  sessionName: string;
  windows: TmuxWindow[];
}

interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
  panes: number;
}
```

#### TextInputModal.tsx（日本語長文入力）

**責務**:
- モーダルウィンドウ表示
- textarea での長文入力
- IME完全対応（ブラウザネイティブIME使用）
- 入力内容のターミナル送信

**Props**:
```typescript
interface TextInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}
```

## 4. データモデル設計

### 4.1 WebSocketメッセージ形式

#### クライアント → サーバー

```typescript
// キー入力
type InputMessage = {
  type: 'input';
  data: string;  // 入力文字列
};

// リサイズ要求
type ResizeMessage = {
  type: 'resize';
  cols: number;
  rows: number;
};

// tmuxコマンド実行
type TmuxCommandMessage = {
  type: 'tmux';
  command: string;  // 'new-window', 'next-window', 'split-horizontal'等
};

// tmuxセッション情報要求
type SessionInfoRequest = {
  type: 'session-info';
};

type ClientMessage = InputMessage | ResizeMessage | TmuxCommandMessage | SessionInfoRequest;
```

#### サーバー → クライアント

```typescript
// ターミナル出力
type OutputMessage = {
  type: 'output';
  data: string;  // ターミナル出力（ANSI escape codes含む）
};

// 接続確立確認
type ConnectedMessage = {
  type: 'connected';
  message: string;
};

// tmuxセッション情報応答
type SessionInfoResponse = {
  type: 'session-info';
  data: TmuxSession;
};

// エラー通知
type ErrorMessage = {
  type: 'error';
  message: string;
};

type ServerMessage = OutputMessage | ConnectedMessage | SessionInfoResponse | ErrorMessage;
```

### 4.2 設定ファイル形式

#### server-config.json（バックエンド設定）

```json
{
  "port": 3102,
  "allowedOrigins": ["http://localhost:3101"]
}
```

補足:
- ログイントークンは `TERMINAL_TOKEN`（環境変数）で渡す（URLに載せない / 設定ファイルにも直書きしない）。

## 5. ファイル構成

### 5.1 プロジェクトルート構成

```
improved-terminal-system/
├─ frontend/                 # Next.jsフロントエンド
│  ├─ src/
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  └─ lib/
│  ├─ public/
│  │  └─ terminal-logo.svg
│  ├─ package.json
│  ├─ next.config.js
│  ├─ tailwind.config.js
│  └─ tsconfig.json
│
├─ backend/                  # Node.jsバックエンド
│  ├─ src/
│  │  ├─ server.ts
│  │  ├─ websocket.ts
│  │  ├─ pty-manager.ts
│  │  ├─ auth.ts
│  │  ├─ tmux-helper.ts
│  │  └─ config.ts
│  ├─ config/
│  │  └─ server-config.json
│  ├─ package.json
│  └─ tsconfig.json
│
├─ scripts/                  # セットアップスクリプト
│  ├─ setup.sh               # 初回セットアップ
│  ├─ start.sh               # サービス起動
│  └─ stop.sh                # サービス停止
│
├─ doc/                      # ドキュメント
│  ├─ improved-terminal-system-requirements.md  # 要件定義書
│  ├─ improved-terminal-system-design.md        # 技術設計書（本書）
│  └─ improved-terminal-system-implementation.md # 実装計画書（次作成）
│
└─ README.md                 # プロジェクト説明
```

## 6. API・インターフェース定義

### 6.1 WebSocket API

| イベント | 方向 | データ形式 | 説明 |
|---------|------|-----------|------|
| connection | C→S | - | WebSocket接続確立 |
| message | C↔S | ClientMessage/ServerMessage | メッセージ送受信 |
| close | C↔S | - | 接続切断 |
| error | C↔S | Error | エラー発生 |

### 6.2 tmux操作API（WebSocketメッセージ経由）

| コマンド | tmux実行内容 | 説明 |
|---------|------------|------|
| new-window | `Ctrl+b c` | 新規ウィンドウ作成 |
| next-window | `Ctrl+b n` | 次のウィンドウへ移動 |
| prev-window | `Ctrl+b p` | 前のウィンドウへ移動 |
| detach | `Ctrl+b d` | tmuxデタッチ |
| split-horizontal | `Ctrl+b %` | 縦分割 |
| split-vertical | `Ctrl+b "` | 横分割 |
| next-pane | `Ctrl+b o` | 次のペインへ移動 |
| zoom | `Ctrl+b z` | ペインズーム |
| copy-mode | `Ctrl+b [` | コピーモード |

### 6.3 認証API

#### トークン検証（HTTP→Cookieセッション）

- `POST /auth` にトークンを送信（HTTPS前提）
- 正しい場合は HttpOnly Cookie（セッション）を返す
- WebSocket 接続時は Cookie で認証

## 7. セキュリティ設計

### 7.1 認証・認可

- **固定トークン認証**: `POST /auth` で送信し、HttpOnly Cookie でセッション化（URLに載せない）
- **トークン検証**: Node.js（HTTP / WebSocket 接続時）
- **トークン管理**: `TERMINAL_TOKEN`（環境変数）
- **SSH認証**: 鍵認証必須、パスワード認証無効化

### 7.2 通信セキュリティ

- **HTTPS必須**: Tailscale VPN経由（自動TLS）
- **WebSocket over TLS**: wss://プロトコル使用
- **同一オリジンポリシー**: バックエンド側で `Origin` 制限（必要に応じて実装）

### 7.3 入力サニタイズ

- **XSS対策**: React自動エスケープ（dangerouslySetInnerHTML使用禁止）
- **コマンドインジェクション対策**: node-ptyがエスケープ処理

## 8. パフォーマンス設計

### 8.1 最適化戦略

- **静的ファイル配信**: Next.js（必要に応じて `next start` / CDNへ移行）
- **WebSocket接続**: Keep-Alive、Ping/Pong自動送信（30秒間隔）
- **ターミナルレンダリング**: xterm.jsの最適化機能活用（Canvas Renderer）
- **コード分割**: Next.js自動コード分割
- **画像最適化**: Next.js Image最適化

### 8.2 リソース制限

- **WebSocketメッセージサイズ**: 最大1MB（maxPayload: 1048576）
- **接続数制限**: 単一ユーザー想定（複数接続は同一セッション共有）
- **PTYバッファ**: デフォルト設定使用

## 9. 全画面モード設計

### 9.1 実装方式

- **Fullscreen API**: ブラウザ標準の `Element.requestFullscreen()` を使用。
- **UI統合**: ヘッダーの右側にトグルボタン `[ ]` を配置。
- **挙動**: 
  - ユーザー操作（クリック/タップ）をトリガーに全画面化。
  - アドレスバー、タブ、OSのステータスバー（モバイルブラウザによる）を非表示化し、ターミナル領域を最大化。
  - Escキーまたは再度ボタン押下で解除。

## 10. UI/UXデザイン仕様

### 10.1 配色（Claude風オレンジ系）

```css
/* カラーパレット */
--color-background: #1a1a2e;      /* ダーク背景 */
--color-surface: #16213e;         /* サーフェス */
--color-primary: #e94560;         /* プライマリ（ピンクがかったオレンジ） */
--color-secondary: #f39c12;       /* セカンダリ（オレンジ） */
--color-accent: #ff6b6b;          /* アクセント */
--color-text-primary: #eee;       /* メインテキスト */
--color-text-secondary: #aaa;     /* サブテキスト */
--color-terminal-bg: #0a0a0a;     /* ターミナル背景 */
--color-terminal-fg: #f0f0f0;     /* ターミナルテキスト */
```

### 10.2 レイアウト構成

```
┌───────────────────────────────────────────────────────┐
│  Header (最小限)                                       │
│  ┌─────────┬──────────────────────┬────────────────┐ │
│  │ Logo/タイトル │ 接続状態 ●          │ 設定 ⚙       │ │
│  └─────────┴──────────────────────┴────────────────┘ │
├───────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │                                                 │ │
│  │           xterm.js ターミナル表示               │ │
│  │                                                 │ │
│  │           (全画面の80%以上)                     │ │
│  │                                                 │ │
│  │                                                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
├───────────────────────────────────────────────────────┤
│  Control Panel (折りたたみ可能)                       │
│  ┌───────────────────────────────────────────────┐   │
│  │ [Ctrl] [Alt] [Esc] [Tab] [Enter] [↑][↓][←][→] │   │
│  │ [^C] [^D] [^Z] [Home] [End] [PgUp] [PgDn]     │   │
│  │ [Text入力] [tmux▼]                             │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  tmux Panel (展開時のみ表示)                          │
│  ┌───────────────────────────────────────────────┐   │
│  │ [c:新規] [n:次] [p:前] [d:デタッチ]            │   │
│  │ [%:縦分割] [":横分割] [o:ペイン] [z:ズーム]    │   │
│  │ [[:コピー]                                     │   │
│  └───────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

### 10.3 レスポンシブデザイン

- **モバイル（〜768px）**:
  - ターミナル全画面表示
  - コントロールパネルは下部固定
  - tmuxパネルはフルスクリーンモーダル
- **タブレット（768px〜1024px）**:
  - ターミナル + コントロールパネル縦並び
  - tmuxパネルはインライン展開
- **デスクトップ（1024px〜）**:
  - サイドバー配置オプション（コントロール右側）

### 10.4 アニメーション

- **パネル展開/折りたたみ**: 300ms ease-in-out
- **ボタンホバー**: 150ms ease
- **接続状態変化**: フェードイン/アウト 200ms

## 11. エラーハンドリング

### 11.1 エラー分類と対処

| エラー種別 | 検出方法 | ユーザー通知 | 再接続処理 |
|-----------|---------|-------------|-----------|
| WebSocket接続失敗 | connection error | トースト通知 + 接続状態アイコン | 自動再接続（5秒後、最大3回） |
| SSH接続失敗 | pty spawn error | モーダル表示 | 手動再接続ボタン |
| 認証失敗 | 401/1008 | リダイレクト to 認証エラーページ | なし（手動でトークン修正） |
| tmuxコマンド失敗 | tmux exit code | トースト通知 | なし |
| ネットワーク切断 | WebSocket close | 接続状態アイコン変化 | 自動再接続 |

### 11.2 自動再接続ロジック

```typescript
class WebSocketReconnect {
  private reconnectAttempts = 0;
  private maxAttempts = 3;
  private reconnectDelay = 5000; // 5秒

  async reconnect() {
    if (this.reconnectAttempts >= this.maxAttempts) {
      this.showErrorModal('接続に失敗しました。ページをリロードしてください。');
      return;
    }

    this.reconnectAttempts++;
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    try {
      await this.connect();
      this.reconnectAttempts = 0; // 成功したらリセット
    } catch (error) {
      this.reconnect(); // 再帰的に再試行
    }
  }
}
```

## 12. テスト戦略

### 12.1 テストレベル

- **単体テスト（Jest + React Testing Library）**:
  - コンポーネント単位のテスト
  - hooksのテスト
  - ユーティリティ関数のテスト
- **統合テスト（Playwright）**:
  - WebSocket通信のテスト
  - ターミナル操作のE2Eテスト
- **手動テスト**:
  - 実機（iPad/iPhone）での動作確認
  - IME入力の検証

### 12.2 テストカバレッジ目標

- **カバレッジ**: 80%以上
- **重点テスト箇所**:
  - WebSocket接続・再接続ロジック
  - IMEイベント処理
  - tmuxコマンド送信

## 13. デプロイ・運用

### 13.1 デプロイ手順

```bash
# 1. フロントエンドビルド
cd frontend
npm run build

# 2. バックエンドビルド
cd backend
npm run build

# 3. 起動（tmux内で）
tmux new-session -d -s terminal-system -n backend "cd backend && npm start"
tmux new-window -t terminal-system:1 -n frontend "cd frontend && PORT=3101 npm run start"
```

### 13.2 監視・ログ

- **バックエンドログ**: `backend/logs/app.log`（winston使用）
- **監視項目**:
  - WebSocket接続数
  - エラー発生率
  - 応答時間

## 14. 今後の拡張性

### 14.1 Phase 2以降の機能

- **ファイル転送**: ドラッグ&ドロップアップロード
- **複数タブ**: ブラウザタブ風のターミナルタブ
- **テーマカスタマイズ**: ユーザー独自の配色設定
- **キーボードショートカット設定**: カスタムキーバインド
- **履歴検索**: コマンド履歴のインクリメンタルサーチ

### 14.2 アーキテクチャ拡張

- **マルチユーザー対応**: トークン管理のデータベース化
- **セッション永続化**: Redisによるセッション管理
- **スケールアウト**: 複数バックエンドインスタンスのロードバランシング

---

## 次のステップ

**実装計画書（TDD準拠版）の作成**

技術設計書が完成したので、次は具体的な実装タスクをTDDサイクルに組み込んだ実装計画書を作成します。Phase 0（テスト環境構築）から段階的に実装を進める計画を立てます。
