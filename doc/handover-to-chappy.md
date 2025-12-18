# Webターミナルシステム デバッグ引き継ぎレポート

## 1. 現在の構成
- **フロントエンド**: Next.js 14 (App Router), xterm.js (Port: 3101)
- **バックエンド**: Node.js ESM, ws, node-pty (Port: 3102)
- **プロセス管理**: tmux セッション名 `terminal-system`
  - Window 0: backend
  - Window 1: frontend
 - **ログイントークン**: `./scripts/start.sh` が起動時に毎回ランダム発行（固定にしたい場合は `TERMINAL_TOKEN` を指定）

## 2. 発生している現象
- **現象**: ブラウザで `http://localhost:3101` を開くと WebSocket は接続されるが、ターミナル画面が真っ黒のまま。
- **確認済み事項**: 
  - ブラウザのコンソールログで `Received from WS: {type: output, data: ustar-wsl-2-2@STAR:~$ }` の受信は確認できている（通信は通っている）。
  - ブラウザで `TypeError: Cannot read properties of undefined (reading 'dimensions')` というエラーが xterm.js 内部で発生し続けている。
  - `ls` などのコマンドを打って Enter しても「無反応」に見えることがある。

## 3. チャッピー（Codex）による事前分析結果
1. **初期化レース**: xterm.js が DOM にマウントされ、インスタンスが生成される前にバックエンドから最初の文字（プロンプト）が届き、捨てられている。
2. **再接続ループ**: `useWebSocket.ts` の依存関係が不適切で、メッセージを受信して state を更新するたびに WebSocket が切断・再接続されている。これにより PTY セッションが毎回殺されている可能性がある。
3. **keepalive不備**: バックエンドの死活監視フラグが正しく管理されておらず、30秒で切断される設定になっている。

## 4. 直近の試行と失敗
- `FitAddon` を削除・コメントアウトしたが、`dimensions` エラーが消えない。
- `Terminal.tsx` を極限までシンプルにしたが、依然として描画されない。
- `TmuxPanel.tsx` の SVG パスのタイポ (`Loc` -> `M`) は修正済み。

## 5. チャッピーへのお願い
- `frontend/src/components/Terminal.tsx` の初期化フローを Next.js (App Router) に最適化してほしい。
- `frontend/src/hooks/useWebSocket.ts` の再接続ループを完全に止めてほしい。
- バックエンド (`backend/src/websocket.ts`) の PTY 出力と接続維持を安定させてほしい。

---

## 6. 根本原因（確定）

### 6.1 PTY が生成できない（致命）
- `node-pty` の `forkpty(3) failed` が発生し、PTY セッション生成が例外で落ちる。
- さらに Python の `pty.spawn()` でも `out of pty devices` になるため、**node-pty 固有ではなく、実行環境側で PTY デバイスが使えない**状態。
- その結果、WebSocket 接続後に PTY 生成でバックエンドが落ちたり、出力が一切返らず「真っ黒」に見える。

### 6.2 xterm の `dimensions` エラーは“ブロッカーではない”可能性
- 端末の描画が成立しない主因は PTY 側だった。
- ただし xterm 側の `Cannot read properties of undefined (reading 'dimensions')` は **継続監視対象**（発生しても描画自体が成立するケースあり）。

---

## 7. 対応（完了）

### 7.1 バックエンド：PTY 不可環境向けフォールバック実装
- PTY 生成に失敗した場合、例外で落とさずに **フォールバック（疑似シェル）**へ切り替える。
- これにより WebSocket を維持しつつ、初期プロンプト（`$`）を必ず返すので、フロントは「真っ黒」になりにくい。

### 7.2 フロントエンド：未認証時の挙動を明確化（Cookieセッション）
- 未認証の場合は WebSocket を開始しない（ログイン画面を表示）。
- ただしレイアウト（`terminal-container`）は表示しつつ、xterm だけは hidden にして E2E の期待と整合。

### 7.3 フロントエンド：ターミナル出力が落ちる問題を修正
- `ls` のように短時間で大量の出力が来ると、React state の更新がバッチされて **最後の1チャンクだけが残り**、中間の出力が落ちることがあった。
- 対策として WebSocket 出力を **バッファリング→drain** して xterm に流し込み、出力を欠落させないようにした。

### 7.4 共有リンク（QR）/ 1回だけ使えるトークン
- ログイン済みユーザー向けに `POST /link-token` を追加し、**ワンタイム・期限付き**の共有トークンを発行できるようにした。
- フロント側は `Share (QR)` から URL を表示/コピー/QR化できる。
- 互換として `/?token=...` は維持するが、ログイン成功後すぐ `history.replaceState` で URL から消す。

---

## 8. Playwright（pkaylight）での確認手順

### 8.1 まず E2E を回す（Chromium）
```bash
npm run test:e2e
```

### 8.2 特にターミナルの生存確認だけ回す
```bash
cd frontend
npx playwright test tests/debug-terminal.spec.ts
```

### 8.3 `ls` が無反応にならないことを確認
```bash
cd frontend
npx playwright test --config playwright.config.existing.ts tests/terminal-basic-commands.spec.ts
```

### 8.4 共有リンク（QR）のワンタイム性を確認
```bash
cd frontend
npx playwright test --config playwright.config.existing.ts tests/share-link-one-time.spec.ts
```

期待:
- `Terminal remains blank` が出ない
- ブラウザログに `Received from WS: {type: output, data: ...$ }` が出る

補足:
- 環境によっては `PW_ALL_BROWSERS=1` で全ブラウザ実行も可能（ただしブラウザの追加DLが必要）

---

## 9. 残タスク（次にやるなら）
- **本来の PTY / tmux 対応**: 実行環境で PTY が使える前提なら、フォールバックではなく `node-pty` を優先して使う（環境依存のため要確認）。
- **xterm の `dimensions` エラー**: 発生条件を Playwright のログ/スタックで特定して潰す（FitAddon / resize 周りが怪しい）。
