# Aoi-Terminals 要件定義書 v3

## 1. このアプリの本質

**「Linuxのシェル（bash）をWebブラウザで操作する」**

docker-ceが動き、SSHサーバーがあり、シェルがある環境であれば、OS・ディストリビューションを問わず動作する。WSL専用ではなく、あらゆるLinux環境・macOSで利用可能。用途は非常に広い。

## 2. 背景・目的

- **目的**: スマホ・タブレットからWebブラウザだけでLinuxターミナルを快適に操作する
- **ターゲットユーザー**: リモートでターミナル操作を行うユーザー
- **スキルアップ**: 100appsプロジェクトの一環として、公開アプリとしての開発経験を積む

## 3. なぜこの構成なのか（設計判断の経緯）

### Q1: Tailscale SSHで十分では？

技術的にはTailscale SSHで代替可能だが、以下の理由からWebブラウザベースを選択した。

**Termuxの日本語IME問題**

Tailscale SSH経由でTermux等のSSHクライアントからターミナルを使うと、日本語IMEとの相性が悪い（変換候補の表示がおかしい、確定前の文字が二重入力される等の問題）。Webブラウザ上のxterm.jsであれば `compositionEvent` を使ってIMEの挙動を自前で制御できるため、Webベースのターミナルを構築する判断に至った。

**トークン手入力の問題 → QRコード認証**

Webアプリにした以上、ブラウザ側で認証が必要になる。ランダム生成トークンによる認証を採用したが、`a3Bf9xK2mNpQ7rWz...` のような長いランダム文字列をスマホで手入力するのは人間にとって非常にストレスが大きい。そこで、URLとトークンをQRコードに埋め込み「スマホでスキャンするだけで即ログイン」できる方式を導入した。QRコード自体はセキュリティ機能ではなく、入力の手間を省く利便性機能である。

```
設計判断の流れ:
  日本語IMEをまともに使いたい
    → TermuxのSSHクライアントでは不十分
    → Webブラウザ + xterm.js で自前制御
    → Webアプリなので認証が必要
    → ランダムトークンをスマホで手入力は苦痛
    → QRコードで「ぱしゃっ」と一発ログイン
```

### Q2: Dockerは何のために？

- 公開アプリとして配布するため。npm publishは野良パッケージが多く荒れている印象があり、Docker + GHCRで `curl | bash` 一発インストールを実現した
- ttydのような既存OSSを知らなかったため、Node.js（Express + WebSocket + node-pty）で自前実装した。依存が多くなり環境差異の吸収にDockerが必要になった
- スキルアップ目的のプロジェクトであり、Dockerでの配布・公開アプリとしての体裁は学びの一環として維持する

### Q3: ttydで置き換えられるのでは？

ttyd（C言語製の軽量Webターミナル）は同じ仕組み（xterm.js + WebSocket + PTY）を1バイナリで実現している。しかし、フロントエンドがバイナリに埋め込まれておりカスタマイズ困難なため、日本語IME対応やUI/UXのカスタマイズが必要な本アプリには適さないと判断した。

### Q4: なぜSSH bridgeが必要？

Dockerコンテナの中で起動したbashは、コンテナ内のbashであってホストのbashではない。ホストのファイルシステム・環境変数・ユーザー設定・tmuxセッション等は見えない。そのため、コンテナからホストのシェルに「橋渡し（SSH bridge）」する仕組みが必要。これはDocker Desktop でも WSLネイティブDocker でも同じ（コンテナの隔離性はDocker自体の特性）。

## 4. アーキテクチャ

```
スマホ/PC（Webブラウザ）
    ↕ HTTP / WebSocket
フロントエンド: Vite + React 18 + TypeScript + xterm.js（ビルド後は静的ファイル、Dockerコンテナのnginxで配信）
    ↕ WebSocket
バックエンド: Express + node-pty（Dockerコンテナ）
    ↕ SSH bridge
ホスト: docker-ce + SSHサーバー + シェル（Linux/macOS）
```

## 5. 機能要件

### 5.1 認証・セキュリティ

- **ログイントークン**: 起動時にランダム生成（固定トークンも可）
- **ログイン方法**: ブラウザでトークンを入力 → `POST /auth` → `HttpOnly` Cookieでセッション管理
- **QRコードログイン**: URLとトークンをQRコードに埋め込み、スキャン一発でログイン
  - ワンタイム（5分間有効）
  - オーナー用: 24時間セッション
  - シェア用: 6時間セッション
