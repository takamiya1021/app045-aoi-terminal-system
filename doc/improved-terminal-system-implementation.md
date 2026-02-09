# 改良版Webターミナルシステム 実装記録（TDD準拠版）

## 0. 実装の概要

### 0.0 現状の仕様（運用に効く部分）

- ポート: フロント `3101`（nginx）、バックエンド `3102`（Express + WebSocket）
- 起動方法: Docker Compose（`docker-compose.ghcr.yml`）またはスクリプト（`scripts/start.sh`）
- ログイントークン:
  - `TERMINAL_TOKEN` 未指定なら開発用デフォルト（`valid_token`）を使用
  - 本番では `TERMINAL_TOKEN=... docker compose up` で固定トークンを渡す
- 認証方式:
  - `POST /auth` で `HttpOnly` Cookie（`its_session`）を発行
  - 通常セッションTTLは 24h、シェア用は 6h（バックエンド再起動で失効）
- 共有リンク（QR）:
  - `POST /link-token` で「ワンタイム + 期限付き」トークンを発行
  - 期限は `TERMINAL_LINK_TOKEN_TTL_SECONDS`（未指定5分）
  - フロントエンドから QR コードを生成し、共有リンクモーダルで表示
  - 起動時に `scripts/print-share-qr.sh` が共有URL+QRを自動出力（自分用ログインQRとして機能）
  - Tailscale前提で `TERMINAL_PUBLIC_BASE_URL` は MagicDNS/IP を自動採用（未指定時）

### 0.1 技術スタック（v2/v3）

| レイヤー | 技術 |
|----------|------|
| フロントエンド | Vite + React 18 + xterm.js + Tailwind CSS |
| バックエンド | Express + node-pty + WebSocket (ws) + SSH bridge |
| テスト | Jest (ts-jest) + Playwright |
| Docker | WSLネイティブDocker (docker-ce)、`network_mode: host` |
| フロントエンド配信 | Viteビルド → nginx（Docker）/ Vite dev server（開発時） |

### 0.2 TDD原則の適用

すべてのPhaseで **Red-Green-Refactor** サイクルを厳守：

1. **Red（失敗）**: 最もシンプルな失敗するテスト（単体・結合・E2E）を書く
2. **Green（成功）**: テストを通すコードを実装
3. **Refactor（改善）**: テストが通った後でのみリファクタリング

### 0.3 完了条件

各Phaseの完了条件：
- ✅ すべてのテスト（単体・E2E）がパス
- ✅ コンパイラ/リンターの警告がゼロ
- ✅ 単一の論理的作業単位を表現
- ✅ 動作する機能デモが可能

### 0.4 実装順序の方針

1. **テストファースト**: Jest（単体）とPlaywright（E2E）環境を最初に構築
2. **バックエンドファースト**: WebSocket/PTY基盤を先に構築
3. **段階的UI追加**: 基本ターミナル → コントロール → 高度な機能
4. **継続的統合**: 各Phase完了時点で動作するシステムを維持

### 0.5 工数見積もり

| Phase | 内容 | 予定工数 | 累計工数 | 状態 |
|-------|------|---------|---------|------|
| Phase 0 | テスト環境構築（E2E含む） | 4時間 | 4時間 | ✅ 完了 |
| Phase 1 | プロジェクト基盤 | 4時間 | 8時間 | ✅ 完了 |
| Phase 2 | バックエンド基本実装 | 8時間 | 16時間 | ✅ 完了 |
| Phase 3 | フロントエンド基本実装 | 10時間 | 26時間 | ✅ 完了 |
| Phase 4 | WebSocket統合 | 6時間 | 32時間 | ✅ 完了 |
| Phase 5 | 日本語IME対応 | 5時間 | 37時間 | ✅ 完了 |
| Phase 6 | コントロールパネル | 6時間 | 43時間 | ✅ 完了 |
| Phase 7 | tmux操作パネル | 5時間 | 48時間 | ✅ 完了 |
| Phase 8 | セッション管理UI | - | - | 🗑️ 削除済み |
| Phase 9 | 全画面モード・QR共有 | 3時間 | 51時間 | ✅ 完了 |
| Phase 10 | UI洗練・デザイン調整 | 5時間 | 56時間 | ✅ 完了 |
| Phase 11 | デプロイ（Docker） | 4時間 | 60時間 | ✅ 完了 |
| Phase 12 | 総合テスト・バグフィックス | 6時間 | 66時間 | ✅ 完了 |

