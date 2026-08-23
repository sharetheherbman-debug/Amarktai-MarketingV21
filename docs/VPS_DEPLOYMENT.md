# EquiProfile Marketing — Controlled Fresh VPS Deployment

Canonical production host: `https://marketing.equiprofile.online`

This is the customer deployment runbook for the standalone, reusable Marketing service on the EquiProfile VPS. Marketing remains its own application/repository and connects to the host application only through the signed Application Connector.

## Release rules

- Deploy only the exact reviewed `DEPLOY_SHA`; never deploy an unreviewed branch head or `latest`.
- Marketing release source is PR #4, branch `release-candidate/marketing-product-2026-08-22`, until the release is deliberately merged/promoted.
- A fresh application install does **not** mean an unverified destructive wipe. Inventory and create a verified rollback backup before removing the old Marketing application stack.
- Do not delete another product's database, uploads, TLS certificates, reverse-proxy configuration, secrets or the verified rollback bundle.
- `FIRST_RUN=false` is the safe default. A new Marketing workspace/owner is established through the signed host-application SSO flow: the first authorized host admin becomes Marketing owner and must complete Marketing MFA.
- Shared host Nginx owns public ports 80/443. Marketing listens only on the configured loopback HTTP port (normally `127.0.0.1:8080`).
- Start core services first. Generation/render workers stay OFF until direct GenX acceptance succeeds.
- Start workers in order: generation → long-form still-motion → render.
- Default Control Centre state for acceptance: Manual with Emergency Stop ON.
- No paid-ad spend mutation during release proving.

## Minimum VPS

- Ubuntu 22.04 or 24.04
- Docker Engine 24+
- Docker Compose v2.20+
- 4 CPU cores
- 8 GB RAM
- 20 GB free disk minimum; substantially more recommended for generated media
- public DNS `marketing.equiprofile.online` → VPS IP

PostgreSQL and Redis are private Docker services. API/web are private containers. Internal Nginx binds only to loopback.

## Production environment

Use `.env.production.example` as the reference and replace every template/example value. `scripts/vps-release-gate.sh` fails closed when production topology, secrets, GenX, SMTP, host connector or backup prerequisites are still placeholders.

Required release-specific values include:

```dotenv
COMPOSE_PROJECT_NAME=marketing
DOMAIN=marketing.equiprofile.online
APP_URL=https://marketing.equiprofile.online
API_URL=https://marketing.equiprofile.online/api
CORS_ORIGIN=https://marketing.equiprofile.online
GENX_WEBHOOK_URL=https://marketing.equiprofile.online/api/v1/webhooks/genx
SHARED_HOST_NGINX=true
HTTP_PORT=8080
FIRST_RUN=false
ALLOW_FIRST_RUN_BOOTSTRAP=false
DEPLOY_BRANCH=release-candidate/marketing-product-2026-08-22
DEPLOY_SHA=<exact reviewed green-CI SHA>
```

Also set real production values for database/Redis passwords, JWT and encryption secrets, GenX API/webhook credentials, current verified FX rates, SMTP delivery, backup encryption and the generic `HOST_APP_*` connector identity/secrets. Connector/signing secrets must be at least 32 characters. The Marketing `HOST_APP_ID` must exactly match the ID configured by the host publisher.

Keep Stripe credit-checkout secrets blank unless paid Marketing credit checkout is deliberately enabled and separately accepted.

Set `GENX_FX_RATES_TO_GBP` from a current verified rate immediately before release acceptance. Price snapshots record the conversion rate used.

## 1. Read-only VPS inventory before changes

Before deleting or replacing anything, record without printing secret values:

- currently deployed Marketing source path/SHA and git status;
- Docker/Compose projects, containers, images, networks and volumes;
- disk/RAM usage;
- PostgreSQL and Redis ownership/volume mapping;
- uploads/generated-media volume/path;
- `.env.production` location and permissions;
- shared Nginx vhost and loopback port;
- certificate inventory;
- DNS for `marketing.equiprofile.online`;
- existing backup locations;
- any resources shared with Management/Academy/Shop.

Do not remove a volume, database, certificate, environment file or shared proxy configuration until its owner is proven.

When the reviewed release source is present, run:

```bash
bash scripts/vps-preflight.sh
```

Do not deploy if preflight fails.

## 2. Create and verify the rollback bundle