- **HTTPS対応**: TailscaleのHTTPS終端、またはリバースプロキシ経由

### 5.2 ターミナル操作

- **WebSocketベース接続**: xterm.js（フロントエンド） ↔ WebSocket ↔ node-pty（バックエンド）
- **基本機能**: 文字入力・表示、カーソル移動、カラー表示、リサイズ対応
- **tmux自動接続**: バックエンドがSSH先またはローカルで `tmux new-session -A` を実行し、既存セッションへの再接続をサポート

### 5.3 日本語入力（核心機能）

- **IME完全サポート**: xterm.jsのcompositionイベント対応
- 変換候補表示領域の確保
- 確定前文字の適切な表示

### 5.4 UI

- クリーンでモダンなダークモードデザイン
- モバイルファースト（タッチ操作優先）
- **コントロールパネル（ControlPanel）**: 特殊キーボタン（Esc, Tab, Enter, ^C, ^D, ^Z）、矢印キー（逆T字配置）、IME入力ボタン
- **tmux操作パネル（TmuxPanel）**: スマホからtmux操作をGUIで行うためのパネル（詳細は5.5参照）
- 全画面モード対応
- QRコード共有モーダル

### 5.5 tmux操作パネル（TmuxPanel）

スマホでtmuxのプレフィックスキー（Ctrl+B）を手打ちするのは非現実的なため、GUIボタンで1タップ操作できるパネルを提供する。

**実装方式**:
- フロントエンドの各ボタンがtmuxプレフィックスキー `\x02`（Ctrl+B）+ 操作キーをWebSocket経由で直接送信
- バックエンド側にtmux専用のロジックは不要（v1のtmux-helper.tsは廃止済み）
- 通常のキー入力と同じ経路（WebSocket → node-pty → シェル）でtmuxに到達する

**提供する操作ボタン**:

