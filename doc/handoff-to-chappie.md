# クロからチャッピーへの引き継ぎレポート

## 問題概要
スマホ（Tailscale経由）からWebターミナルにアクセスできない問題。

**症状**：
- フロントエンド（3101）は開く ✅
- トークンも自動入力される ✅
- CONNECTボタンを押すと「認証サーバに繋がらなかった」エラー ❌

## 判明した事実

### 1. ネットワーク構成
- **Windows**: Tailscaleインストール済み（IP: 100.70.242.10）
- **WSL2**: Tailscaleなし（WSL2の自動ポートフォワーディングを利用）
- **スマホ**: Tailscale経由でアクセス

### 2. サーバー起動状態
- **フロントエンド**: localhost:3101, 0.0.0.0:3101でLISTEN ✅
- **バックエンド**: *:3102 (IPv6ワイルドカード)でLISTEN ✅
- **ALLOWED_ORIGINS**: `http://localhost:3101,http://100.70.242.10:3101` ✅

### 3. 接続テスト結果
- **localhost経由**: CORS preflight成功 ✅
- **Tailscale IP経由（WSL2からcurl）**: アクセス不可（WSL2からWindowsのTailscale IPにアクセスできない）
- **Tailscale IP経由（PCブラウザ）**: **CORSエラー発生** ❌

### 4. 最重要発見：CORSエラー
PCブラウザからアクセス時のエラーメッセージ：
```
Access to fetch at 'http://100.70.242.10:3102/session' from origin 'http://100.70.242.10:3101' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### 5. バックエンドログの謎
- **localhost経由のリクエスト**: ログに記録される ✅
- **Tailscale IP経由のリクエスト**: ログに全く記録されない ❌

ログ確認結果：
```
info: [CORS] POST /auth {"allowedOrigins":["http://localhost:3101","http://100.70.242.10:3101"],"isAllowed":true,"origin":"http://localhost:3101",...}
info: [CORS] POST /link-token {"allowedOrigins":["http://localhost:3101","http://100.70.242.10:3101"],"isAllowed":true,"origin":"http://localhost:3101",...}
```

→ Tailscale IP (`http://100.70.242.10:3101`) からのリクエストが記録されていない！

## 実施した作業

### 1. セッション期間差別化の実装 ✅
- `backend/src/auth.ts`: isShareフラグ追加、24h/6hのセッション期間差別化
- `backend/src/server.ts`: /authと/link-tokenエンドポイントでisShare対応
- `frontend/src/app/page.tsx`: シェアQRボタンでisShare: true送信
- `doc/improved-terminal-system-requirements.md`: 仕様書更新

### 2. Tailscale設定の修正 ✅
- `scripts/start.sh`: Windows側のtailscale.exeから自動的にIPアドレス取得
- ALLOWED_ORIGINSにTailscale IPを自動追加
- DNS競合回避（WSL2側にはTailscaleインストールしない）

### 3. デバッグログ追加
- `backend/src/server.ts`: CORSミドルウェアとリクエストログ追加
- `frontend/src/app/page.tsx`: デバッグログとエラー詳細表示

### 4. 問題調査
- tmuxセッション確認
- ポート使用状況確認
- プロセス確認
- CORS preflight テスト（localhost経由）
- ファイアウォール調査（未完了）

## 未解決の問題

### 核心的な疑問
**なぜTailscale IP経由のリクエストがバックエンドに到達しないのか？**

可能性：
1. **別のバックエンドインスタンスが存在**
   - 古いバックエンド（ALLOWED_ORIGINS未設定）が3102ポートをLISTEN？
   - Windows側でバックエンドが起動している？

2. **ポートフォワーディングの問題**
   - WSL2の自動ポートフォワーディングが3102ポートで機能していない？
   - Windowsのファイアウォールが3102ポートをブロック？

3. **IPv4/IPv6の問題**
   - バックエンドはIPv6 (`*:3102`) でLISTEN
   - Tailscale IPはIPv4 (100.70.242.10)
   - IPv4リクエストが受け付けられていない？

4. **ネットワークルーティングの問題**
   - Tailscale → Windows → WSL2 の経路で3102ポートが届いていない？

## 次のステップ（チャッピーへの推奨）

### 優先度：高
1. **Windowsのnetstatでポート確認**
   ```powershell
   netstat -an | findstr 3102
   ```
   - 0.0.0.0:3102でLISTENしているか？
   - 100.70.242.10:3102での接続履歴は？

2. **Windowsのファイアウォール確認**
   ```powershell
   Get-NetFirewallRule | Where-Object {$_.LocalPort -eq '3102'}
   ```

3. **別のバックエンドインスタンス確認**
   - Windows側でNode.jsプロセスが動いていないか？
   - WSL2で他のバックエンドプロセスがないか再確認

4. **ポートフォワーディング明示的設定**
   - WSL2の自動ポートフォワーディングに頼らず、明示的にポートフォワード設定
   ```powershell
   netsh interface portproxy add v4tov4 listenport=3102 listenaddress=0.0.0.0 connectport=3102 connectaddress=<WSL2_IP>
   ```

### 優先度：中
5. **バックエンドをIPv4でLISTEN**
   - Express.jsの設定を確認
   - `app.listen(3102, '0.0.0.0')` で明示的にIPv4指定

6. **curlでTailscale IP経由テスト**
   - スマホからcurl実行（Termuxアプリ等）
   - または別のTailscaleデバイスからcurl実行

## 関連ファイル
- `backend/src/server.ts` - CORSミドルウェア、ログ追加済み
- `backend/src/auth.ts` - セッション期間差別化実装済み
- `frontend/src/app/page.tsx` - デバッグログ追加済み
- `scripts/start.sh` - Tailscale IP自動取得実装済み
- `doc/improved-terminal-system-requirements.md` - 仕様書更新済み

## 現在のサーバー状態
- **tmuxセッション**: terminal-system (2 windows)
- **バックエンドPID**: 71204
- **フロントエンドPID**: 確認必要
- **ログイントークン**: EIp8ixWCoKqRdNqeg7YwEeElXR7Po6vl
- **ALLOWED_ORIGINS**: http://localhost:3101,http://100.70.242.10:3101

---

チャッピー、よろしく頼むよ！