Before cleaning the old Marketing application stack, create a complete encrypted backup. If the old deployment predates the current backup script, take an independent database/media/environment backup first; do not assume a new script can understand an unknown old layout.

For a deployment already compatible with the current scripts:

```bash
bash scripts/vps-backup.sh
```

The current encrypted bundle covers:

- PostgreSQL custom-format dump;
- consistent Redis RDB snapshot;
- Studio uploads/generated media;
- `.env.production` inside the encrypted archive;
- exact git commit/branch/reviewed SHA metadata;
- Docker image/service inventory;
- host Nginx vhost when the configured path exists and is readable;
- certificate inventory when available;
- SHA-256 checksums.

Verify the generated `.sha256`, keep the encrypted bundle, and copy a rollback copy off-server before destructive cleanup.

## 3. Clean old Marketing application assets only

After inventory + verified backup, remove obsolete **Marketing-owned** application containers/releases/build caches/images that will be replaced by the fresh install.

Do not use a blind system-wide Docker prune and do not delete unidentified volumes. Preserve anything shared with the Core applications. The final cutover command set must be generated from the live VPS inventory so every removal target is named explicitly.

If the handover intentionally starts Marketing with a brand-new database/media state, old Marketing volumes may be removed only after their backup and ownership are verified. If any production data must be retained, keep/restore those volumes instead. This choice is a deployment decision, not something a generic cleanup command may infer.

## 4. Install the exact reviewed Marketing release

The fresh checkout must use the current release branch and exact frozen SHA:

```dotenv
DEPLOY_BRANCH=release-candidate/marketing-product-2026-08-22
DEPLOY_SHA=<exact frozen Marketing SHA>
```

After cloning/fetching the correct repository, verify the SHA and use detached exact-SHA release state. `scripts/vps-release-gate.sh` refuses a dirty worktree or SHA mismatch.

For an existing compatible checkout, `scripts/vps-update.sh` may be used; it creates a rollback bundle, fetches the explicit branch, verifies the reviewed SHA is reachable and checks out the exact SHA rather than pulling an arbitrary branch head.

Never replace `DEPLOY_SHA` with `latest`.

## 5. Core deployment and migrations

Run:

```bash
bash scripts/vps-deploy.sh core
```

Core stage:

1. runs preflight and exact-SHA release gate;
2. builds API, web, migration and worker images;
3. starts PostgreSQL and Redis;
4. runs every ordered migration, including 030/031/032 plus `033_product_line_campaign_intelligence.sql` and `034_generic_multi_product_scope.sql`;
5. starts API, web and internal Nginx only;
6. validates loopback readiness.

It does **not** start generation/render workers.

## 6. Host Nginx, DNS and TLS

With shared host Nginx:

- internal Marketing edge: `http://127.0.0.1:8080` unless the reviewed environment sets another loopback port;
- public host: `marketing.equiprofile.online`.

Verify DNS from the VPS and a public resolver. The dedicated host vhost must proxy only this hostname to Marketing's loopback edge and preserve the correct forwarded host/protocol headers.

Use the existing valid exact-host certificate or issue/renew a normal Let's Encrypt certificate. Do not remove certificates belonging to other applications during cleanup.

Once canonical HTTPS is working:

```bash
bash scripts/vps-smoke.sh public
```

## 7. Host connector, owner and MFA acceptance

For a fresh Marketing workspace, use the host application's signed connector rather than public registration:

1. signed connector health succeeds;
2. an authorized host `admin`/`superadmin` requests one-time SSO;
3. first authorized host admin becomes Marketing owner;
4. Marketing requires MFA enrollment/verification;
5. HttpOnly session cookies are established;
6. subsequent authorized host admins become Marketing admins rather than additional owners.

Also prove:

- `/` redirects to `/login` when unauthenticated;
- public registration remains disabled;
- wrong/replayed TOTP is rejected;
- recovery code is one-use;
- session refresh works through HttpOnly cookies;
- logout clears the session;
- protected routes reject logged-out users;
- SSO code is one-use and expires;
- non-admin host role is rejected;
- wrong connector key/HMAC, stale timestamp and replayed nonce fail closed.

If password login/password recovery is retained as an operational route, test it separately through the configured production SMTP path; it is not the ownership bootstrap mechanism for a fresh connector-created owner.

## 8. Generation Credit proving

Use only the reviewed authenticated grant/credit path needed for provider acceptance. If a promotional proving balance is granted, use a fixed idempotency key and verify:

