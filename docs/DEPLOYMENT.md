# Deployment Guide

The canonical production runbook is [`VPS_DEPLOYMENT.md`](./VPS_DEPLOYMENT.md).

EquiProfile Marketing is deployed as a CPU-only Docker Compose stack containing:

- PostgreSQL 16 with pgvector
- Redis 7 with persistent state
- Express API
- BullMQ generation worker
- BullMQ long-form still-motion worker
- BullMQ FFmpeg render worker
- Next.js web application
- internal Nginx reverse proxy

Production URL: `https://marketing.equiprofile.online`

On the EquiProfile VPS, the existing host Nginx owns public ports 80/443 and proxies only the Marketing hostname to the internal edge at `127.0.0.1:8080`. Caddy is used only for a standalone deployment when `SHARED_HOST_NGINX=false`.

## Controlled production sequence

```bash
# Exact reviewed SHA must be configured in .env.production.
bash scripts/vps-preflight.sh
bash scripts/vps-release-gate.sh
bash scripts/vps-backup.sh
bash scripts/vps-deploy.sh core
```

Do not start workers until owner auth/MFA, GenX catalogue/pricing and direct governed generation have passed.

Then:

```bash
bash scripts/vps-deploy.sh workers
bash scripts/vps-smoke.sh full
```

After DNS/host Nginx/TLS are confirmed:

```bash
bash scripts/vps-smoke.sh public
```

Safe source updates use `DEPLOY_SHA`, not branch head:

```bash
bash scripts/vps-update.sh
```

Restore requires a complete encrypted rollback bundle and explicit confirmation:

```bash
bash scripts/vps-restore.sh /opt/equiprofile-marketing/backups/equiprofile-marketing-YYYYMMDDTHHMMSSZ.tar.gz.enc --yes
```

The existing owner/workspace is preserved; `FIRST_RUN=false`. Do not rerun first-run owner bootstrap.

See the canonical runbook for DNS/TLS, encrypted PostgreSQL/Redis/media/config backups, exact-SHA pinning, MFA, Generation Credits, GenX acceptance, staged workers, 12-network organic social acceptance, autonomous campaign proof, restore and final Management↔Marketing SSO acceptance.
