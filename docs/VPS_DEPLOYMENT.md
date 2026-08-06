# AmarktAI Marketing VPS Deployment

This runbook deploys the complete CPU-only Docker stack to the production domain `marketing.amarktai.co.za`.

## Required VPS

- Ubuntu 22.04 or 24.04
- At least 4 CPU cores
- At least 8 GB RAM
- At least 20 GB free disk, with more space recommended for generated media
- Docker Engine 24+
- Docker Compose v2.20+
- Public inbound TCP ports 80 and 443
- DNS `A` record for `marketing.amarktai.co.za` pointing to the VPS

PostgreSQL, Redis, the API, the web app, both BullMQ workers, Nginx, Caddy and FFmpeg all run in Docker. No GPU is required.

## 1. Install Docker

Use Docker's official Ubuntu repository, then confirm:

```bash
docker version
docker compose version
```

Add the deployment user to the Docker group and start a new login session:

```bash
sudo usermod -aG docker "$USER"
```

## 2. Clone the repository

```bash
sudo mkdir -p /opt/amarktai
sudo chown "$USER":"$USER" /opt/amarktai
git clone https://github.com/sharetheherbman-debug/Amarktai-MarketingV21.git /opt/amarktai/app
cd /opt/amarktai/app
git checkout development
```

Until PR #2 is merged, use `feature/phase-5-finish-and-launch` for an acceptance deployment only.

## 3. Create production configuration

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate safe values without shell punctuation:

```bash
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # REDIS_PASSWORD
openssl rand -hex 48   # JWT_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY: exactly 64 hex characters
openssl rand -hex 48   # GENX_WEBHOOK_SECRET
openssl rand -hex 48   # BACKUP_ENCRYPTION_PASSPHRASE
```

Edit `.env.production` and provide the real GenX key, TLS email and SMTP credentials when email delivery is required. Do not leave any `replace-with-...` value.

The required public values are:

```dotenv
DOMAIN=marketing.amarktai.co.za
APP_URL=https://marketing.amarktai.co.za
API_URL=https://marketing.amarktai.co.za/api
CORS_ORIGIN=https://marketing.amarktai.co.za
GENX_WEBHOOK_URL=https://marketing.amarktai.co.za/api/v1/webhooks/genx
```

## 4. Configure DNS and firewall

Point the DNS `A` record to the VPS before deployment. Caddy obtains and renews the TLS certificate automatically.

With UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

PostgreSQL, Redis, API and web ports are not published publicly. The internal Nginx diagnostic port is bound only to `127.0.0.1:8080`.

## 5. Run preflight

```bash
bash scripts/vps-preflight.sh
```

Preflight rejects placeholder or weak secrets, invalid URLs, insufficient resources and invalid Compose configuration.

## 6. Deploy

```bash
bash scripts/vps-deploy.sh
```

The deployment command:

1. Validates the VPS and production environment.
2. Pulls pinned infrastructure images.
3. Builds API, web and worker images.
4. Starts PostgreSQL and Redis.
5. Runs all migrations exactly once.
6. Starts API, generation worker, render worker, web, Nginx and Caddy.
7. Waits for PostgreSQL, Redis and both BullMQ workers to report ready.
8. Runs the public HTTPS smoke test.

Successful deployment ends with:

```text
Deployment completed successfully: https://marketing.amarktai.co.za
```

## Health endpoints

- `https://marketing.amarktai.co.za/health` — edge liveness
- `https://marketing.amarktai.co.za/ready` — database, Redis and worker readiness
- `https://marketing.amarktai.co.za/api/v1/health` — API liveness
- `https://marketing.amarktai.co.za/api/v1/health/version` — release metadata

Run the smoke test again at any time:

```bash
bash scripts/vps-smoke.sh
```

## Logs and status

```bash
docker compose \
  --env-file .env.production \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.production.yml ps

docker compose \
  --env-file .env.production \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.production.yml logs -f --tail=200 api generation-worker render-worker
```

Container logs rotate at 20 MB with five retained files.

## Encrypted backups

Create a database and Studio-media backup:

```bash
bash scripts/vps-backup.sh
```

The backup contains:

- PostgreSQL custom-format dump
- Uploaded and generated Studio media
- Git commit and image inventory
- Per-file SHA-256 checksums
- AES-256-CBC encryption using PBKDF2 with 200,000 iterations

Schedule nightly backups:

```cron
0 2 * * * cd /opt/amarktai/app && /usr/bin/bash scripts/vps-backup.sh >> /var/log/amarktai-backup.log 2>&1
```

Copy encrypted backup files off the VPS using the storage provider of your choice. Local retention defaults to 30 days.

## Restore

```bash
bash scripts/vps-restore.sh /opt/amarktai/backups/amarktai-YYYYMMDDTHHMMSSZ.tar.gz.enc --yes
```

Restore verifies the encrypted archive checksum and internal file checksums before replacing the database or media volume. It then runs current migrations, restarts the stack and executes the public smoke test.

## Safe updates and rollback

After PR #2 is merged into `development`:

```bash
bash scripts/vps-update.sh
```

The update workflow creates an encrypted backup first, fast-forwards the configured branch, deploys it, and resets to the previous Git commit automatically if deployment fails.

## First production login

Keep `FIRST_RUN=true` for initial deployment. Complete the onboarding wizard and create the production admin account. After onboarding has completed successfully, set:

```dotenv
FIRST_RUN=false
```

Then apply the configuration:

```bash
bash scripts/vps-deploy.sh
```

## Final external acceptance

Repository readiness does not replace provider acceptance. Before public launch, run real GenX image, video, voice, audio and lip-sync jobs; verify the signed webhook; render the six-scene film of at least 60 seconds; record provider job IDs and costs; restart the workers during queued work; and rerun `scripts/vps-smoke.sh` after the restart.
