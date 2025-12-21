# クロからチャッピーへの引き継ぎレポート：カーソル表示問題

## 問題概要
スマホ（android）でWebターミナルにアクセスした際、カーソルの表示と動作に深刻な問題があります。

## 症状の詳細

### 初期症状（修正前）
1. カーソルが常に一番左側に固定
2. カーソルが棒状（bar）で表示
3. 文字入力してもカーソル位置が移動しない

### 1回目修正後の症状
1. `l`入力 → `l`の左側に**棒状**カーソル表示
2. `s`入力 → カーソル位置は`l`の左側のまま（棒状）
3. `Enter`1回目 → `s`の右側に**四角い**カーソルが現れる
4. `Enter`2回目 → やっとコマンド実行（`ls`結果表示）

### 2回目修正後の症状
**変わらず**（上記と同じ症状）

### 期待する動作
- 文字入力時、カーソルは常に文字の右側に移動
- カーソルは常に四角い形状（block）
- `Enter`は1回でコマンド実行

## 実施した修正

### 1回目の修正
**ファイル**: `frontend/src/components/Terminal.tsx`

**変更内容**:
```typescript
// 削除
screenReaderMode: isMobile,

// 追加
cursorStyle: 'block',
```

**結果**: 少し改善（カーソルが四角になるタイミングがあるが、まだ問題あり）

### 2回目の修正（チャッピー推奨事項を実装）
**ファイル**: `frontend/src/components/Terminal.tsx`

**変更内容**:
```typescript
terminal = new Terminal({
  cursorBlink: true,
  cursorStyle: 'block', // 四角いカーソル
  cursorInactiveStyle: 'block', // フォーカス外でも四角を維持（モバイル対策）
  theme: { background: '#0F172A', foreground: '#F3F4F6' },
  // convertEol: true, // PTY側で処理されるため削除（チャッピー推奨）
  scrollback: 5000,
});

// 中略

// Android Chrome対策: textareaの入力補正を無効化（チャッピー推奨）
const textarea = terminal.textarea;
if (textarea) {
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');
  textarea.inputMode = 'text';
  // ネイティブ棒カーソルを非表示にする
  textarea.style.caretColor = 'transparent';
}
```

**実装した項目**:
1. ✅ `convertEol: true` を削除（PTY側で処理）
2. ✅ `cursorInactiveStyle: 'block'` を追加
3. ✅ textarea設定（autocapitalize, autocorrect, spellcheck, inputMode）
4. ✅ `caret-color: transparent` でネイティブ棒カーソルを非表示

**結果**: **NG、変わらず**

## チャッピーからの分析結果（MCP相談時）

### 原因の特定（※iOS Safari前提の回答だったため、Android Chromeでは異なる可能性あり）
1. **モバイルブラウザのキーボードイベント不安定性**
   - xterm.jsは内部textareaで入力を拾う仕組み
   - ネイティブキャレット（棒）とxtermカーソル（block）が二重化

2. **Enterキー2回問題**
   - 最初のEnterが「確定」扱いになる
   - 2回目でやっとコマンド送信される

### チャッピーからの追加質問（未回答）
1. 入力処理、`term.onData` で送ってる？それとも `term.onKey` で自前処理？
2. `attachCustomKeyEventHandler` で Enter を止めたりしてない？
3. xterm.js のバージョンと **Android/Chrome のバージョン**は？

## 現在のコード状態

### Terminal.tsx（主要部分）
```typescript
// Line 123-130
terminal = new Terminal({
  cursorBlink: true,
  cursorStyle: 'block',
  cursorInactiveStyle: 'block',
  theme: { background: '#0F172A', foreground: '#F3F4F6' },
  // convertEol: true, // コメントアウト
  scrollback: 5000,
});

// Line 140-149
const textarea = terminal.textarea;
if (textarea) {
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');
  textarea.inputMode = 'text';
  textarea.style.caretColor = 'transparent';
}

// Line 151
dataDisposable = terminal.onData((data) => onDataRef.current?.(data));
```

**確認事項**:
- ✅ `term.onData` で入力を送信（Line 164）
- ✅ `attachCustomKeyEventHandler` は使用していない
- ❓ xterm.jsバージョン: `@xterm/xterm: ^5.5.0`（package.json確認済み）
- ❓ **Android/Chromeバージョン**: 確認必要

## 環境情報

### バージョン情報
**フロントエンド** (`frontend/package.json`):
```json
{
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/xterm": "^5.5.0",
  "next": "14.2.35",
  "react": "^18"
}
```

**バックエンド** (`backend/package.json`):
```json
{
  "express": "^5.2.1",
  "node-pty": "^1.0.0",
  "ws": "^8.18.3"
}
```

### ネットワーク構成
- **WSL2 Ubuntu** (バックエンド)
- **Windows** (Tailscaleインストール)
- **スマホ** → Tailscale経由 → Windows → WSL2
- **ポート**: フロントエンド 3101, バックエンド 3102

### 現在のサーバー状態
- **tmuxセッション**: terminal-system
- **ログイントークン**: I-5nYIqNqfpiaRjo7c-NV3sT18aPzYGT
- **Tailscale IP**: 100.104.86.8
- **アクセスURL**: http://100.104.86.8:3101

## 関連ファイル

### 主要ファイル
1. `frontend/src/components/Terminal.tsx` - ターミナルコンポーネント（問題の中心）
2. `frontend/src/app/page.tsx` - メインページ（WebSocket接続）
3. `backend/src/websocket.ts` - WebSocketハンドラー
4. `backend/src/pty-manager.ts` - PTY管理