---

## Phase 0: テスト環境構築（✅ 完了）

### マイルストーン
単体テスト(Jest)とE2Eテスト(Playwright)の実行環境が整い、サンプルテストが通る状態

### タスクリスト

#### 0.1 フロントエンドテスト環境

- [x] **Red**: Viteプロジェクト初期化、Jestインストール
  - `npm create vite@latest frontend -- --template react-ts`
  - `npm install --save-dev jest @testing-library/react @testing-library/jest-dom`
  - `npm install --save-dev @testing-library/user-event ts-jest jest-environment-jsdom`

- [x] **Green**: Jest設定ファイル作成
  - `jest.config.js` 作成（ts-jest使用、tsconfig inline指定で安定動作）
  - `jest.setup.ts` 作成
  - サンプルテスト作成
  - `npm test` で動作確認

- [x] **Refactor**: 設定の最適化
  - テストファイル命名規則確認
  - package.jsonのscripts整理

**実装メモ**:
- Next.jsではなくViteを使用。`jest.config.js`は`next/jest`ではなく`ts-jest`を使用
- tsconfig inlineで指定するのが安定（`jest.config.js`内に直接tsconfig設定を記載）
- モジュール解決: `moduleNameMapper`で`@/`パスエイリアスとCSS importに対応

#### 0.2 バックエンドテスト環境

- [x] **Red**: プロジェクト初期化、Jestインストール
  - `mkdir backend && cd backend && npm init -y`
  - TypeScript設定: `npm install --save-dev typescript @types/node`
  - Jest設定: `npm install --save-dev jest @types/jest ts-jest`

- [x] **Green**: Jest設定ファイル作成
  - `jest.config.cjs` 作成（ts-jest ESMプリセット使用）
  - サンプルテスト作成 `src/__tests__/sample.test.ts`
  - `npm test` で動作確認

- [x] **Refactor**: 設定の最適化
  - tsconfig.json調整（strict mode有効化）
  - バックエンドは`"type": "module"`のESMプロジェクト
  - `jest.config.cjs`（CommonJS形式）で`ts-jest/presets/default-esm`プリセットを使用

**実装メモ**:
- バックエンドはESM（`"type": "module"`）で統一
- `.js`拡張子のimportを`.ts`に解決するため`moduleNameMapper`設定が必要

#### 0.3 E2Eテスト環境（Playwright）

- [x] **Red**: Playwrightインストール
  - `npm init playwright@latest`（frontendディレクトリにて）

- [x] **Green**: Playwright設定
  - `playwright.config.ts` の調整（Base URL設定など）
  - サンプルE2Eテスト作成
  - `npx playwright test` で動作確認

- [x] **Refactor**: テストスクリプト統合

---

## Phase 1: プロジェクト基盤（✅ 完了）

### マイルストーン
プロジェクト構造が整い、基本的な型定義が完了

### タスクリスト

#### 1.1 ディレクトリ構造作成

- [x] **Red**: ディレクトリ構造テスト
  - `backend/src/__tests__/project-structure.test.ts` - 必要なディレクトリの存在確認テスト

- [x] **Green**: ディレクトリ作成
  ```
  frontend/
    src/components/, src/hooks/, src/lib/, src/app/, public/
  backend/
    src/, config/
  scripts/
  doc/
  ```

- [x] **Refactor**: README.md更新

**実装メモ**:
- Viteのディレクトリ構造に準拠: `src/`配下にコンポーネント・フック・ライブラリを配置
- Next.jsの`pages/`ディレクトリは不要（Viteは`src/App.tsx`がエントリポイント）

#### 1.2 型定義・インターフェース

- [x] **Red**: 型定義テスト
  - `frontend/src/lib/__tests__/types.test.ts` - 型の存在確認

