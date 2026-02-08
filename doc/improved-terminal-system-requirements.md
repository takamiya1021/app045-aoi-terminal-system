# Aoi-Terminals 要件定義書 v2

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
フロントエンド: 静的HTML/CSS/JS + xterm.js（Dockerコンテナ）
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

### 5.3 日本語入力（核心機能）

- **IME完全サポート**: xterm.jsのcompositionイベント対応
- 変換候補表示領域の確保
- 確定前文字の適切な表示

### 5.4 UI

- クリーンでモダンなダークモードデザイン
- モバイルファースト（タッチ操作優先）
- コントロールパネル: 特殊キーボタン（Ctrl, Alt, Esc, Tab等）、ショートカットボタン
- 全画面モード対応
- QRコード共有モーダル

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
- **静的HTML/CSS/JS**: Next.jsは使わない（SSR不要）
- **xterm.js**: ターミナルエミュレータ
- **Tailwind CSS**: スタイリング

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

## 10. v1からの変更履歴

### v1 → v2 で削除したもの

| 対象 | 理由 |
|------|------|
| **Next.js** | SSRもルーティングも不要。静的HTML/CSS/JS + xterm.jsで十分 |
| **tmux操作GUIボタン** | 過剰な機能。tmuxはターミナル上で直接操作すればよい |

### v1 → v2 で変更したもの

| 対象 | v1 | v2 | 理由 |
|------|-----|-----|------|
| **Docker環境** | Docker Desktop (Windows) | WSLネイティブDocker (docker-ce) | Windows側の依存を排除、WSL内で完結 |
| **対応環境** | WSL2 + Ubuntu 24.04限定 | docker-ce + SSH が動く全環境 | アプリの本質に立ち返り不要な制限を撤廃 |
| **SSH bridge接続先** | `host.docker.internal` | WSLネイティブDocker対応方式 | Docker環境の移行に伴う変更 |
| **フロントエンド** | Next.js 14 + React | 静的HTML/CSS/JS | 軽量化 |

## 次のステップ

1. **Docker環境の移行**: Docker Desktop → WSLネイティブDocker (docker-ce)
2. **フロントエンドの刷新**: Next.js → 静的HTML/CSS/JS + xterm.js
3. **tmux操作GUIの削除**: TmuxPanel / SessionManager コンポーネントの除去
4. **SSH bridge接続先の変更**: WSLネイティブDocker対応
5. **対応環境の拡大**: Ubuntu限定の前提条件を撤廃、各環境でのテスト