### ドキュメント
1. `doc/improved-terminal-system-requirements.md` - 要件定義
2. `doc/handoff-to-chappie.md` - 前回の引き継ぎ（CORS問題）

## 未調査・未確認事項

### xterm.js関連
1. **xterm.jsのバージョン詳細確認**
   - 現在: `@xterm/xterm: ^5.5.0`
   - **Android Chrome対応状況**の確認
   - 既知の問題（GitHub Issues）

2. **入力処理フローの詳細確認**
   - `term.onData` の詳細な動作
   - composition イベントの処理（IME関連）
   - WebSocketとの同期

3. **Android Chrome特有の問題**
   - selectionchange イベントの影響
   - フォーカス管理の問題
   - 仮想キーボードとの相互作用
   - Gboardなど入力メソッドとの相互作用

### 可能性のある原因

1. **xterm.jsの内部textareaとネイティブUIの競合**
   - textarea のフォーカス管理
   - selection/range の処理
   - **Android Chrome の入力確定メカニズム**（Gboard等の入力メソッドとの相互作用）

2. **WebSocket経由の入力遅延**
   - ネットワーク遅延によるカーソル位置のズレ
   - バッファリングの問題

3. **tmux統合の問題**
   - tmuxのエスケープシーケンス処理
   - カーソル位置情報の伝達

4. **React Strict Modeの影響**
   - 二重マウント
   - cleanup処理のタイミング

## 推奨される調査アプローチ

### Phase 1: 情報収集
1. **バージョン確認**
   - **Android/Chromeのバージョン**
   - xterm.js 5.5.0の**Android Chrome対応状況**
   - 既知の問題検索（GitHub Issues - Android/Chrome関連）

2. **ログ追加**
   - xterm.js側のイベントログ（onData, composition系）
   - WebSocket送受信ログ
   - PTY入出力ログ
   - **デバッグモード有効化**（`localStorage.setItem('xterm-debug-input', '1')`）

3. **シンプル化テスト**
   - tmux無しで直接bashに接続してテスト
   - ローカル（localhost）でのテスト
   - デスクトップブラウザでのテスト

### Phase 2: 仮説検証
1. **textarea操作の詳細調査**
   - フォーカス/blur イベント
   - selection/range の状態
   - **Android Chrome特有のイベント順序**
   - **Gboardなど入力メソッドの影響**

2. **代替実装の検討**
   - xterm.js の `screenReaderMode` 詳細調査
   - カスタムキーハンドラーの実装
   - **Android Chrome専用の入力処理パス**

3. **xterm.jsバージョン変更テスト**
   - 最新版へのアップグレード
   - または既知の安定版へのダウングレード

### Phase 3: 根本的対策
1. **xterm.js設定の最適化**
   - 未使用のオプション探索
   - **Android Chrome特化設定**の追加

2. **カスタム入力レイヤーの実装**
   - **Android Chrome専用の入力処理**
   - ネイティブtextarea制御の強化

3. **コミュニティ・ドキュメント調査**
   - xterm.js公式フォーラム
   - 類似プロジェクトの実装（Android対応事例）

## 参考情報

### xterm.js関連Issue（要再検索：Android Chrome用）
- https://github.com/xtermjs/xterm.js/issues （Android/Chrome関連issueを検索）
- ※前回はiOS前提で調査したため、Android Chrome特有の問題を再調査必要

### チャッピーの分析（MCP相談結果 - iOS前提だったため要再検証）
- モバイルブラウザのキーボードイベント不安定性
- textareaのネイティブキャレットとxtermカーソルの二重化
- Enter確定問題（composition/selection絡み）
- **Android Chromeでは異なる挙動の可能性あり**

### 類似プロジェクト
- Nagi Terminal（既存システム）：動作状況の確認
- Claude Code on the Web：参考実装
- **Android対応事例の調査**

## 次のステップ

### 優先度：高
1. **デバッグログ確認**
   - Terminal.tsxにデバッグログ追加済み（`localStorage.setItem('xterm-debug-input', '1')`で有効化）
   - スマホChromeのDevToolsでログ確認
   - onData, composition, focus/blur, keydown/keyup イベントの詳細

2. **シンプル化テスト**
   - tmux無しでの動作確認
   - ローカル（localhost）での確認

3. **xterm.js Issue調査**
   - **Android Chrome関連のissue検索**（前回はiOS前提だったため）
   - 解決策・ワークアラウンドの確認

### 優先度：中
4. **代替アプローチ検討**
   - カスタムキーハンドラー
   - **Android Chrome専用入力パス**

5. **バージョン変更テスト**
   - xterm.jsのバージョン変更

## 備考

- **スマホでの確認環境**: あおいさんの**Androidスマホ（Chrome）**（Tailscale経由）
- **現在のログイン方法**: QRコード読み取り
- **問題の再現性**: 100%再現（常に発生）

## 重要な訂正

**クロのミス**:
- 初回の相談・レポート作成時、勝手に「iOS Safari」と決めつけて調査・修正を行ってしまった
- 実際は **Android Chrome** での問題
- チャッピーへの相談もiOS前提だったため、**Android Chrome特有の問題を改めて調査する必要がある**

---

チャッピー、よろしく頼むよ！
**Android Chrome**での問題だから、iOS/Safariとは異なる原因・解決策の可能性があるよ。詳細な調査と根本的な解決策が必要だと思うんだ 💪
