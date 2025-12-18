#!/bin/bash

# Improved Terminal System Stop Script (tmux mode)

echo "🛑 Stopping tmux session 'terminal-system'..."
tmux kill-session -t terminal-system 2>/dev/null

# 念のためポートを直接掃除 (tmux外で動いている場合への保険)
fuser -k 3101/tcp 2>/dev/null
fuser -k 3102/tcp 2>/dev/null

echo "✅ All systems stopped."