- [x] **Green**: 型定義ファイル作成
  - `frontend/src/lib/types.ts`:
    ```typescript
    export type ClientMessage = InputMessage | ResizeMessage;
    export type ServerMessage = OutputMessage | ConnectedMessage | ErrorMessage;
    ```
  - `backend/src/types.ts`: 同様の型定義

- [x] **Refactor**: 型定義の整理

#### 1.3 設定ファイル

- [x] **Red**: 設定ファイル読み込みテスト
  - `backend/src/__tests__/config.test.ts`

- [x] **Green**: 設定ファイル実装
  - `backend/config/server-config.json` 作成
  - `backend/src/config.ts` 作成（設定読み込みモジュール）
  - `ALLOWED_ORIGINS`, `PORT`, `TERMINAL_TOKEN` 等の環境変数対応

- [x] **Refactor**: 環境変数対応

---

## Phase 2: バックエンド基本実装（✅ 完了）

### マイルストーン
WebSocketサーバーが起動し、接続テストが通る

### タスクリスト

#### 2.1 Expressサーバー

- [x] **Red**: サーバー起動テスト
  - `backend/src/__tests__/server.test.ts` - `/health`エンドポイント動作確認

- [x] **Green**: Expressサーバー実装
  - `backend/src/server.ts` 作成
  - CORS設定（`ALLOWED_ORIGINS`で複数オリジン対応、`credentials: true`）
  - `/health`, `/auth`, `/session`, `/logout`, `/link-token` エンドポイント

- [x] **Refactor**: エラーハンドリング追加
  - グローバルエラーハンドラー
  - ロギング（`backend/src/logger.ts`にてwinstonベースのロガー実装）

#### 2.2 WebSocketサーバー

- [x] **Red**: WebSocket接続テスト
  - `backend/src/__tests__/websocket.test.ts` - 接続確立テスト

- [x] **Green**: WebSocketサーバー実装
  - 依存関係: `ws`パッケージ使用
  - `backend/src/websocket.ts` 作成
  - Cookie認証によるWebSocket接続認証
  - 接続・切断・メッセージ送受信の基本実装

- [x] **Refactor**: メッセージ型検証
  - 受信メッセージの型チェック（`input`, `resize`メッセージに対応）

#### 2.3 PTY Manager

- [x] **Red**: PTY生成テスト
  - `backend/src/__tests__/pty-manager.test.ts`

- [x] **Green**: PTY Manager実装
  - 依存関係: `node-pty`
  - `backend/src/pty-manager.ts` 作成
  - SSH bridge対応（`TERMINAL_SSH_TARGET`でコンテナ→ホスト接続）
  - tmux自動起動（`TERMINAL_USE_TMUX`環境変数で制御）
  - PTY利用不可時のFallbackSession（簡易シェル）

- [x] **Refactor**: エラーハンドリング強化
  - SSH接続失敗時のフォールバック
  - リサイズ処理（不正なサイズの拒否）
  - 初期ターミナルサイズをモバイル寄り（38x20）に設定

**実装メモ**:
- v1のtmux-helper.tsは削除。tmux操作はフロントエンドからプレフィックスキー（`\x02`）をWebSocket経由で送信する方式に変更
- SSH bridgeモード: Dockerコンテナからホストマシンのbashへ接続するための仕組み

---

## Phase 3: フロントエンド基本実装（✅ 完了）

### マイルストーン
基本的なターミナル画面が表示され、xterm.jsが正しく初期化できる

### タスクリスト

#### 3.1 Terminalコンポーネント

- [x] **Red**: Terminalコンポーネントテスト
  - 単体: `frontend/src/components/__tests__/Terminal.test.tsx`（xterm.jsレンダリング確認）
  - E2E: ページロード後にターミナル要素が存在するか

- [x] **Green**: Terminalコンポーネント実装
  - 依存関係: `@xterm/xterm`, `@xterm/addon-fit`
  - `frontend/src/components/Terminal.tsx` 作成
  - xterm.js初期化、FitAddonによる自動リサイズ
  - `tick + drain` 方式でWebSocket出力の高速バッチ書き込みに対応
  - ResizeObserverでコンテナサイズ変更を検出

