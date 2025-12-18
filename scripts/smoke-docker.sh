#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "[aoi-terminals] docker が見つからへん。Docker入れてからもう一回やってな。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[aoi-terminals] docker compose が使えへん。Docker Compose v2 を有効にしてな。"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[aoi-terminals] env file が無いで: $ENV_FILE"
  echo "  例: cp \"$ROOT_DIR/.env.docker.example\" \"$ROOT_DIR/.env\""
  exit 1
fi

echo "[aoi-terminals] compose up (build) ..."
docker compose --env-file "$ENV_FILE" up -d --build

echo "[aoi-terminals] waiting for backend /health ..."
deadline="$((SECONDS + 60))"
while true; do
  if curl -fsS "http://localhost:3102/health" >/dev/null 2>&1; then
    break
  fi
  if (( SECONDS >= deadline )); then
    echo "[aoi-terminals] backend health check timeout"
    docker compose --env-file "$ENV_FILE" ps || true
    docker compose --env-file "$ENV_FILE" logs --tail=200 backend || true
    exit 1
  fi
  sleep 1
done

echo "[aoi-terminals] OK"
echo "  Frontend: http://localhost:3101"
echo "  Backend : http://localhost:3102/health"
echo "Stop: docker compose --env-file \"$ENV_FILE\" down"

