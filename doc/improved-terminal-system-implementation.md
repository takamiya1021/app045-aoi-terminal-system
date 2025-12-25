# 改良版Webターミナルシステム 実装計画書（TDD準拠版）

## 0. 実装計画の概要

### 0.0 現状の仕様（運用に効く部分）

- ポート: フロント `3101`、バックエンド `3102`（Nginx/80番は前提にしない）
- 起動スクリプト: `./scripts/start.sh`（tmuxでフロント/バック起動）
- ログイントークン:
  - `TERMINAL_TOKEN` 未指定なら起動ごとにランダム生成して表示
  - 固定したい場合は `TERMINAL_TOKEN=... ./scripts/start.sh`
- 認証方式:
  - `POST /auth` で `HttpOnly` Cookie（`its_session`）を発行
  - セッションTTLは 24h（ただしバックエンド再起動で失効）
- 共有リンク（QR）:
  - `POST /link-token` で「ワンタイム + 期限付き」トークンを発行
  - 期限は `TERMINAL_LINK_TOKEN_TTL_SECONDS`（未指定5分）
  - 起動時に `scripts/print-share-qr.sh` が共有URL+QRを自動出力（自分用ログインQRとして機能）
  - Tailscale前提で `TERMINAL_PUBLIC_BASE_URL` は MagicDNS/IP を自動採用（未指定時）

### 0.1 TDD原則の適用

すべてのPhaseで **Red-Green-Refactor** サイクルを厳守：

1. **Red（失敗）**: 最もシンプルな失敗するテスト（単体・結合・E2E）を書く
2. **Green（成功）**: テストを通すコードを実装
3. **Refactor（改善）**: テストが通った後でのみリファクタリング

### 0.2 完了条件

各Phaseの完了条件：
- ✅ すべてのテスト（単体・E2E）がパス
- ✅ コードカバレッジ80%以上
- ✅ コンパイラ/リンターの警告がゼロ
- ✅ 単一の論理的作業単位を表現
- ✅ 動作する機能デモが可能

### 0.3 実装順序の方針

1. **テストファースト**: Jest（単体）とPlaywright（E2E）環境を最初に構築
2. **バックエンドファースト**: WebSocket/PTY基盤を先に構築
3. **段階的UI追加**: 基本ターミナル → コントロール → 高度な機能
4. **継続的統合**: 各Phase完了時点で動作するシステムを維持

### 0.4 工数見積もり

| Phase | 内容 | 予定工数 | 累計工数 |
|-------|------|---------|---------|
| Phase 0 | テスト環境構築（E2E含む） | 4時間 | 4時間 |
| Phase 1 | プロジェクト基盤 | 4時間 | 8時間 |
| Phase 2 | バックエンド基本実装 | 8時間 | 16時間 |
| Phase 3 | フロントエンド基本実装 | 10時間 | 26時間 |
| Phase 4 | WebSocket統合 | 6時間 | 32時間 |
| Phase 5 | 日本語IME対応 | 5時間 | 37時間 |
| Phase 6 | コントロールパネル | 6時間 | 43時間 |
| Phase 7 | tmux操作パネル | 5時間 | 48時間 |
| Phase 8 | セッション管理UI | 6時間 | 54時間 |
| Phase 9 | UI洗練・デザイン調整 | 5時間 | 63時間 |
| Phase 10 | デプロイ（プロキシなし） | 4時間 | 67時間 |
| Phase 11 | 総合テスト・バグフィックス | 6時間 | 73時間 |

**合計予定工数**: 69時間（約9日間の作業）

---

## Phase 0: テスト環境構築（予定工数: 4時間）

### マイルストーン
単体テスト(Jest)とE2Eテスト(Playwright)の実行環境が整い、サンプルテストが通る状態

### タスクリスト

#### 0.1 フロントエンドテスト環境（1.5時間）