- [x] **Refactor**: コンポーネント分離・メモリリーク対策
  - xterm初期化ロジックはTerminal.tsx内にuseLayoutEffectで実装
  - cleanup処理（dispose、ResizeObserver disconnect）
  - requestAnimationFrameでコンテナ描画待ち

**実装メモ**:
- v1では`useTerminal`フックに分離していたが、v2ではTerminal.tsx内に統合。
  xterm.jsの初期化はDOMの描画タイミングに強く依存するため、useLayoutEffectでの一体管理が安定。
- `useTerminal.ts`フックは削除済み。

#### 3.2 Layoutコンポーネント

- [x] **Red**: Layoutテスト
  - `frontend/src/components/__tests__/Layout.test.tsx`

- [x] **Green**: Layout実装
  - `frontend/src/components/Layout.tsx` 作成
  - ヘッダー（タイトル + 操作ボタン）、メインエリア、フッター
  - VisualViewport APIで仮想キーボードのリサイズに追従
  - OfflineIndicatorコンポーネントを統合
  - ランタイムエラー表示機能（window.onerror/unhandledrejection捕捉）

- [x] **Refactor**: レスポンシブ対応
  - `100dvh` + VisualViewportの高さで動的にレイアウト調整

#### 3.3 メインページ（App.tsx）

- [x] **Red**: ページテスト

- [x] **Green**: メインページ実装
  - `frontend/src/App.tsx` 作成（Viteエントリポイント）
  - `frontend/src/main.tsx` でReactDOM.createRootによるマウント
  - Layout + Terminal + ControlPanel + TmuxPanel統合
  - 認証フロー（トークン入力 → /auth → Cookie設定 → WebSocket接続）
  - URLパラメータによる自動ログイン（`/?token=...`）

- [x] **Refactor**: モバイル対応
  - 仮想キーボード検出（VisualViewport API）
  - キーボード展開時にControlPanel/TmuxPanelを非表示化
  - スマホでの二重イベント発火防止（50ms以内の同一データをスキップ）

**実装メモ**:
- Next.jsの`pages/index.tsx`は不要。Viteでは`src/App.tsx`がルートコンポーネント

---

## Phase 4: WebSocket統合（✅ 完了）

### マイルストーン
フロント↔バック間でWebSocket通信が確立し、ターミナル操作が可能

### タスクリスト

#### 4.1 useWebSocket hook

- [x] **Red**: useWebSocketテスト
  - `frontend/src/hooks/__tests__/useWebSocket.test.ts`
  - 接続、メッセージ送受信、切断テスト

- [x] **Green**: useWebSocket実装
  - `frontend/src/hooks/useWebSocket.ts` 作成
  - WebSocket接続管理（URL空文字の場合は接続しない）
  - `sendMessage`でClientMessage型のJSONを送信
  - `onMessage`でServerMessage型を受信・パース
  - コールバックはuseRefで最新を保持（再レンダリング時のWebSocket再接続を防止）

- [x] **Refactor**: 安定化
  - URL変更時のみ再接続
  - 認証状態に連動したWebSocket URL制御

#### 4.2 認証実装

- [x] **Red**: 認証テスト
  - 単体: `backend/src/__tests__/server.test.ts`内の認証テスト
  - E2E: トークンなしでのアクセス拒否テスト

- [x] **Green**: 認証実装
  - `backend/src/auth.ts` 作成
  - 通常トークン認証 + ワンタイムリンクトークン（`createOneTimeLoginToken`）
  - HttpOnly Cookie（`its_session`）によるセッション管理
  - セッション: 通常24h / シェア用6h のTTL
  - WebSocket接続時もCookieで認証

- [x] **Refactor**: セキュリティ強化
  - `TERMINAL_COOKIE_SECURE`環境変数でSecure属性の手動制御
  - ワンタイムトークンの期限切れ自動クリーンアップ
  - `SameSite=Lax`設定

#### 4.3 E2E通信テスト

- [x] **Red**: E2E通信シナリオ
  - Playwrightで実際のWebSocket通信を検証

- [x] **Green**: テストパス確認

- [x] **Refactor**: テスト安定化

---

## Phase 5: 日本語IME対応（✅ 完了）

