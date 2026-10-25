#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p jitsi/jitsi-cfg/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri}
mkdir -p jitsi/jitsi-cfg/storage/{web,transcripts,prosody} jitsi/jitsi-cfg/tmp/web-load-test
# Prosody runs as uid 1000 and needs a writable data dir
docker run --rm -u 0 \
  -v "$ROOT/jitsi/jitsi-cfg/storage/prosody:/data" \
  alpine chown -R 1000:1000 /data 2>/dev/null || true
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env up -d
echo "Jitsi: ${PUBLIC_URL:-http://localhost:8091}"
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env ps