- [x] **Red**: プロジェクト初期化、Jestインストール
  - `npx create-next-app@14 frontend --typescript --tailwind --app`
  - `npm install --save-dev jest @testing-library/react @testing-library/jest-dom`
  - `npm install --save-dev @testing-library/user-event`

- [x] **Green**: Jest設定ファイル作成
  - `jest.config.js` 作成
  - `setupTests.ts` 作成
  - サンプルテスト作成 `__tests__/sample.test.tsx`（常にpassするテスト）
  - `npm test` で動作確認

- [x] **Refactor**: 設定の最適化
  - カバレッジ設定追加（threshold: 80%）
  - テストファイル命名規則確認
  - package.jsonのscripts整理

#### 0.2 バックエンドテスト環境（1.5時間）

- [x] **Red**: プロジェクト初期化、Jestインストール
  - `mkdir backend && cd backend && npm init -y`
  - TypeScript設定: `npm install --save-dev typescript @types/node ts-node`
  - `npx tsc --init`
  - Jest設定: `npm install --save-dev jest @types/jest ts-jest`

- [x] **Green**: Jest設定ファイル作成
  - `jest.config.js` 作成（ts-jest使用）
  - サンプルテスト作成 `src/__tests__/sample.test.ts`
  - `npm test` で動作確認

- [x] **Refactor**: 設定の最適化
  - tsconfig.json調整（strict mode有効化）
  - カバレッジ設定追加
  - ESLint + Prettier追加

#### 0.3 E2Eテスト環境（Playwright）（1時間）

- [x] **Red**: Playwrightインストール
  - `npm init playwright@latest` (frontendディレクトリにて)

- [x] **Green**: Playwright設定
  - `playwright.config.ts` の調整（Base URL設定など）
  - サンプルE2Eテスト作成 `tests/example.spec.ts`
  - `npx playwright test` で動作確認

- [x] **Refactor**: テストスクリプト統合
  - プロジェクトルートからE2Eテストを実行できるスクリプト追加

---

## Phase 1: プロジェクト基盤（予定工数: 4時間）

### マイルストーン
プロジェクト構造が整い、基本的な型定義が完了

### タスクリスト

#### 1.1 ディレクトリ構造作成（1時間）

- [x] **Red**: ディレクトリ構造テスト
  - `__tests__/project-structure.test.ts` - 必要なディレクトリの存在確認テスト

- [x] **Green**: ディレクトリ作成
  ```bash
  frontend/
    pages/, components/, hooks/, lib/, styles/, public/
  backend/
    src/, config/
  scripts/
  doc/
  ```

- [x] **Refactor**: README.md更新
  - プロジェクト構造説明追加

#### 1.2 型定義・インターフェース（2時間）

- [x] **Red**: 型定義テスト
  - `frontend/lib/__tests__/types.test.ts` - 型の存在確認

- [x] **Green**: 型定義ファイル作成
  - `frontend/lib/types.ts`:
    ```typescript
    export type ClientMessage = InputMessage | ResizeMessage | TmuxCommandMessage | SessionInfoRequest;
    export type ServerMessage = OutputMessage | ConnectedMessage | SessionInfoResponse | ErrorMessage;
    // ... 他の型定義
    ```
  - `backend/src/types.ts`: 同様の型定義

- [x] **Refactor**: 型定義の整理
  - 共通型の抽出
  - JSDoc追加

#### 1.3 設定ファイル（1時間）

- [x] **Red**: 設定ファイル読み込みテスト
  - `backend/src/__tests__/config.test.ts`

- [x] **Green**: 設定ファイル実装
  - `backend/config/server-config.json` 作成
  - `backend/src/config.ts` 作成（設定読み込みモジュール）

- [x] **Refactor**: 環境変数対応
  - dotenv導入
  - .env.example作成

---

## Phase 2: バックエンド基本実装（予定工数: 8時間）

### マイルストーン
WebSocketサーバーが起動し、接続テストが通る

### タスクリスト

#### 2.1 Expressサーバー（2時間）

- [x] **Red**: サーバー起動テスト
  - `backend/src/__tests__/server.test.ts` - サーバーが起動するか確認

