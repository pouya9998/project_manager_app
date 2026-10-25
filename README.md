# PMO — Project Management System

Persian (RTL) project management app inspired by Jira: kanban tasks, GitLab integration, team chat, time tracking, and PWA push notifications.

Detailed install guide (Persian): **[INSTALL.md](./INSTALL.md)**

## Features

- **Kanban board** — desktop drag-and-drop; mobile-friendly column switcher
- **Projects** — per-project workflow steps (custom columns)
- **Tasks** — assignees, priorities, attachments, comments with @mentions
- **GitLab** — link projects, commits, and merge requests to tasks
- **Chat** — groups & DMs, voice notes, images, polls, emoji, delivery/read receipts, task/project mentions
- **Meetings** — Jalali calendar, self-hosted **Jitsi** rooms (Docker) or external Meet/Zoom links, online presence
- **Notifications** — in-app bell + Web Push (installable PWA)
- **Time tracking** — users log hours; admins approve / adjust / reject
- **Branding** — app name, tagline, logo, primary color
- Fully **Persian RTL** UI

## Tech stack

| Layer | Stack |
|--------|--------|
| Backend | NestJS, Prisma, PostgreSQL, Socket.IO, Web Push |
| Frontend | React, Vite, Tailwind CSS, PWA |
| Deploy | Docker Compose |

## Quick start (Docker)

```bash
docker compose up --build -d
```

Open: **http://localhost:3080**

Docker builds use **Liara’s npm mirror** for packages and **npmmirror** for Prisma engine binaries (`binaries.prisma.sh` is often blocked).

### Default accounts

| Role | Email | Password |
|------|--------|----------|
| Admin | `admin@pmo.local` | `Admin@123` |
| User | `dev@pmo.local` | `User@123` |
| User | `frontend@pmo.local` | `User@123` |

Change these passwords after first login.

### Useful commands

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

### Jitsi (video meetings)

```bash
mkdir -p jitsi/jitsi-cfg/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri}
docker compose -f jitsi/docker-compose.yml --env-file jitsi/.env up -d
```

- Jitsi UI: http://localhost:8091
- Set `JVB_ADVERTISE_IPS` in `jitsi/.env` to your LAN/public IP  
- Backend `JITSI_PUBLIC_URL` must match `PUBLIC_URL` (see `docker-compose.yml`)  
- Details: [jitsi/README.md](./jitsi/README.md)

## Local development

Requires **Node.js 20+** and PostgreSQL (or just the Compose `db` service).

```bash
# Database
docker compose up -d db
# Add ports: "5432:5432" under db in docker-compose.yml if needed

# Backend
cd backend
cp .env.example .env
# Set DATABASE_URL to localhost if needed, e.g.
# postgresql://pmo:pmo@localhost:5432/pmo?schema=public
npm install
npx prisma migrate deploy
node prisma/seed.js
npm run start:dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3001/api  

## Typical workflow

1. Admin configures **GitLab** (base URL + access token) and tests the connection.
2. Admin creates **projects** (optionally from GitLab) and optional workflow steps.
3. Team creates **tasks** on the board, assigns people, attaches files.
4. Users link **commits / MRs**, comment, and log **effort hours**.
5. Admin reviews hours under **Time**.
6. Team uses **Chat** for groups/DMs; enable notifications for push alerts.

## Project structure

```text
pmo/
├── backend/           # NestJS + Prisma + Socket.IO
├── frontend/          # React + Vite + Tailwind (RTL)
├── docker-compose.yml
├── INSTALL.md         # Full install guide (Persian)
└── README.md
```

## Environment (backend)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `PORT` | API port (default `3001`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional; auto-generated for Web Push if omitted |

## GitLab Engineering

- Only **SOFTWARE** projects can link to GitLab; **NON_SOFTWARE** projects are rejected by the API.
- Tokens are encrypted at rest (AES-256-GCM from `JWT_SECRET`); API responses never return the raw token.
- Configure webhook: `POST /api/gitlab/webhooks` with `X-Gitlab-Token`.
- Manual sync: `POST /api/projects/:id/gitlab/sync`.
- Auto-link commits/MRs that mention `#taskId` or `TASK-123`.
- Engineering dashboard metrics (admin): WIP, overdue, open/stale MRs, pipeline success rate, lead/cycle time — see `INSTALL.md` and `engineering.service.ts`.

Token scopes: prefer `api` (or `read_api` for read-only). See **INSTALL.md** for webhook setup and acceptance checklist.

## License

Private / internal use unless otherwise specified.
