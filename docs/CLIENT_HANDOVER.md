# Client handover

## Release record

Complete this only after reconciliation is committed and exact-SHA CI is green:

```text
MARKETING_BRANCH=
MARKETING_SHA=
CI_RUN_ID=
CI_STATUS=
WORKING_TREE=
MIGRATION_TAIL=
MIGRATIONS_ADDED=
API_TESTS=
BROWSER_E2E=
DOCKER_IMAGES=
COMPOSE_VALIDATION=
SECURITY_STATUS=
CORE_DOCS_SHA=
CORE_CONNECTOR_CHANGED=
```

Production deployment, paid provider testing, live channel publication, and host SSO remain separate recorded gates.

## Deployment prerequisites

- verified database/configuration/media backup and rollback evidence;
- exact release SHA and images;
- production journal classification against the known 40-entry history;
- reviewed production environment, branding, domains, connector, session, Redis, storage, SMTP/channel, and provider configuration;
- approved provider cost ceilings;
- worker activation plan;
- owner/browser test accounts and sandbox channels.

## Ordered live acceptance

1. Confirm exact SHA, health, TLS routing, secure cookies, and no browser/provider secrets.
2. Redeem EquiProfile → Marketing one-use SSO; verify origin, owner/admin role, replay rejection, expiry, and logout.
3. Verify Command Centre uses real organisation data and all quick actions route correctly.
4. Edit Business Brain, reload, and confirm the approved host snapshot/product lines remain scoped correctly.
5. Run website/business, market, and competitor research; inspect evidence and persistence.
6. Create, save, reopen, edit, and approve a campaign strategy.
7. Generate and persist text content; revise it and verify exact-version approval invalidation.
8. Print an image quote, approve within ceiling, generate, refresh, preview, and download the durable asset.
9. Repeat for a short video using an allowed aspect ratio.
10. Produce a quoted 30-second advert/reel; verify audio/captions/render and credit reconciliation.
11. Quote a six-scene 60-second Smart/Hybrid project showing only motion-critical AI-video duration as paid video; approve within the explicit project ceiling and produce the durable MP4, thumbnail, captions, playback, and download.
12. Reconcile available/reserved/settled/released credits with every job and failure path.
13. Create, approve, reject, and request revision on governed assets.
14. Connect one sandbox channel, validate it, schedule/publish one approved asset, and confirm external result/idempotency; unconfigured channels must remain truthful.
15. Ingest a consented conversion event and verify campaign/analytics attribution without invented metrics.
16. Enable a tightly bounded Autonomous policy; run one controlled research-to-next-action loop.
17. Activate Emergency Stop while work is queued and confirm no new paid/public action starts; then reconcile state before clearing it.

## Completion boundary

The handover is ready for the separate deployment task when the next action is: backup → deploy exact SHA → apply forward migrations → start workers in controlled order → run this live acceptance. This document does not authorise those actions.