- [x] **Green**: Expressサーバー実装
  - `backend/src/server.ts` 作成
  - 依存関係インストール: `npm install express`
  - 基本的なHTTPサーバー起動

- [x] **Refactor**: エラーハンドリング追加
  - グローバルエラーハンドラー
  - ロギング（winston導入）

#### 2.2 WebSocketサーバー（3時間）

- [x] **Red**: WebSocket接続テスト
  - `backend/src/__tests__/websocket.test.ts` - 接続確立テスト

- [x] **Green**: WebSocketサーバー実装
  - 依存関係: `npm install ws @types/ws`
  - `backend/src/websocket.ts` 作成
  - 接続・切断・メッセージ送受信の基本実装

- [x] **Refactor**: メッセージ型検証
  - 受信メッセージの型チェック
  - Ping/Pong実装

#### 2.3 PTY Manager（3時間）

- [x] **Red**: PTY生成テスト
  - `backend/src/__tests__/pty-manager.test.ts`

- [x] **Green**: PTY Manager実装
  - 依存関係: `npm install node-pty @types/node-pty`
  - `backend/src/pty-manager.ts` 作成
  - SSH接続経由でシェル起動

- [x] **Refactor**: エラーハンドリング強化
  - SSH接続失敗時の再接続ロジック
  - リサイズ処理

---

## Phase 3: フロントエンド基本実装（予定工数: 10時間）

### マイルストーン
基本的なターミナル画面が表示され、ダミーデータが表示できる

### タスクリスト

#### 3.1 Terminalコンポーネント（4時間）

- [x] **Red**: Terminalコンポーネントテスト
  - 単体: `frontend/components/__tests__/Terminal.test.tsx` (xterm.jsレンダリング確認)
  - E2E: `tests/terminal.spec.ts` (ページロード後にターミナル要素が存在するか)

- [x] **Green**: Terminalコンポーネント実装
  - 依存関係: `npm install xterm @xterm/xterm @xterm/addon-fit`
  - `frontend/components/Terminal.tsx` 作成
  - xterm.js初期化、基本表示

- [x] **Refactor**: コンポーネント分離
  - ターミナル初期化ロジックをhooksに抽出

#### 3.2 useTerminal hook（2時間）

- [x] **Red**: useTerminal hookテスト
  - `frontend/hooks/__tests__/useTerminal.test.ts`

- [x] **Green**: useTerminal実装
  - `frontend/hooks/useTerminal.ts` 作成
  - xterm.js初期化ロジック
  - リサイズ処理

- [x] **Refactor**: メモリリーク対策
  - cleanup処理の追加

#### 3.3 Layoutコンポーネント（2時間）

- [x] **Red**: Layoutテスト
  - `frontend/components/__tests__/Layout.test.tsx`

- [x] **Green**: Layout実装
  - `frontend/components/Layout.tsx` 作成
  - ヘッダー、メインエリア、フッターのレイアウト

- [x] **Refactor**: レスポンシブ対応
  - Tailwindブレークポイント活用

#### 3.4 メインページ（2時間）

- [x] **Red**: ページテスト
  - `frontend/__tests__/index.test.tsx`
  - E2E: レイアウト崩れがないか確認

- [x] **Green**: メインページ実装
  - `frontend/pages/index.tsx` 作成
  - Layout + Terminal統合

- [x] **Refactor**: SEO対応
  - meta tags追加

---

## Phase 4: WebSocket統合（予定工数: 6時間）

### マイルストーン
フロント↔バック間でWebSocket通信が確立し、ダミーメッセージのやり取りができる

### タスクリスト

#### 4.1 useWebSocket hook（3時間）

- [x] **Red**: useWebSocketテスト
  - `frontend/hooks/__tests__/useWebSocket.test.ts`
  - 接続、メッセージ送受信、切断テスト

- [x] **Green**: useWebSocket実装
  - `frontend/hooks/useWebSocket.ts` 作成
  - WebSocket接続管理
  - メッセージ送受信

