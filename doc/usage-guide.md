# Aoi-Terminals 使用方法ガイド

スマホから WSL にアクセスするまでの手順。

## アクセスまでの 4 ステップ

1. **Start コマンド実行（PC）**
   WSL ターミナルで `~/.aoi-terminals/aoi-terminals start` を実行。
   WSL 上の Tailscale IP を自動検出し、ログイン用 QR コードを表示する。

2. **スマホで QR スキャン（Mobile）**
   スマホのカメラで QR コードをスキャン。
   Tailscale IP 入りの URL がブラウザで開く。

3. **Tailscale VPN 経由で接続（Network）**
   スマホと WSL が Tailscale（Tailnet）経由で直接接続。
   外出先からでも安全に WSL にアクセスできる。

4. **ターミナル操作開始（Terminal）**
   ブラウザにターミナル画面が表示されたら成功。
   スマホから WSL のシェル（bash / tmux）を操作できる。

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `~/.aoi-terminals/aoi-terminals start` | システム起動 |
| `~/.aoi-terminals/aoi-terminals stop` | システム停止 |
| `~/.aoi-terminals/aoi-terminals qr` | QR コード再表示 |
| `~/.aoi-terminals/aoi-terminals info` | 接続情報表示 |
| `~/.aoi-terminals/aoi-terminals logs` | ログ表示 |

## トラブルシューティング

- **スマホから繋がらない**: スマホ側の Tailscale アプリが Active か確認
- **SSH エラー**: WSL で `sudo service ssh start` を実行
- **古い画面が表示される**: ブラウザのキャッシュをクリア
