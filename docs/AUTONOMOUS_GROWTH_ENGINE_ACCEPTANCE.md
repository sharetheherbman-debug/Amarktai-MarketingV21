# EquiProfile Autonomous Growth Engine Acceptance

This document describes the final code candidate on `phase-1/equiprofile-relaunch-genx-credits`. It is a deployment handoff, not evidence that production, DNS, external providers, or live accounts have been changed or tested.

## Governance boundary

- Campaign strategy is planned and internally validated. Missing business facts produce owner clarification questions; strategy approval is not a production gate.
- Every customer-facing social or email payload must be the exact current content version approved by the organization owner. The approval stores a canonical SHA-256 snapshot, and delivery rechecks the body, subject, platform, media, hashtags, version, reviewer role, and snapshot hash.
- Owner approval does not bypass the Control Centre. Autonomous scheduling and due-post publishing still recheck operating mode, allowed channels, policy version, time window, limits, Emergency Stop, idempotency, and payload hash immediately before execution.
- Advertising remains read/sync-only. The engine cannot create paid spend.

## Autonomous lifecycle

The scheduler provisions 19 durable specialist roles per organization, refreshes versioned business knowledge, observes material change events, and advances durable cycles through observing, planning, producing, quality review, owner approval, governed distribution, measurement, optimization, and completion. Claims prevent concurrent execution and retries are bounded. Approved social campaign assets are scheduled through the same Control Centre service used by the user-facing API; no separate publisher exists.

The shared context combines signed host-application snapshots, website versions, Brand DNA, workspace knowledge, campaigns, content inventory, trends, competitors, conversions, and privacy-safe performance events. Content selection is reuse-first and records root/source lineage and transformation type. New generation performs bounded quality review and at most two governed revisions.

## Launch platform capability matrix

| Platform | Connection | Text | Image | Video | Multi-image/carousel | Scheduling/publishing | Analytics | Launch state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X | Yes | Yes | No | No | No | Yes | No | Enabled; text only |
| LinkedIn | Yes | Yes | No | No | No | Yes | No | Enabled; text only |
| Facebook | Yes | Yes | Link only | No | No | Yes | No | Enabled; Page feed text/link |
| Instagram | Yes | No | One image | No | No | Yes | No | Enabled; Business single image |
| Threads | Yes | Yes | No | No | No | Yes | No | Enabled; text only |
| Pinterest | Yes | No | One image | No | No | Yes | No | Enabled; one image to configured board |
| Reddit | Yes | Yes | Link only | No | No | Yes | No | Enabled; self/link post |
| YouTube | Yes | No | No | One video | No | Yes | No | Enabled; upload defaults private |
| TikTok | No | No | No | No | No | No | No | Hidden pending app audit, `video.publish`, consent UX, and status polling |
| Bluesky | No | No | No | No | No | No | No | Deferred and hidden |
| Mastodon | No | No | No | No | No | No | No | Deferred and hidden |
| Telegram | No | No | No | No | No | No | No | Deferred and hidden |

All enabled publication formats require exact owner-approved content. Provider-native analytics collection is not implemented in this release; attribution currently comes from first-party performance and conversion events. OAuth credentials, account permissions, application review where applicable, and one sandbox connection/publish acceptance per enabled platform remain deployment gates.

## Data and migrations

Migration `030_autonomous_growth_engine.sql` is additive. It adds durable workforce identity, internal plan validation, approval hashes, social approval bindings, email suppression/delivery logs, versioned knowledge synchronization, business snapshots and change events, durable director cycles/events, privacy-safe performance attribution, bounded experiments, learned owner preferences, and consent-state social proof. Autonomous event and performance history reject update/delete mutations.

Run all migrations once using the existing migration container before workers start. Verify migration `030` in `schema_migrations`, inspect constraints/indexes, and take a database backup before proceeding. The local Windows environment used for code completion did not provide Docker or an isolated PostgreSQL instance, so this migration must be executed on the acceptance stack before the candidate can receive production traffic.

## External acceptance gates

1. Deploy Marketing's exact reviewed SHA first with external channels held and Emergency Stop enabled.
2. Verify DNS/TLS, database/Redis/worker readiness, migration `030`, backup, and rollback.
3. Provision the exact owner, enroll MFA, grant 1,000 promotional Generation Credits, and verify the ledger.
4. Exercise GenX text, image, video, audio/voice, and long-form paths against the authenticated catalogue/rate card; reconcile holds and settlements.
5. Complete one reuse/adapt/quality/revision/owner-approval flow and confirm any mutation invalidates approval.
6. Use sandbox accounts to test every enabled social connector and the email provider, including suppression/unsubscribe and duplicate-delivery protection.
7. Run one autonomous campaign from knowledge observation through scheduled publication, performance/conversion ingestion, optimization, and Emergency Stop interruption.
8. Only after standalone Marketing acceptance, deploy the unchanged Management candidate and test one-use SSO, Marketing MFA, structured knowledge sync, and idempotent conversion delivery.