- [x] **Refactor**: 再接続ロジック
  - 自動再接続実装（5秒後、最大3回）

#### 4.2 認証実装（2時間）

- [x] **Red**: 認証テスト
  - 単体: `backend/src/__tests__/auth.test.ts`
  - E2E: トークンなしでのアクセス拒否テスト

- [x] **Green**: 認証実装
  - `backend/src/auth.ts` 作成
  - トークン検証ロジック

- [x] **Refactor**: セキュリティ強化
  - トークン環境変数化

#### 4.3 E2E通信テスト（1時間）

- [x] **Red**: E2E通信シナリオ
  - `tests/websocket-communication.spec.ts`
  - バックエンドとフロントエンドを起動し、メッセージが往復することを確認

- [x] **Green**: テストパス確認
  - Playwrightで実際のWebSocket通信を検証

- [x] **Refactor**: テスト安定化
  - タイムアウト調整

---

## Phase 5: 日本語IME対応（予定工数: 5時間）

### マイルストーン
日本語入力が完璧に動作し、変換候補が適切に表示される

### タスクリスト

#### 5.1 IMEイベント処理（3時間）

- [x] **Red**: IMEイベントテスト
  - `frontend/components/__tests__/Terminal-IME.test.tsx`

- [x] **Green**: IMEイベント処理実装
  - Terminal.tsxにcompositionイベントハンドラー追加
  - 確定前文字の表示処理

- [x] **Refactor**: エッジケース対応
  - 変換中のキャンセル処理

#### 5.2 TextInputModalコンポーネント（2時間）

- [x] **Red**: TextInputModalテスト
  - 単体: `frontend/components/__tests__/TextInputModal.test.tsx`
  - E2E: モーダルを開いて入力し、送信されるか確認

- [x] **Green**: TextInputModal実装
  - `frontend/components/TextInputModal.tsx` 作成
  - モーダル表示、textarea入力、送信処理

- [x] **Refactor**: UI改善
  - モーダルアニメーション追加

---

## Phase 6: コントロールパネル（予定工数: 6時間）

### マイルストーン
特殊キーボタンが動作し、ターミナルにキー入力が送信される

### タスクリスト

#### 6.1 ControlPanelコンポーネント（4時間）

- [x] **Red**: ControlPanelテスト
  - 単体: `frontend/components/__tests__/ControlPanel.test.tsx`
  - E2E: ボタンクリックでターミナルに信号が送られるか

- [x] **Green**: ControlPanel実装
  - `frontend/components/ControlPanel.tsx` 作成
  - 特殊キーボタン（Ctrl, Alt, Esc, Tab, Enter）
  - 矢印キー、ナビゲーションキー
  - ショートカットボタン（^C, ^D, ^Z）

- [x] **Refactor**: UI洗練
  - ボタングループ化
  - ホバーエフェクト

#### 6.2 Terminal統合（2時間）

- [x] **Red**: 統合テスト
  - ControlPanel → Terminal → WebSocket → バックエンド

- [x] **Green**: 統合実装
  - pages/index.tsxにControlPanel追加
  - onKeyPressハンドラー実装

- [x] **Refactor**: キーコード正規化
  - ブラウザ差異吸収

---

## Phase 7: tmux操作パネル（予定工数: 5時間）

### マイルストーン
tmux操作ボタンが動作し、tmuxコマンドが実行される

### タスクリスト

#### 7.1 TmuxPanelコンポーネント（3時間）

- [x] **Red**: TmuxPanelテスト
  - `frontend/components/__tests__/TmuxPanel.test.tsx`

- [x] **Green**: TmuxPanel実装
  - `frontend/components/TmuxPanel.tsx` 作成
  - tmux基本操作ボタン（c, n, p, d, %, ", o, z, [）
  - 展開/折りたたみアニメーション

- [x] **Refactor**: ボタンレイアウト最適化
  - グリッド配置

