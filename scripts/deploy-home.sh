#!/usr/bin/env bash
set -euo pipefail

APP_NAME="pvz-atlas"
DOMAIN="${DOMAIN:-pvz.dimensi.dev}"
SSH_HOST="${SSH_HOST:-home-server}"
REMOTE_DIR="${REMOTE_DIR:-/opt/compose/pvz-atlas}"
CADDY_DIR="${CADDY_DIR:-/opt/compose/caddy}"
CADDYFILE="${CADDYFILE:-${CADDY_DIR}/Caddyfile}"
BASIC_AUTH_FILE="${BASIC_AUTH_FILE:-${REMOTE_DIR}/.caddy-basic-auth}"
COMPOSE_FILE="docker-compose.yml"

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
  --exclude '.caddy-basic-auth' \
  "${ROOT_DIR}/" "${SSH_HOST}:${REMOTE_DIR}/"

ssh "${SSH_HOST}" "cd '${REMOTE_DIR}' && python3 - <<'PY' > .caddy-basic-auth.env
from pathlib import Path
from shlex import quote

values = {}
for line in Path('.env').read_text().splitlines():
    if not line or line.lstrip().startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    key = key.strip()
    if key not in {'PVZ_BASIC_AUTH_USER', 'PVZ_BASIC_AUTH_PASSWORD'}:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'\"', \"'\"}:
        value = value[1:-1]
    values[key] = value

missing = [key for key in ('PVZ_BASIC_AUTH_USER', 'PVZ_BASIC_AUTH_PASSWORD') if not values.get(key)]
if missing:
    raise SystemExit('Missing required .env values: ' + ', '.join(missing))

print('PVZ_BASIC_AUTH_USER=' + quote(values['PVZ_BASIC_AUTH_USER']))
print('PVZ_BASIC_AUTH_PASSWORD=' + quote(values['PVZ_BASIC_AUTH_PASSWORD']))
PY
. ./.caddy-basic-auth.env
rm ./.caddy-basic-auth.env
auth_hash=\$(docker run --rm caddy:latest caddy hash-password --algorithm bcrypt --plaintext \"\${PVZ_BASIC_AUTH_PASSWORD}\")
umask 077
printf '%s %s\n' \"\${PVZ_BASIC_AUTH_USER}\" \"\${auth_hash}\" > '${BASIC_AUTH_FILE}'"

ssh "${SSH_HOST}" "cd '${REMOTE_DIR}' && docker compose -f '${COMPOSE_FILE}' up -d --build --force-recreate"

ssh "${SSH_HOST}" "python3 - <<'PY'
from pathlib import Path
from datetime import UTC, datetime

caddyfile = Path('${CADDYFILE}')
domain = '${DOMAIN}'
auth_file = Path('${BASIC_AUTH_FILE}')
auth = auth_file.read_text().strip().split(maxsplit=1)
if len(auth) != 2:
    raise SystemExit(f'{auth_file} must contain: <username> <caddy-hashed-password>')
auth_user, auth_hash = auth
block = f'''
{domain} {{
\tbasic_auth {{
\t\t{auth_user} {auth_hash}
\t}}
\treverse_proxy ${APP_NAME}:3000
}}
'''.lstrip()

text = caddyfile.read_text()
start = text.find(domain + ' {')
if start == -1:
    backup = caddyfile.with_name(caddyfile.name + '.bak.' + datetime.now(UTC).strftime('%Y%m%d%H%M%S'))
    backup.write_text(text)
    caddyfile.write_text(text.rstrip() + '\\n\\n' + block)
else:
    end = text.find('\\n}', start)
    if end == -1:
        raise SystemExit(f'Could not locate end of {domain} block')
    current = text[start:end + 2]
    if current != block.rstrip():
        backup = caddyfile.with_name(caddyfile.name + '.bak.' + datetime.now(UTC).strftime('%Y%m%d%H%M%S'))
        backup.write_text(text)
        caddyfile.write_text(text[:start] + block.rstrip() + text[end + 2:])
PY"

ssh "${SSH_HOST}" "cd '${CADDY_DIR}' && docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile"
ssh "${SSH_HOST}" "cd '${CADDY_DIR}' && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"

ssh "${SSH_HOST}" "docker ps --filter name='${APP_NAME}' --format 'table {{.Names}}\t{{.Status}}\t{{.Networks}}'"
ssh "${SSH_HOST}" "docker run --rm --network web curlimages/curl:8.11.1 -I --max-time 8 http://${APP_NAME}:3000/"
ssh "${SSH_HOST}" "docker run --rm --network web curlimages/curl:8.11.1 -I --max-time 8 -H 'Host: ${DOMAIN}' http://caddy-caddy-1/"
