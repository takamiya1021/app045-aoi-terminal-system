# 検証手順 (分離版)

**1. インストール** と **2. 起動** を分けて実行する、確実で安全な手順です。
（インストーラーはインストールだけを行い、勝手に起動しなくなりました）

## Step 1: インストール (またはアップデート)

> ⚠️ **重要**: 必ず **一般ユーザー**（`root` 以外）で実行してください。
> （WSLのデフォルトユーザー推奨。`whoami` で `root` と出る場合は `exit` してください）

以下のコマンドで、最新のスクリプトと Docker イメージを取得します。
※ 実行前に既存コンテナを強制停止・削除してポートを解放します。

```bash
# 1. 衝突ポート(3101)のコンテナをピンポイント削除
docker rm -f $(docker ps -q --filter "publish=3101") 2>/dev/null || true

# 2. 衝突ポート(3102)のコンテナをピンポイント削除
docker rm -f $(docker ps -q --filter "publish=3102") 2>/dev/null || true

# 2. インストール実行
curl -L "https://raw.githubusercontent.com/takamiya1021/app045-aoi-terminal-system/main/scripts/install-docker.sh?v=$(date +%s)" | bash
```
> ✅ **確認**: 最後に `To start the system, run: ...` と表示されれば完了です。

## Step 2: 起動 & 動作確認

ご自身のタイミングで起動コマンドを実行します。
（ここで QRコード と URL が表示されます）

```bash
~/.aoi-terminals/aoi-terminals start
```

### ✅ チェック項目
1. **[ ] ログイン**: コンソールに出る URL / QR でログインできること。
2. **[ ] コマンド**: ターミナルで `ls` などが打てること。
3. **[ ] 日本語**: 日本語入力ができること。

## Step 3: 終了

```bash
~/.aoi-terminals/aoi-terminals stop
```