#### 7.2 tmuxヘルパー（バックエンド）（2時間）

- [x] **Red**: tmuxヘルパーテスト
  - 単体: `backend/src/__tests__/tmux-helper.test.ts`
  - E2E: ボタン操作で実際にtmuxウィンドウが増えるか検証（可能なら）

- [x] **Green**: tmuxヘルパー実装
  - `backend/src/tmux-helper.ts` 作成
  - tmuxコマンド実行関数
  - セッション情報取得関数

- [x] **Refactor**: エラーハンドリング
  - tmuxコマンド失敗時の適切なエラー返却

---

## Phase 8: セッション管理UI（予定工数: 6時間）

### マイルストーン
tmuxセッション・ウィンドウ一覧が表示され、切り替えが可能

### タスクリスト

#### 8.1 SessionManagerコンポーネント（4時間）

- [x] **Red**: SessionManagerテスト
  - `frontend/components/__tests__/SessionManager.test.tsx`

- [x] **Green**: SessionManager実装
  - `frontend/components/SessionManager.tsx` 作成
  - tmuxウィンドウ一覧表示
  - アクティブウィンドウハイライト
  - ウィンドウ切り替えボタン

- [x] **Refactor**: UI改善
  - ウィンドウ名編集機能追加

#### 8.2 セッション情報取得（2時間）

- [x] **Red**: セッション情報APIテスト
  - WebSocketメッセージ'session-info'のテスト

- [x] **Green**: セッション情報取得実装
  - バックエンドでtmux list-windows実行
  - JSON形式で返却

- [x] **Refactor**: 定期更新
  - 5秒ごとにセッション情報更新

---

## Phase 9: 全画面モード対応（予定工数: 2時間）

### マイルストーン
ブラウザの全画面表示機能により、没入感のあるターミナル操作が可能

### タスクリスト

#### 9.1 全画面切り替え機能（1時間）

- [x] **Red**: 全画面切り替えAPIの動作テスト
- [x] **Green**: `requestFullscreen` / `exitFullscreen` 実装
- [x] **Refactor**: ボタンデザインの調整

#### 9.2 UI統合（1時間）

- [x] **Green**: ヘッダーに全画面切り替えボタンを追加
- [x] **Refactor**: モバイルでの表示確認

---

## Phase 10: UI洗練・デザイン調整（予定工数: 5時間）

### マイルストーン
Claude風のモダンなデザインが適用され、レスポンシブ対応完了

### タスクリスト

#### 10.1 配色適用（2時間）

- [x] **Red**: 配色テスト
  - CSS変数が定義されているか確認

- [x] **Green**: 配色実装
  - `frontend/styles/globals.css`に配色定義
  - 各コンポーネントに適用

- [x] **Refactor**: ダークモード対応
  - システム設定に応じたテーマ切り替え

#### 10.2 レスポンシブデザイン（2時間）

- [x] **Red**: レスポンシブテスト
  - E2E: モバイル・タブレット・デスクトップサイズでのスクリーンショット比較

- [x] **Green**: レスポンシブ実装
  - Tailwindブレークポイント活用
  - モバイルファーストレイアウト

- [x] **Refactor**: タッチ操作最適化
  - ボタンサイズ調整（最小44x44px）

#### 10.3 アニメーション（1時間）

- [x] **Red**: アニメーションテスト
  - パネル展開/折りたたみのスムーズさ確認

- [x] **Green**: アニメーション実装
  - Tailwind transition活用
  - フェードイン/アウト

- [x] **Refactor**: パフォーマンス最適化
  - will-change使用

---

## Phase 11: デプロイ（プロキシなし）（予定工数: 4時間）

### マイルストーン
ポート固定でアクセス可能、本番環境で動作確認

### タスクリスト

#### 11.1 デプロイスクリプト（2時間）

- [x] **Red**: デプロイスクリプトテスト
  - スクリプト実行の確認

