# Deployment Guide

The canonical production runbook is [`VPS_DEPLOYMENT.md`](./VPS_DEPLOYMENT.md). Follow that document for the complete fresh-install inventory, backup, cleanup, deployment, provider/browser acceptance and rollback procedure.

EquiProfile Marketing is the first customer deployment of the reusable standalone Marketing application. It runs as a CPU-only Docker Compose stack containing:

- PostgreSQL 16 with pgvector;
- Redis 7 with persistent state;
- Express API;
- BullMQ generation worker;
- BullMQ long-form still-motion worker;
- BullMQ FFmpeg render worker;
- Next.js web application;
- internal Nginx reverse proxy.

Production URL: `https://marketing.equiprofile.online`

On the EquiProfile VPS, the host Nginx owns public ports 80/443 and proxies only the Marketing hostname to the configured loopback Marketing edge, normally `127.0.0.1:8080`. Caddy is used only for a standalone deployment when `SHARED_HOST_NGINX=false`.

## Controlled production sequence

Do not delete the existing Marketing application stack first. Read-only inventory and a verified rollback backup must exist before cleanup.

For a compatible existing checkout, the safe sequence begins with:

```bash
# Exact reviewed SHA and all real production values must be configured in .env.production.
bash scripts/vps-preflight.sh
bash scripts/vps-release-gate.sh
bash scripts/vps-backup.sh
```

For the handover fresh install, use only the frozen Marketing SHA from:

```dotenv
DEPLOY_BRANCH=release-candidate/marketing-product-2026-08-22
DEPLOY_SHA=<exact frozen green-CI Marketing SHA>
```

After the old Marketing-owned application assets have been explicitly classified and safely removed according to the canonical runbook, install/check out the exact SHA and deploy core:

```bash
bash scripts/vps-deploy.sh core
```

Do not start generation/render workers until signed host connector/SSO + Marketing MFA, GenX catalogue/pricing and direct governed generation have passed.

Then:

```bash
bash scripts/vps-deploy.sh workers
bash scripts/vps-smoke.sh full
```

After DNS/host Nginx/TLS are confirmed:

```bash
bash scripts/vps-smoke.sh public
```

Safe source updates use the explicit branch only to locate the reviewed commit and always deploy the exact `DEPLOY_SHA`:

```bash
bash scripts/vps-update.sh
```

Restore requires a complete encrypted rollback bundle and explicit confirmation. Use the actual project-scoped backup produced in `BACKUP_DIR`; do not use a historical hard-coded EquiProfile filename:

```bash
bash scripts/vps-restore.sh "$BACKUP_DIR/<generated-project-backup>.tar.gz.enc" --yes
```

`FIRST_RUN=false` is the safe default. For a fresh workspace, the first authorized administrator entering through the signed host Application Connector becomes Marketing owner and must complete Marketing MFA; subsequent authorized host administrators become Marketing admins.

Do not remove databases, volumes, uploads, environment files, certificates, host Nginx configuration or rollback backups unless the canonical runbook's inventory proves they are Marketing-owned and the handover explicitly chooses to discard/replace that state.

See the canonical runbook for exact-SHA pinning, production environment preflight, encrypted PostgreSQL/Redis/media/config backups, migration coverage through 034, MFA, Generation Credits, GenX acceptance, staged workers, social/email/analytics acceptance, autonomous campaign proof, restore and final host↔Marketing connector acceptance.
