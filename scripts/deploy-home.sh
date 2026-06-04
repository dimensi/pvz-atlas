#!/usr/bin/env bash
set -euo pipefail

APP_NAME="pvz-atlas"
DOMAIN="${DOMAIN:-pvz.dimensi.dev}"
SSH_HOST="${SSH_HOST:-vidstore}"
REMOTE_DIR="${REMOTE_DIR:-/opt/pvz-atlas}"
CADDY_DIR="${CADDY_DIR:-/opt/apple_vidnoe}"
CADDYFILE="${CADDYFILE:-${CADDY_DIR}/Caddyfile}"
COMPOSE_FILE="docker-compose.yml"
APP_IMAGE="${APP_IMAGE:-pvz-atlas-pvz-atlas:latest}"
CADDY_CONTAINER="${CADDY_CONTAINER:-caddy}"
PROXY_NETWORK="${PROXY_NETWORK:-apple_vidnoe_default}"
DEPLOY_IMAGE_SOURCE="${DEPLOY_IMAGE_SOURCE:-build}"
LOCAL_IMAGE_PLATFORM="${LOCAL_IMAGE_PLATFORM:-linux/amd64}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ssh "${SSH_HOST}" "mkdir -p '${REMOTE_DIR}'"

rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .next \
  --exclude .worktrees \
  --exclude coverage \
  --exclude dist \
  --exclude .DS_Store \
  --exclude '.env' \
  --exclude '.env.*' \
  "${ROOT_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"

ssh "${SSH_HOST}" "cat > '${REMOTE_DIR}/${COMPOSE_FILE}' <<'YAML'
services:
  ${APP_NAME}:
    build: .
    image: ${APP_IMAGE}
    container_name: ${APP_NAME}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      HOSTNAME: 0.0.0.0
      PORT: 3000
      DADATA_SUGGEST_PER_MINUTE_LIMIT: \${DADATA_SUGGEST_PER_MINUTE_LIMIT:-30}
      DADATA_SUGGEST_PER_DAY_LIMIT: \${DADATA_SUGGEST_PER_DAY_LIMIT:-500}
    networks:
      - ${PROXY_NETWORK}

networks:
  ${PROXY_NETWORK}:
    external: true
YAML"

case "${DEPLOY_IMAGE_SOURCE}" in
  build)
    ssh "${SSH_HOST}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' build --progress=plain"
    ;;
  local)
    docker buildx build --platform "${LOCAL_IMAGE_PLATFORM}" -t "${APP_IMAGE}" --load "${ROOT_DIR}"
    docker save "${APP_IMAGE}" | ssh "${SSH_HOST}" "docker load"
    ;;
  local-image)
    docker image inspect "${APP_IMAGE}" >/dev/null
    docker save "${APP_IMAGE}" | ssh "${SSH_HOST}" "docker load"
    ;;
  none)
    ssh "${SSH_HOST}" "docker image inspect '${APP_IMAGE}' >/dev/null"
    ;;
  *)
    echo "Unsupported DEPLOY_IMAGE_SOURCE='${DEPLOY_IMAGE_SOURCE}'. Use build, local, local-image, or none." >&2
    exit 2
    ;;
esac

ssh "${SSH_HOST}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' up -d --no-build --force-recreate"

ssh "${SSH_HOST}" "python3 - <<'PY'
from pathlib import Path
from datetime import UTC, datetime

caddyfile = Path('${CADDYFILE}')
domain = '${DOMAIN}'
block = f'''
{domain} {{
\treverse_proxy ${APP_NAME}:3000
}}
'''.lstrip()

text = caddyfile.read_text()
lines = text.splitlines(keepends=True)
start = None
for index, line in enumerate(lines):
    if line.strip() == domain + ' {':
        start = index
        break

if start is None:
    backup = caddyfile.with_name(caddyfile.name + '.bak.' + datetime.now(UTC).strftime('%Y%m%d%H%M%S'))
    backup.write_text(text)
    caddyfile.write_text(text.rstrip() + '\\n\\n' + block)
else:
    depth = 0
    end = None
    for index in range(start, len(lines)):
        depth += lines[index].count('{') - lines[index].count('}')
        if depth == 0:
            end = index + 1
            break
    if end is None:
        raise SystemExit(f'Could not locate end of {domain} block')
    current = ''.join(lines[start:end])
    if current != block:
        backup = caddyfile.with_name(caddyfile.name + '.bak.' + datetime.now(UTC).strftime('%Y%m%d%H%M%S'))
        backup.write_text(text)
        caddyfile.write_text(''.join(lines[:start]) + block + ''.join(lines[end:]))
PY"

ssh "${SSH_HOST}" "docker exec '${CADDY_CONTAINER}' caddy validate --config /etc/caddy/Caddyfile"
ssh "${SSH_HOST}" "docker exec '${CADDY_CONTAINER}' caddy reload --config /etc/caddy/Caddyfile"

ssh "${SSH_HOST}" "docker ps --filter name='${APP_NAME}' --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}'"
ssh "${SSH_HOST}" "docker run --rm --network '${PROXY_NETWORK}' curlimages/curl:8.11.1 -I --max-time 8 http://${APP_NAME}:3000/points"
ssh "${SSH_HOST}" "docker run --rm --network '${PROXY_NETWORK}' curlimages/curl:8.11.1 -I --max-time 8 -H 'Host: ${DOMAIN}' http://${CADDY_CONTAINER}/"