- [x] **Green**: デプロイスクリプト実装
  - `scripts/setup.sh` 作成（package.jsonのsetupスクリプトとして実装）
  - `scripts/start.sh` 作成
  - `scripts/stop.sh` 作成

- [x] **Refactor**: エラーハンドリング
  - 各ステップの成功/失敗確認

---

## Phase 12: 総合テスト・バグフィックス（予定工数: 6時間）

### マイルストーン
すべての機能が正常動作、バグゼロ、ドキュメント完備

### タスクリスト

#### 12.1 E2Eテストシナリオ網羅（2時間）

- [x] **Red**: 未カバーのシナリオ特定
  - 入力エッジケース、長時間の接続維持など

- [x] **Green**: 追加E2Eテスト実装
  - 接続 → ターミナル操作 → tmux操作 → 切断のフルフロー
  - 日本語入力テスト
  - PWAインストールテスト

- [x] **Refactor**: テスト安定化
  - タイムアウト調整、リトライ設定

#### 12.2 実機テスト（2時間）

- [x] **手動テスト**: iPad/iPhoneでの動作確認
  - Tailscale VPN経由でアクセス
  - タッチ操作の快適性確認
  - IME入力の動作確認

- [x] **バグフィックス**: 発見されたバグの修正

#### 12.3 ドキュメント整備（2時間）

- [x] **README.md更新**
  - インストール手順
  - 使い方
  - トラブルシューティング

- [x] **コードコメント追加**
  - 主要関数にJSDoc追加

---

## 13. リリース準備チェックリスト

### 13.1 機能チェック

- [x] ターミナル基本操作（入力・表示）
- [x] 日本語IME入力
- [x] 特殊キー操作（Ctrl, Alt, Esc等）
- [x] tmux操作（ウィンドウ作成・切り替え・分割）
- [x] セッション管理UI（ウィンドウ一覧・切り替え）
- [x] 全画面モードの動作

### 13.2 品質チェック

- [x] テストカバレッジ80%以上
- [x] すべてのテスト（単体・E2E）がパス
- [x] コンパイラ/リンター警告ゼロ
- [x] セキュリティ脆弱性スキャン（npm audit）
- [x] パフォーマンス計測（Lighthouse: 90点以上）

### 13.3 ドキュメントチェック

- [x] README.md完備
- [x] 要件定義書更新
- [x] 技術設計書更新
- [x] 実装計画書更新（本書）

---

## 14. 進捗管理

### 14.1 週次マイルストーン

| 週 | 完了予定Phase | 累計工数 | 主要成果物 |
|----|-------------|---------|-----------|
| 1週目 | Phase 0-2 | 16時間 | テスト環境(E2E含) + バックエンド基盤 |
| 2週目 | Phase 3-5 | 37時間 | フロントエンド基盤 + IME対応 |
| 3週目 | Phase 6-8 | 54時間 | コントロールパネル + セッション管理 |
| 4週目 | Phase 9-11 | 69時間 | 総合テスト + リリース |

### 14.2 日次レビュー

各作業日終了時に以下を確認：

- [ ] 今日のタスク完了状況（チェックボックス確認）
- [ ] テスト（単体・E2E）がすべてパスしているか
- [ ] コミットメッセージが明確か
- [ ] 明日のタスクが明確か

---

## 15. リスク管理

### 15.1 技術リスクと対策

| リスク | 発生確率 | 影響度 | 対策 |
|--------|---------|--------|------|
| IME対応の不具合 | 中 | 高 | xterm.js公式ドキュメント参照、早期テスト |
| WebSocket接続不安定 | 低 | 高 | 再接続ロジック強化、タイムアウト調整 |
| ポート設定ミス | 低 | 中 | 3101/3102固定、起動手順の明文化、疎通チェック（/health） |

| **E2Eテストの不安定さ** | 中 | 中 | **待機処理（await）の適切な使用、リトライ設定** |

---

## 次のステップ

**Phase 0: テスト環境構築** から実装を開始します。

あおいさんの指示を待って、Phase 0のタスクを順次実行していきます。
