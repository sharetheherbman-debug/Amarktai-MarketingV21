# Deployment Guide

The canonical production runbook is [`VPS_DEPLOYMENT.md`](./VPS_DEPLOYMENT.md).

AmarktAI Marketing is deployed as a CPU-only Docker Compose stack containing:

- PostgreSQL 16 with pgvector
- Redis 7 with AOF persistence
- Express API
- BullMQ generation worker
- BullMQ FFmpeg render worker
- Next.js web application
- Internal Nginx reverse proxy
- Caddy automatic HTTPS edge

## Production

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Replace every placeholder and add the real GenX credentials.
bash scripts/vps-preflight.sh
bash scripts/vps-deploy.sh
```

Production URL: `https://marketing.amarktai.co.za`

Do not expose PostgreSQL, Redis, the API, or the web container directly to the internet. Only Caddy publishes ports 80 and 443. Nginx is available on `127.0.0.1:8080` for local diagnostics.

## Local Docker validation

The base stack can be built and validated with:

```bash
cp .env.example .env
npm run docker:build
npm run docker:up
```

The internal Nginx endpoint is then available at `http://127.0.0.1:8080`.

## Operations

```bash
npm run vps:preflight
npm run vps:deploy
npm run vps:smoke
npm run vps:backup
npm run vps:update
```

Restore requires a backup path and explicit confirmation:

```bash
npm run vps:restore -- /opt/amarktai/backups/amarktai-YYYYMMDDTHHMMSSZ.tar.gz.enc --yes
```

See [`VPS_DEPLOYMENT.md`](./VPS_DEPLOYMENT.md) for DNS, firewall, secret generation, automated backups, restore, update, rollback, logs, first-run onboarding, and final GenX acceptance steps.
