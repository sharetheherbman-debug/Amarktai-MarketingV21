# EquiProfile Marketing — Controlled VPS Deployment

Canonical production host: `https://marketing.equiprofile.online`

This is the production runbook for the standalone Marketing service on the existing EquiProfile VPS. Management remains independently healthy and must not be restarted or modified until standalone Marketing acceptance passes.

## Release rules

- Deploy the exact reviewed `DEPLOY_SHA`, never an unreviewed branch head.
- PR #3 may remain draft/unmerged during deployment acceptance.
- Preserve the existing Marketing database, workspace and owner. Do not rerun owner bootstrap.
- `FIRST_RUN=false` on the existing production workspace.
- Shared host Nginx owns public ports 80/443. Marketing listens only on `127.0.0.1:8080`.
- Start core services first. Generation/render workers stay OFF until direct GenX acceptance succeeds.
- Start workers in order: generation → long-form still-motion → render.
- Default Control Centre state for acceptance: Manual with Emergency Stop ON.
- No paid-ad spend mutation.

## Minimum VPS

- Ubuntu 22.04 or 24.04
- Docker Engine 24+
- Docker Compose v2.20+
- 4 CPU cores
- 8 GB RAM
- 20 GB free disk minimum; substantially more recommended for generated media
- public DNS `marketing.equiprofile.online` → VPS IP

PostgreSQL and Redis are private Docker services. API/web are private containers. Internal Nginx binds only to loopback port 8080.

## Production environment

Use `.env.production.example` as the reference, but preserve existing production secrets rather than replacing them casually.

Required release-specific values include:

```dotenv
DOMAIN=marketing.equiprofile.online
APP_URL=https://marketing.equiprofile.online
API_URL=https://marketing.equiprofile.online/api
CORS_ORIGIN=https://marketing.equiprofile.online
GENX_WEBHOOK_URL=https://marketing.equiprofile.online/api/v1/webhooks/genx
SHARED_HOST_NGINX=true
FIRST_RUN=false
DEPLOY_BRANCH=phase-1/equiprofile-relaunch-genx-credits
DEPLOY_SHA=<exact reviewed green-CI SHA>
```

Keep Stripe credit checkout secrets blank for Phase 1 proving unless paid checkout is deliberately enabled later. The 1,000 proving credits are an idempotent promotional grant, not a Stripe purchase.

Set `GENX_FX_RATES_TO_GBP` from a current verified rate immediately before release acceptance. Price snapshots record the conversion rate used.

## 1. Read-only preflight before changes

Before updating source, inspect the existing install, exact deployed SHA, Git status, containers, disk/RAM, loopback health, DNS, Nginx and backup location without printing `.env.production` or provider secrets.

The repository preflight performs environment/Compose/resource checks and live authenticated GenX catalogue/pricing checks:

```bash
bash scripts/vps-preflight.sh
```

Do not run deployment if preflight fails.

## 2. Complete encrypted rollback bundle

Before changing source:

```bash
bash scripts/vps-backup.sh
```

The encrypted bundle contains:

- PostgreSQL custom-format dump
- consistent Redis RDB snapshot
- Studio uploads/generated media
- `.env.production` inside the encrypted archive
- exact git commit/branch/reviewed SHA metadata
- Docker image/service inventory
- host Nginx vhost when `HOST_NGINX_CONFIG_PATH` exists and is readable
- Certbot certificate inventory when available
- SHA-256 checksums for every bundled component

Keep the `.enc` and `.sha256` files. Copy them off-server after launch acceptance.

## 3. Update to the exact reviewed SHA

Preferred safe update:

```bash
bash scripts/vps-update.sh
```

The update script:

1. creates a rollback bundle;
2. fetches `DEPLOY_BRANCH`;
3. verifies `DEPLOY_SHA` is reachable from the branch;
4. notices but ignores a newer branch head;
5. checks out the exact reviewed SHA in detached release state;
6. deploys **core only**;
7. returns source to the previous commit if core deployment fails.

Never replace `DEPLOY_SHA` with “latest”.

## 4. Core deployment

For a manual exact-SHA deployment after the source is already checked out:

```bash
bash scripts/vps-deploy.sh core
```

Core stage:

1. runs preflight and exact-SHA release gate;
2. builds API, web, migrations and all worker images;
3. starts PostgreSQL and Redis;
4. runs all additive migrations, including 030/031/032;
5. starts API, web and internal Nginx only;
6. validates loopback readiness.

It does **not** start any generation/render worker.

## 5. Host Nginx, DNS and TLS

With shared host Nginx:

- internal Marketing edge: `http://127.0.0.1:8080`
- public host: `marketing.equiprofile.online`

