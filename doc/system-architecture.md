# Aoi-Terminals システム構造図（v3/v4）

## 1. 直感的なシステム配置図

### アーキテクチャ全体像とデータフロー

お嬢のシステムは、**ホストマシンの中で全てが完結する**構成になっとるで。docker-ce・SSH・bashさえあれば、LinuxでもmacOSでもWSL2でも動くんや。Docker Desktopも不要やで。ホストの中だけで、docker-ce・Tailscale・SSH・bashが全部動いとる。

```
┌──────────────────────────────────────────────────┐
│  お嬢の端末（スマホ / タブレット / PC）          │
│  ┌──────────────────────────────────────────┐    │
│  │  Webブラウザ (Vite + React + xterm.js)   │    │
│  └──────────────┬───────────────────────────┘    │
└─────────────────┼────────────────────────────────┘
                  │ HTTP / WebSocket
                  │ (Tailscale VPN経由)
                  ▼
┌──────────────────────────────────────────────────┐
│  Linux / macOS ホスト                             │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Tailscale（ホスト上で直接動作）            │  │
│  │  → ホストにTailscale IPが付与される         │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  docker-ce（ホストにインストール）          │  │
│  │  network_mode: host                        │  │
│  │                                            │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │ frontend コンテナ (Port 3101)        │  │  │
│  │  │ nginx → 静的ファイル配信             │  │  │
│  │  │ (Vite + React + xterm.js ビルド済)   │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  │                                            │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │ backend コンテナ (Port 3102)         │  │  │
│  │  │ Express + node-pty + WebSocket       │  │  │
│  │  │          │                           │  │  │
│  │  │          │ SSH bridge                │  │  │
│  │  └──────────┼───────────────────────────┘  │  │
│  │             │                              │  │
│  └─────────────┼──────────────────────────────┘  │
│                ▼                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ホストシェル: bash / tmux                 │  │
│  │  ~/.aoi-terminals/ (CLI & .env)            │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 各エリアの役割

1. **お嬢の端末（スマホ / タブレット / PC）**:
   Webブラウザでアクセスするだけや。Tailscale VPN経由で、ホストの中のnginxに繋がる。xterm.jsがターミナルをレンダリングしてくれるから、日本語IMEもバッチリ動くで。

2. **Tailscale（ホスト上で直接動作）**:
   ホストマシンにTailscaleをインストールしとる。ホスト自体にTailscale IPが付与されるから、スマホからそのIPに直接アクセスできるんよ。

3. **docker-ce（ホストにインストール）**:
   Docker Desktopは使わへん。ホストにdocker-ceを直接インストールして動かしとる。`network_mode: host` やから、コンテナがホストのネットワークをそのまま共有するんや。`host.docker.internal` みたいな回りくどいことは一切不要やで。

4. **frontendコンテナ（Port 3101）**:
   Vite + React + xterm.js + Tailwind CSS でビルドした静的ファイルを、nginxで配信しとる。

5. **backendコンテナ（Port 3102）**:
   Express + node-pty + WebSocket のサーバーや。SSH bridgeでコンテナからホストのbashに接続して、ターミナルセッションを提供しとる。

6. **ホストシェル（bash / tmux）**:
   お嬢が普段作業する場所や。backendコンテナからSSH経由で繋がってくるんやな。`~/.aoi-terminals/` にCLIツールや設定ファイルが入っとるで。

---

## 2. 技術設計図（Mermaid）

お嬢のホスト内部での、階層構造と通信の流れを技術的に表した図や。Docker Desktopも不要やし、ホストの中で全部完結しとるのがポイントやで。

```mermaid
graph TB
    subgraph Client ["お嬢の端末 (スマホ/タブレット/PC)"]
        Browser["Webブラウザ<br/>(Vite + React + xterm.js)"]
    end

    subgraph GHCR ["GitHub Container Registry"]
        GHImages["Docker Images"]
        GHScripts["CLI Scripts"]
    end

    subgraph HostEnv ["Linux / macOS ホスト（全てここで完結）"]
        Tailscale["Tailscale<br/>(ホスト上で動作・IPを持つ)"]

        subgraph DockerCE ["docker-ce (network_mode: host)"]
            Frontend["frontend コンテナ<br/>nginx (Port 3101)<br/>静的ファイル配信"]
            Backend["backend コンテナ<br/>Express + node-pty (Port 3102)<br/>WebSocket"]
        end

        subgraph Host ["ホスト環境"]
            Control["~/.aoi-terminals/<br/>(CLI & .env)"]
            Shell["bash / tmux"]
        end
    end

    %% 外部からのアクセス
    Browser -- "HTTP (Port 3101)<br/>Tailscale VPN" --> Frontend
    Browser -- "WebSocket (Port 3102)<br/>Tailscale VPN" --> Backend

    %% インストール時のデータフロー
    GHScripts -- "curl (ダウンロード)" --> Control
    GHImages -- "docker pull" --> DockerCE

    %% Docker管理
    Control -- "docker compose<br/>(Docker Socket)" --> DockerCE

    %% SSH bridge（コンテナ → ホストbash）
    Backend -- "SSH bridge<br/>(コンテナ → ホスト)" --> Shell

    %% Tailscale → コンテナへの通信経路
    Tailscale -. "Tailscale IP で<br/>外部アクセスを受け付け" .-> Frontend
    Tailscale -. "Tailscale IP で<br/>外部アクセスを受け付け" .-> Backend

    %% スタイル
    style Client fill:#f9f,stroke:#333
    style HostEnv fill:#f1f8e9,stroke:#33691e
    style DockerCE fill:#b3e5fc,stroke:#01579b
    style Host fill:#dcedc8,stroke:#33691e
    style Tailscale fill:#e8f5e9,stroke:#2e7d32
```

### 通信フローの詳細

1. **外部アクセス（スマホ → ホスト）**:
   - スマホのブラウザから、TailscaleのVPN経由でホストのIPにアクセス
   - HTTPリクエスト（Port 3101）はnginxコンテナが受け取って静的ファイルを返す
   - WebSocket接続（Port 3102）はExpressコンテナが受け取ってターミナルセッションを提供

2. **コンテナ ↔ ホスト通信（SSH bridge）**:
   - backendコンテナからホストのbashへ、SSH鍵認証で接続
   - `network_mode: host` やから、`localhost` でそのまま繋がる（`host.docker.internal` は不要）
   - node-ptyがPTYセッションを管理して、xterm.jsに中継する

3. **インストール時のフロー**:
   - GHCRからコンテナイメージを `docker pull`
   - CLIスクリプトは `curl` でダウンロードして `~/.aoi-terminals/` に配置
   - `docker compose` コマンドで起動（Docker Desktop不要、直接 `docker` コマンド）

### v1からの主な変更点（歴史的経緯）

| 項目 | v1 | v2/v3 |
|------|-----|-------|
| **Docker** | Docker Desktop for Windows | docker-ce（ホストにインストール） |
| **Tailscale** | Windows側で動作 | ホスト上で直接動作 |
| **フロントエンド** | Next.js (SSR) | Vite + React (静的ビルド + nginx) |
| **ネットワーク** | ポートフォワーディング | `network_mode: host` |
| **コンテナ→ホスト** | `host.docker.internal` | `localhost`（SSH bridge） |
| **Windows側の依存** | Docker Desktop必須 | 不要（ホストで全て完結） |
| **docker-desktop distro** | 存在する | 存在しない |

この構成のおかげで、ホストの中だけで全部動くんよ。LinuxでもmacOSでもWSL2でも、docker-ceとSSHさえあればOKや。シンプルで、お嬢にとっても管理しやすい構成になっとるで。