### マイルストーン
日本語入力が動作し、変換候補が適切に処理される

### タスクリスト

#### 5.1 IMEイベント処理

- [x] **Red**: IMEイベントテスト
  - `frontend/src/components/__tests__/Terminal-IME.test.tsx`

- [x] **Green**: IMEイベント処理実装
  - Terminal.tsxに`onCompositionStart`/`onCompositionEnd`ハンドラー追加
  - xterm.js内部のtextareaからバブルするcompositionEventを捕捉
  - 変換確定時（compositionEnd）にxterm.jsのonDataに流れない環境用の保険処理

- [x] **Refactor**: エッジケース対応
  - composing中のフラグ管理（isComposingRef）

**実装メモ**:
- Webベースを選択した理由: TermuxのSSHクライアントは日本語IMEとの相性が悪い。xterm.jsのcompositionEventで自前制御することで安定したIME入力を実現

#### 5.2 TextInputModalコンポーネント

- [x] **Red**: TextInputModalテスト
  - 単体: `frontend/src/components/__tests__/TextInputModal.test.tsx`
  - E2E: モーダルを開いて入力し、送信されるか確認

- [x] **Green**: TextInputModal実装
  - `frontend/src/components/TextInputModal.tsx` 作成
  - モーダル表示、textarea入力、送信処理
  - VisualViewport APIで仮想キーボードに追従するポジション制御

- [x] **Refactor**: UI改善
  - モバイルで仮想キーボード出現時もモーダルが見切れない配置

---

## Phase 6: コントロールパネル（✅ 完了）

### マイルストーン
特殊キーボタンが動作し、ターミナルにキー入力が送信される

### タスクリスト

#### 6.1 ControlPanelコンポーネント

- [x] **Red**: ControlPanelテスト
  - 単体: `frontend/src/components/__tests__/ControlPanel.test.tsx`
  - E2E: ボタンクリックでターミナルに信号が送られるか

- [x] **Green**: ControlPanel実装
  - `frontend/src/components/ControlPanel.tsx` 作成
  - 特殊キーボタン: Esc, Tab, Enter
  - ショートカットボタン: ^C（`\x03`）, ^D（`\x04`）, ^Z（`\x1a`）
  - 矢印キー: ▲▼◀▶（ANSIエスケープシーケンス送信）
  - IMEボタン（TextInputModalを開く）
  - 逆T字配列の矢印キーレイアウト

- [x] **Refactor**: UI洗練
  - ボタングループ化
  - focus ring（`focus:ring-orange-500`）
  - 最小タッチターゲット（`min-h-[36px]`）

#### 6.2 Terminal統合

- [x] **Red**: 統合テスト
  - ControlPanel → WebSocket → バックエンド

- [x] **Green**: 統合実装
  - App.tsxにControlPanel配置（`onSendKey`ハンドラーで`sendMessage`に接続）
  - キーボード展開時はControlPanelを非表示

- [x] **Refactor**: キーコード正規化

---

## Phase 7: tmux操作パネル（✅ 完了）

### マイルストーン
tmux操作ボタンが動作し、プレフィックスキー送信でtmuxコマンドが実行される

### タスクリスト

#### 7.1 TmuxPanelコンポーネント

- [x] **Red**: TmuxPanelテスト（ControlPanelテスト内で統合テスト）