| ボタン | 送信キー | 機能 |
|--------|----------|------|
| New Window (c) | `\x02` + `c` | 新規ウィンドウ作成 |
| Next Window (n) | `\x02` + `n` | 次のウィンドウへ移動 |
| Prev Window (p) | `\x02` + `p` | 前のウィンドウへ移動 |
| Sessions (s) | `\x02` + `s` | セッション一覧表示 |
| Split V (%) | `\x02` + `%` | 垂直分割 |
| Split H (") | `\x02` + `"` | 水平分割 |
| Swap Pane (o) | `\x02` + `o` | ペイン切り替え |
| Zoom (z) | `\x02` + `z` | ペインズーム切替 |
| Scroll ([) | `\x02` + `[` | スクロール（コピー）モード |
| Detach (d) | `\x02` + `d` | セッションのデタッチ |

**パネル構成**:
- 折りたたみ可能（Open/Close tmux Panel ボタンで切替）
- tmux操作ボタン群の下に、操作キー（Esc, Tab, Enter, ^C, ^D, ^Z）・矢印キー・IMEボタンも配置
- ControlPanel（tmuxパネル閉時）と同じ操作キー配列を維持し、パネル開閉でレイアウトが変わらない

## 6. 対応環境

### 6.1 ホスト環境

| 環境 | 対応 | 必要なもの |
|------|------|-----------|
| Linux（各ディストリビューション） | ✅ | docker-ce + SSH + bash |
| macOS | ✅ | Docker + SSH + bash/zsh |
| Windows + WSL | ✅ | WSL内で動作 |
| VPS (AWS, GCP等) | ✅ | 標準的なLinuxサーバー |
| ラズベリーパイ | ✅ | ARM版docker-ce対応 |
| Windows単体 | ❌ | Linuxシェルがなく、docker-ceが直接動作しない |

### 6.2 クライアント（ブラウザ）

- iOS Safari 14以降
- Android Chrome最新版
- デスクトップChrome/Firefox/Safari最新版

## 7. 技術スタック

### バックエンド
- **Express.js**: HTTP/WebSocketサーバー
- **node-pty**: 疑似端末管理
- **ws**: WebSocket通信
- **OpenSSH**: SSH bridge用

### フロントエンド
- **Vite 6 + React 18 + TypeScript**: ビルド後は静的ファイルとしてnginxで配信（SSR不要）
- **xterm.js 5**: ターミナルエミュレータ（@xterm/xterm + @xterm/addon-fit）
- **Tailwind CSS 3**: スタイリング

### インフラ
- **Docker (docker-ce)**: コンテナ化・配布（WSLネイティブDocker）
- **GHCR**: Dockerイメージの配布
- **SSH bridge**: コンテナからホストシェルへの接続

## 8. 配布

### インストール
```bash
curl -L "https://raw.githubusercontent.com/.../install.sh" | bash
```

### 操作
```bash
~/.aoi-terminals/aoi-terminals start   # 起動 + QRコード表示
~/.aoi-terminals/aoi-terminals stop    # 停止
~/.aoi-terminals/aoi-terminals qr      # QRコード再発行
```

## 9. 非機能要件

- ターミナル操作のレイテンシ: 100ms以内
- 日本語入力の応答性: IME変換が即座に反映
- 初回ロード時間: 3秒以内
- セキュリティ: XSS対策、トークン漏洩リスク最小化

## 10. 変更履歴

### v1 → v2 で削除したもの

| 対象 | 理由 |
|------|------|
| **Next.js** | SSRもルーティングも不要。Vite + Reactで静的ビルドし、nginxで配信すれば十分 |
| **tmux操作GUIボタン** | 過剰な機能と判断し削除（→ v3で復活） |

### v1 → v2 で変更したもの

| 対象 | v1 | v2 | 理由 |
|------|-----|-----|------|
| **Docker環境** | Docker Desktop (Windows) | WSLネイティブDocker (docker-ce) | Windows側の依存を排除、WSL内で完結 |
| **対応環境** | WSL2 + Ubuntu 24.04限定 | docker-ce + SSH が動く全環境 | アプリの本質に立ち返り不要な制限を撤廃 |
| **SSH bridge接続先** | `host.docker.internal` | WSLネイティブDocker対応方式 | Docker環境の移行に伴う変更 |
| **フロントエンド** | Next.js 14 + React | Vite + React 18 + TypeScript | SSR不要のためNext.jsを廃止、ビルド後は静的ファイル |

### v2 → v3 で復活したもの

| 対象 | v2での状態 | v3での復活理由 |
|------|-----------|---------------|
| **tmux操作GUIボタン（TmuxPanel）** | 過剰な機能として削除 | スマホでCtrl+Bプレフィックスキーを手打ちするのは非現実的。1タップでtmux操作できるGUIが必要と再判断 |

### v2 → v3 で変更したもの

| 対象 | v1（参考） | v3 | 変更点 |
|------|-----------|-----|--------|
| **tmux操作の実装方式** | バックエンドのtmux-helper.tsがtmuxコマンドを実行 | フロントエンドからプレフィックスキー（`\x02` + 操作キー）をWebSocket経由で直接送信 | バックエンドにtmux専用ロジックが不要になり、アーキテクチャがシンプル化 |
| **UIパネル構成** | ControlPanelのみ | ControlPanel（基本操作）+ TmuxPanel（tmux操作 + 基本操作） | tmuxパネル開閉で操作キー配列が変わらないよう統一設計 |

### v2 → v3 で変更なし

| 対象 | 備考 |
|------|------|
| **フロントエンド技術スタック** | Vite + React 18 + TypeScript + Tailwind CSS（v2と同一） |
| **Docker構成** | WSLネイティブDocker（docker-ce）、network_mode: host |
| **SSH bridge** | コンテナ → ホストbash接続方式 |
| **認証・セキュリティ** | トークン認証 + QRコードログイン |

## 11. 実装状況

v3時点で以下は全て実装完了済み:

- [x] Docker環境の移行: Docker Desktop → WSLネイティブDocker (docker-ce)
- [x] フロントエンドの刷新: Next.js → Vite + React 18 + TypeScript
- [x] SSH bridge接続先の変更: WSLネイティブDocker対応
- [x] 対応環境の拡大: Ubuntu限定の前提条件を撤廃
- [x] tmux操作GUIパネルの復活（プレフィックスキー送信方式で再実装）
- [x] ControlPanel / TmuxPanel の統一的な操作キー配列
