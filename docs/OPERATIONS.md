# Operations

## Health and readiness

Monitor API/web health, PostgreSQL, Redis authentication/connectivity, queue depth/latency, worker heartbeat, failed jobs, provider catalogue/pricing freshness, durable-media storage, credit reserves/settlements, connector failures, publication failures, and Emergency Stop state. A process being alive is not sufficient readiness when a required dependency is unavailable.

## Workers

The production stack defines generation, long-form still-motion, and render workers. Each worker must use the configured authenticated Redis endpoint, canonical queue names, bounded concurrency, safe retry classification, cancellation, deterministic idempotency, durable storage, credit reversal, heartbeat, and graceful shutdown.

Workers are activated separately during deployment. Do not start production workers merely because images build.

## Polling and rate limits

Clients poll generation state with endpoint-appropriate intervals, exponential backoff/jitter, `Retry-After` handling, visibility-aware pausing, and terminal-state detection. They stop polling on completion, failure, cancellation, unauthorised state, or a bounded timeout. Server rate limits remain enabled; repeated `429` responses are handled rather than bypassed.

## Durable media

Monitor ingestion failures, unsupported types, file-size rejection, SSRF rejection, provider URL expiry, missing files, storage capacity, checksum/probe failures, and organisation access denial. Final image/video/audio, long-form intermediates required for retry, captions, thumbnails, and final MP4s must remain available after provider URLs expire.

## Backups

Back up PostgreSQL, durable media, production configuration/secrets through the owner’s secret-management process, proxy/TLS configuration, and the deployment record. Redis queue data is operational state; database/media backups remain authoritative. Encrypt backups, record checksums, enforce retention, and test restore in an isolated environment.

## Incident priorities

1. Activate Emergency Stop when external or paid actions may continue unsafely.
2. Preserve logs, job IDs, ledger entries, external references, and affected organisation scope without exposing secrets.
3. Prevent duplicate retries/publications/charges.
4. Restore safe read access and truthful failure visibility.
5. Reconcile reservations, settlements, reversals, jobs, assets, and provider state before resuming automation.

## Routine maintenance

- verify backups and restore evidence;
- review failed/dead-letter jobs and credit reconciliation;
- refresh provider catalogue/pricing and inspect freshness;
- review connector replay/origin failures;
- review publication retries and suppression/unsubscribe behaviour;
- inspect security/dependency findings;
- confirm media retention/capacity and download checks;
- confirm exact deployed SHA and image provenance.

## Secret handling

Never print provider keys, connector secrets, session secrets, database passwords, SMTP credentials, or access/refresh tokens. Logs should use request/job/application identifiers and redacted configuration state.