- balance changes once only;
- immutable ledger evidence exists;
- repeating the same logical grant does not double-credit;
- available/reserved/lifetime totals remain consistent.

Do not enable public Stripe credit checkout merely to fund release tests.

## 9. Direct GenX acceptance — workers still OFF

Before starting queue workers, prove the authenticated GenX catalogue/rate card and direct governed generation with the final production key/configuration:

1. text;
2. image;
3. retained audio/voice capability, if enabled;
4. video;
5. long-form planning;
6. hybrid still-image + local-motion route.

For each supported operation verify:

quote → reserve → provider submission → result persistence → settle

and intentionally test one controlled provider failure:

failure → release/reversal

Record provider/model, price snapshot, reservation/ledger evidence and output asset. There must be no hidden fallback provider.

## 10. Start workers one at a time

Only after direct GenX acceptance:

```bash
bash scripts/vps-deploy.sh workers
```

The script gates each worker in order:

1. `generation-worker`;
2. `longform-still-worker`;
3. `render-worker`.

Then verify queues, retries, idempotency, restart behavior and bounded concurrency.

## 11. Social, email and analytics acceptance

The code-side social network supports the configured connectors for X, LinkedIn, Facebook, Instagram, Threads, Pinterest, Reddit, YouTube, TikTok, Bluesky, Mastodon and Telegram Channels.

TikTok public Direct Post remains dependent on TikTok's external app audit/permission state and creator consent. Code readiness does not override provider approval.

For every provider actually enabled for handover:

1. provider connection test;
2. owner-approved exact content version;
3. controlled publish;
4. provider post ID/URL;
5. performance sync where the provider exposes reliable metrics.

Email acceptance must prove the configured SMTP/provider delivery path, consent/suppression behavior and unsubscribe flow. Telegram post-level analytics must not be fabricated when the ordinary Bot API does not expose them.

Host conversion/snapshot acceptance must prove idempotent, privacy-safe events without raw customer PII, payment secrets, learning/health data or private supplier costs.

## 12. Autonomous campaign acceptance

With real approved business knowledge and channels:

1. website/connector knowledge refresh;
2. Growth Director identifies an opportunity;
3. campaign is created/validated internally;
4. reuse-first content production runs;
5. quality repair runs where needed;
6. owner requests changes on one asset;
7. targeted revision and re-review occur;
8. owner rejects another asset;
9. replacement or truthful retirement occurs;
10. owner approves exact versions;
11. approved content schedules/distributes under Control Centre;
12. performance/conversion events arrive;
13. optimisation/learning completes;
14. next cycle can begin.

Prove Emergency Stop blocks external actions.

## 13. Restore drill

Restore is destructive and requires explicit `--yes`. Use the **actual file created in `BACKUP_DIR`**, not a hard-coded historical EquiProfile path:

```bash
bash scripts/vps-restore.sh "$BACKUP_DIR/<generated-project-backup>.tar.gz.enc" --yes
```

Optional environment/Nginx restoration remains disabled unless explicitly enabled with the supported restore flags. Workers must remain held after restore unless explicitly requested and re-accepted.

A restore drill should be performed against a disposable/controlled target before relying on the backup as the only rollback path.

## 14. Do not move to Management until Marketing is frozen

Marketing acceptance is complete only after the exact Marketing head has green TypeScript, API tests, clean migrations, production build, Docker/Compose/proxy validation, security audit and Verification Suite, followed by production host/provider/browser acceptance.

Only then begin the separately reviewed Management work in the Core repository.

Final cross-application acceptance later must prove:

host hidden owner/admin → signed one-use SSO → Marketing → MFA → Marketing dashboard

and:

- normal customers cannot obtain Marketing admin access;
- replay/expired/bad-signature connector requests are rejected;
- conversion IDs are idempotent;
- Marketing outage never reverses the host transaction;
- connector secrets never enter browser code;
- the Marketing integration receives only allow-listed marketing-safe data.

## Release completion record

Record before handover:

- final frozen Marketing SHA;
- deployed SHA equals frozen SHA;
- migration set through 034;
- backup path + checksum + off-server copy status;
- database/media retention or fresh-state decision;
- certificate/vhost status;
- worker state;
- GenX/provider acceptance results;
- SMTP acceptance result;
- signed host-connector acceptance result;
- browser/responsive acceptance result;
- rollback/restore evidence.

Only then mark Marketing Phase 1 complete.