- [x] **Green**: TmuxPanel実装
  - `frontend/src/components/TmuxPanel.tsx` 作成
  - tmuxプレフィックスキー（`\x02` = Ctrl+B）+ 操作キーをまとめて送信
  - tmux操作ボタン:
    - New Window（c）, Next Window（n）, Prev Window（p）
    - Sessions（s）, Split V（%）, Split H（"）
    - Swap Pane（o）, Zoom（z）, Scroll（[）, Detach（d）
  - 展開/折りたたみトグル
  - tmuxパネル展開時はControlPanelを非表示（排他表示）
  - tmuxパネル内にも Esc/Tab/Enter/IME/^C/^D/^Z/矢印キーを配置

- [x] **Refactor**: ボタンレイアウト最適化
  - グリッド配置
  - Detachボタンは赤色警告スタイル

**実装メモ**:
- v1ではバックエンドに`tmux-helper.ts`を置いてtmuxコマンドを実行していたが、v2ではフロントエンドからtmuxプレフィックスキー（Ctrl+B）+ 操作キーをWebSocket経由で送信する方式に変更。
- バックエンドの`tmux-helper.ts`は削除済み。
- スマホではキーボードを開かずに1タップでtmux操作が完結するのが利点。

---

## Phase 8: セッション管理UI（🗑️ 削除済み）

### 削除理由

v1で計画していた`SessionManager.tsx`コンポーネント（tmuxウィンドウ一覧表示・切り替えUI）は実装を見送り、削除された。

**代替手段**: tmux操作パネル（Phase 7）の `Sessions (s)` ボタンがtmuxのセッション選択画面を呼び出す。tmux自体のUIでウィンドウ一覧・切り替えが可能なため、専用のフロントエンドUIは不要と判断した。

削除されたファイル:
- `frontend/src/components/SessionManager.tsx`（未実装のまま削除）

---

## Phase 9: 全画面モード・QR共有（✅ 完了）

### マイルストーン
全画面表示とQRコード共有リンクが動作する

### タスクリスト

#### 9.1 全画面切り替え機能

- [x] **Green**: `requestFullscreen` / `exitFullscreen` 実装
  - App.tsx内の`toggleFullscreen`コールバック
  - ヘッダーに全画面切り替えボタンを配置

- [x] **Refactor**: ボタンデザインの調整（SVGアイコン使用）

#### 9.2 QR共有リンク機能

- [x] **Green**: ShareLinkModal実装
  - `frontend/src/components/ShareLinkModal.tsx` 作成
  - バックエンドの`/link-token`エンドポイントでワンタイムトークン発行
  - `qrcode`ライブラリでQRコード画像を生成
  - URL表示、クリップボードコピー機能
  - トークン有効期限の表示

- [x] **Refactor**: モバイルでの表示確認

#### 9.3 ヘッダーUI統合

- [x] **Green**: ヘッダー右側に操作ボタンを配置
  - 新しいタブで開くボタン
  - 全画面切り替えボタン
  - QR共有ボタン

---

## Phase 10: UI洗練・デザイン調整（✅ 完了）

### マイルストーン
モダンなデザインが適用され、レスポンシブ対応完了

### タスクリスト

#### 10.1 配色適用

- [x] **Green**: 配色実装
  - `frontend/src/app/globals.css`にTailwind設定・カスタムアニメーション定義
  - Slate系ダークテーマ（`bg-slate-900`, `text-slate-200`等）
  - アクセントカラー: Orange（ボタン・フォーカスリング）、Cyan（認証画面グロー効果）

- [x] **Refactor**: テーマ統一
  - ターミナル背景: `#0F172A`（slate-900相当）
  - 認証画面: グラデーション + グリッドパターン + グロー効果アニメーション

#### 10.2 レスポンシブデザイン

- [x] **Green**: レスポンシブ実装
  - Tailwindブレークポイント活用（`md:p-4`等）
  - モバイルファーストレイアウト
  - VisualViewport APIでキーボード出現時のレイアウト調整

- [x] **Refactor**: タッチ操作最適化
  - ボタンサイズ（`min-h-[36px]`）
  - `touch-action: none`でスクロール抑制（キーボード展開時）

#### 10.3 アニメーション

- [x] **Green**: アニメーション実装
  - パネル展開/折りたたみ（`transition-all duration-300`）
  - 認証画面の装飾アニメーション（`animate-gradient`, `animate-glow-pulse`, `animate-float`）
  - ボタンのhover/active状態（`transform hover:scale-[1.02] active:scale-[0.98]`）

#### 10.4 オフラインインジケーター

- [x] **Green**: OfflineIndicatorコンポーネント実装
  - `frontend/src/components/OfflineIndicator.tsx` 作成
  - `navigator.onLine`監視でオフライン状態を表示

---

## Phase 11: デプロイ（Docker）（✅ 完了）

### マイルストーン
Docker Composeで起動し、本番環境で動作確認

### タスクリスト

#### 11.1 Docker設定

- [x] **Green**: Dockerfile作成
  - `frontend/Dockerfile`: マルチステージビルド
    - ビルドステージ: node:20-bookworm-slim + Viteビルド
    - ランタイムステージ: nginx:alpine + 静的ファイル配信
  - `backend/Dockerfile`: マルチステージビルド
    - ビルドステージ: node:20-bookworm-slim + TypeScriptビルド（python3/make/g++はnode-ptyのネイティブビルドに必要）
    - ランタイムステージ: node:20-bookworm-slim + tmux + bash + openssh-client

- [x] **Green**: docker-compose.ghcr.yml作成
  - `network_mode: "host"`（WSLネイティブDocker対応）
  - バックエンド環境変数: `PORT`, `ALLOWED_ORIGINS`, `TERMINAL_TOKEN`, `TERMINAL_SSH_TARGET`, `TERMINAL_SSH_KEY`
  - SSH秘密鍵のボリュームマウント（`./backend/ssh_key:/app/ssh_key:ro`）

- [x] **Refactor**: エラーハンドリング
  - `entrypoint.sh`でSSH秘密鍵のパーミッション修正
  - `restart: unless-stopped`で自動再起動

**実装メモ**:
- WSLネイティブDocker（docker-ce）を使用。Docker Desktopではない。
- `network_mode: host`により、ホストのネットワークスタックを直接利用。ポートマッピング不要。
- SSH bridgeでコンテナからホストのbashに接続する構成。

#### 11.2 運用スクリプト

- [x] **Green**: スクリプト作成
  - `scripts/start.sh` - Docker Compose起動
  - `scripts/stop.sh` - Docker Compose停止
  - `scripts/install-docker.sh` - Docker環境セットアップ
  - `scripts/uninstall.sh` - アンインストール
  - `scripts/smoke-docker.sh` - Dockerスモークテスト
  - `scripts/print-share-qr.sh` - 起動時QR表示
  - `scripts/production-cli.sh` - 本番環境CLI

---

## Phase 12: 総合テスト・バグフィックス（✅ 完了）

### マイルストーン
すべての機能が正常動作、ドキュメント完備

### タスクリスト

#### 12.1 テスト網羅

- [x] 追加E2Eテスト実装
  - 接続 → ターミナル操作 → tmux操作 → 切断のフルフロー
  - 日本語入力テスト

#### 12.2 実機テスト

- [x] **手動テスト**: iPad/iPhoneでの動作確認
  - Tailscale VPN経由でアクセス
  - タッチ操作の快適性確認
  - IME入力の動作確認

- [x] **バグフィックス**: 発見されたバグの修正

#### 12.3 ドキュメント整備

- [x] **README.md更新**
  - インストール手順（curl | bashワンライン）
  - 使い方
  - トラブルシューティング

- [x] **使い方ガイド作成**
  - `doc/usage-guide.md`

---

## 13. リリースチェックリスト

### 13.1 機能チェック

- [x] ターミナル基本操作（入力・表示）
- [x] 日本語IME入力（compositionイベント処理）
- [x] 特殊キー操作（Ctrl, Alt, Esc等のControlPanel）
- [x] tmux操作（プレフィックスキー送信方式でウィンドウ作成・切り替え・分割）
- [x] 全画面モードの動作
- [x] QRコード共有リンク
- [x] URLパラメータ自動ログイン

### 13.2 品質チェック

- [x] すべてのテスト（単体・E2E）がパス
- [x] コンパイラ/リンター警告ゼロ
- [x] セキュリティ: HttpOnly Cookie、ワンタイムトークン

### 13.3 ドキュメントチェック

- [x] README.md完備
- [x] 使い方ガイド（`doc/usage-guide.md`）
- [x] 実装計画書更新（本書）

---

## 14. アーキテクチャ概要

### 14.1 フロントエンド構成

```
frontend/src/
├── main.tsx              # Reactエントリポイント（ReactDOM.createRoot）
├── App.tsx               # ルートコンポーネント（認証・WebSocket・状態管理）
├── app/
│   └── globals.css       # Tailwind CSS + カスタムアニメーション
├── components/
│   ├── Layout.tsx        # レイアウト（ヘッダー・フッター・VisualViewport対応）
│   ├── Terminal.tsx       # xterm.jsターミナル（FitAddon・IME対応）
│   ├── ControlPanel.tsx   # 特殊キーパネル（Esc/Tab/^C/矢印キー等）
│   ├── TmuxPanel.tsx      # tmux操作パネル（プレフィックスキー送信方式）
│   ├── TextInputModal.tsx # IMEテキスト入力モーダル
│   ├── ShareLinkModal.tsx # QR共有リンクモーダル
│   ├── OfflineIndicator.tsx # オフライン状態表示
│   └── __tests__/         # Jestテスト
├── hooks/
│   ├── useWebSocket.ts    # WebSocket接続管理フック
│   └── __tests__/         # Jestテスト
└── lib/
    ├── types.ts           # ClientMessage/ServerMessage型定義
    └── __tests__/         # Jestテスト
```

### 14.2 バックエンド構成

```
backend/src/
├── server.ts             # Expressサーバー + HTTPエンドポイント
├── websocket.ts          # WebSocketサーバー（Cookie認証・PTY接続）
├── pty-manager.ts        # PTYセッション管理（node-pty + SSH bridge + tmux）
├── auth.ts               # 認証（トークン検証・セッション管理・ワンタイムリンク）
├── config.ts             # 設定読み込み（環境変数 + server-config.json）
├── logger.ts             # ロギング
└── __tests__/            # Jestテスト
```

### 14.3 通信フロー

```
[ブラウザ]                [Docker: frontend]      [Docker: backend]        [ホストマシン]
  |                         nginx:3101              Express:3102
  |--- HTTP GET ----------->| 静的ファイル配信         |                        |
  |<-- HTML/JS/CSS ---------|                        |                        |
  |                                                  |                        |
  |--- POST /auth ---------------------------------->| トークン検証              |
  |<-- Set-Cookie: its_session ----------------------|                        |
  |                                                  |                        |
  |--- WebSocket ws://host:3102 ------------------->| Cookie認証               |
  |                                                  |--- SSH ------->| bash (tmux)
  |--- {type:"input", data:"ls\r"} ---------------->|--- PTY write -->|
  |<-- {type:"output", data:"..."} -----------------|<-- PTY data ---|
  |                                                  |                        |
  |--- {type:"input", data:"\x02c"} --------------->| (tmux prefix+c)        |
  |                                                  |--- PTY write -->| tmux new-window
```

---

## 15. リスク管理

### 15.1 技術リスクと対策

| リスク | 発生確率 | 影響度 | 対策 |
|--------|---------|--------|------|
| IME対応の不具合 | 中 | 高 | compositionイベントの保険処理、TextInputModalによるフォールバック入力 |
| WebSocket接続不安定 | 低 | 高 | エラー表示UI、セッション再チェック機能 |
| SSH bridge接続失敗 | 低 | 高 | FallbackSession（簡易シェル）でPTY不可時も最低限動作 |
| Docker/WSLの互換性 | 中 | 中 | `network_mode: host`で仮想ネットワーク問題を回避 |
| E2Eテストの不安定さ | 中 | 中 | 待機処理（await）の適切な使用、リトライ設定 |

### 15.2 設計判断の記録

| 判断 | 理由 |
|------|------|
| Webベース（xterm.js）採用 | TermuxのSSHクライアントは日本語IMEとの相性が悪い。compositionEventで自前制御 |
| QRコード認証 | ランダムトークンのスマホ手入力が苦痛。QRスキャンでワンタッチログイン |
| Docker使用 | 公開アプリの配布手段。curl\|bashで1行インストール。npmは野良パッケージ問題で却下 |
| ttyd不採用 | フロントエンドがCバイナリに埋め込み。IME/UIカスタマイズ不可 |
| Next.js → Vite移行 | SSR不要のSPA。Viteの方が軽量・高速・設定がシンプル |
| tmux-helper削除 | プレフィックスキー送信方式で十分。バックエンドの複雑さを削減 |
| SessionManager削除 | tmux自体のセッション選択UI（prefix+s）で代用可能 |
