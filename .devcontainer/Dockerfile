FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye

# 開発に必要なツールをインストール
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    tmux \
    qrencode \
    ssh-client \
    jq \
    python3 \
    build-essential \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# グローバルnpmパッケージのインストール（必要に応じて）
RUN su node -c "npm install -g npm@latest"
