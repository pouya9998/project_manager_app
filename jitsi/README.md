# Jitsi Meet (Docker)

Self-hosted video for PMO meetings. Official stack: [docker-jitsi-meet](https://github.com/jitsi/docker-jitsi-meet).

## Why “WebRTC is not available”?

Browsers **block WebRTC** on insecure origins. This is a browser rule — Jitsi cannot override it.

| URL | WebRTC |
|-----|--------|
| `http://localhost:8091` | OK |
| `http://SERVER_IP:8091` | **Blocked** |
| `https://…` (even self-signed) | OK after you accept the cert warning |

**You cannot use plain HTTP for remote users.** No domain? Use self-signed HTTPS below (no Let’s Encrypt).

## Start (local only)

From the **repo root**:

```bash
cp -n jitsi/.env.example jitsi/.env
mkdir -p jitsi/jitsi-cfg/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri}
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env up -d
```

Open: **http://localhost:8091**

PMO uses `JITSI_PUBLIC_URL` (root `docker-compose.yml`) and rooms like `pmo12abcd`.

## No domain / no Let’s Encrypt (self-signed HTTPS)

Jitsi can generate its own certificate. Users click through the browser warning once; WebRTC then works.

### 1. `jitsi/.env` on the server

Replace `YOUR_PUBLIC_IP` with the IP clients use:

```env
PUBLIC_URL=https://YOUR_PUBLIC_IP:8443
DISABLE_HTTPS=0
ENABLE_LETSENCRYPT=0
ENABLE_HTTP_REDIRECT=0
HTTPS_PORT=8443
HTTP_PORT=8091
JVB_ADVERTISE_IPS=YOUR_PUBLIC_IP
JVB_PORT=10000
```

### 2. Firewall + restart

```bash
sudo ufw allow 8443/tcp
sudo ufw allow 10000/udp
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env up -d
```

### 3. PMO backend

```yaml
JITSI_PUBLIC_URL: https://YOUR_PUBLIC_IP:8443
```

```bash
docker compose up -d backend
```

### 4. Clients

Open `https://YOUR_PUBLIC_IP:8443` → Advanced → Proceed (self-signed). Then join from PMO as usual.

---

## Production with a real domain (optional later)

Nginx TLS + Let’s Encrypt, `PUBLIC_URL=https://meet.yourdomain.com`, `DISABLE_HTTPS=1`, proxy to `127.0.0.1:8091`, open `443/tcp` + `10000/udp`, same URL in `JITSI_PUBLIC_URL`.

### Quick HTTP-only test (SSH tunnel)

Browser sees localhost, so HTTP WebRTC works:

```bash
ssh -L 8091:127.0.0.1:8091 user@SERVER
# open http://localhost:8091/roomName
```

## Stop

```bash
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env down
```
