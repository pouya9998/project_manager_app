# Jitsi Meet (Docker)

Self-hosted video for PMO meetings. Official stack: [docker-jitsi-meet](https://github.com/jitsi/docker-jitsi-meet).

## Start

From the **repo root**:

```bash
mkdir -p jitsi/jitsi-cfg/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri}
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env up -d
```

Open: **http://localhost:8091**

PMO meetings use `JITSI_PUBLIC_URL` (see root `docker-compose.yml`) and create rooms like `pmo12abcd`.

## Production checklist

1. Set `PUBLIC_URL=https://meet.yourdomain.com` in `jitsi/.env`
2. Set `JVB_ADVERTISE_IPS=` to the server’s public IP
3. Open firewall: **8000/tcp** (or 443 via reverse proxy), **10000/udp**
4. Prefer TLS (`DISABLE_HTTPS=0`, Let’s Encrypt or reverse proxy)
5. Mirror the same URL in backend `JITSI_PUBLIC_URL`
6. Regenerate XMPP passwords in `.env` (do not use the committed dev secrets)

## Stop

```bash
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env down
```