Verify DNS from the VPS and a public resolver before certificate issuance. Configure a dedicated host vhost that proxies only this hostname to `127.0.0.1:8080` with correct forwarded protocol/host headers.

Issue/renew a normal exact-host Let's Encrypt certificate. No wildcard certificate is required.

Once canonical HTTPS is working:

```bash
bash scripts/vps-smoke.sh public
```

## 6. Owner authentication acceptance

Preserve the existing owner/workspace. Do not create a second owner.

Prove:

- `/` → `/login` when unauthenticated
- no public signup/landing/pricing access
- owner password login
- TOTP enrollment if required by migration/state
- QR/manual TOTP
- recovery codes
- wrong/replayed TOTP rejection
- recovery-code one-time use
- session refresh
- logout
- protected-route rejection when logged out
- Management SSO still requires Marketing MFA

## 7. Promotional Generation Credits

Grant exactly 1,000 promotional/internal proving credits through the authenticated platform-admin grant path with a fixed idempotency key.

Verify:

- wallet +1,000 once only
- immutable ledger entry
- repeat request does not double-credit
- available/reserved/lifetime totals remain consistent

## 8. Direct GenX acceptance — workers still OFF

Before starting queue workers, prove the authenticated GenX catalogue/rate card and direct governed generation:

1. text
2. image
3. voice/audio if retained
4. video
5. long-form planning
6. hybrid still-image + local-motion route

For each operation verify:

quote → reserve → provider submission → result persistence → settle

and intentionally test one controlled failure:

failure → release/reversal

Record provider/model, price snapshot, reservation/ledger evidence and output asset.

## 9. Start workers one at a time

After direct GenX passes:

```bash
bash scripts/vps-deploy.sh workers
```

The script gates each worker in order:

1. `generation-worker`
2. `longform-still-worker`
3. `render-worker`

Then verify queues, retries, idempotency, restart behavior and bounded concurrency.

## 10. Social, email and analytics acceptance

The code-side social network supports:

- X
- LinkedIn
- Facebook
- Instagram
- Threads
- Pinterest
- Reddit
- YouTube
- TikTok
- Bluesky
- Mastodon
- Telegram Channels

TikTok public Direct Post remains dependent on TikTok's external app audit/permission state and creator consent. A code-ready connector does not override provider approval.

Connect only real accounts with proper permissions. For every enabled/credentialed connector:

1. provider connection test;
2. owner-approved content version;
3. controlled publish;
4. provider post ID/URL;
5. performance sync where the provider exposes reliable metrics.

Telegram post-level analytics are truthfully unavailable through ordinary Bot API access and must not be represented as zero engagement.

Email acceptance must prove consent basis, suppression, signed one-click unsubscribe, provider delivery, retries and exact content approval.

Analytics/host conversion acceptance must prove idempotent privacy-safe events without raw customer PII.

## 11. Autonomous campaign acceptance

With real business knowledge and approved channels:

1. website/connector knowledge refresh;
2. Growth Director identifies an opportunity;
3. creates/validates campaign internally;
4. reuse-first content production;
5. quality repair;
6. owner requests changes on one asset;
7. automatic targeted revision and re-review;
8. owner rejects another asset;
9. replacement or truthful retirement;
10. owner approves exact versions;
11. approved content schedules/distributes under Control Centre;
12. performance/conversion events arrive;
13. optimisation/learning completes;
14. next cycle can begin.

Prove Emergency Stop blocks external actions.

## 12. Restore drill

Restore is intentionally destructive and requires explicit `--yes`. It restores PostgreSQL, Redis and Studio media, then starts core only.

```bash
bash scripts/vps-restore.sh /opt/equiprofile-marketing/backups/equiprofile-marketing-YYYYMMDDTHHMMSSZ.tar.gz.enc --yes
```

Optional environment/Nginx restoration is disabled unless explicitly enabled with `RESTORE_PRODUCTION_ENV=1` or `RESTORE_HOST_NGINX=1`.

Workers remain held after restore unless `RESTORE_WORKERS=1` is explicitly set.

## 13. Management deployment only after Marketing passes

Do not touch healthy Management until standalone Marketing acceptance is complete.

Then deploy the separately reviewed Management SHA and verify Pro, Stable, auth, subscriptions, hidden owner admin, V2 dashboard and mobile/PWA before joining the systems.

Final combined acceptance:

Management hidden owner admin → signed one-use SSO → Marketing → MFA → owner dashboard

Also prove:

- normal customers cannot access Marketing
- replay/expired/bad-signature SSO rejected
- `account_registered` and `subscription_payment_recorded` are idempotent
- Marketing outage never breaks Management
- connector secrets never enter browser code

## Release completion

Record final deployed SHAs, migration set, backup path/checksum, certificate name, worker state, provider acceptance results and rollback procedure. Only then freeze Phase 1.
