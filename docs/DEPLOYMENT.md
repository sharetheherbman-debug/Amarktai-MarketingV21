# Deployment

This is the canonical controlled deployment boundary. It does not authorise production changes.

EquiProfile deployment #1 currently uses `marketing.equiprofile.online`. That hostname is deployment configuration, not a reusable-engine default.

## Release prerequisites

- exact reviewed branch and SHA;
- clean working tree and green exact-SHA CI;
- production dependency audit with no blocking severity;
- fresh and supported upgrade-path migration acceptance;
- API, web, connector SDK, and worker builds;
- real API/database-backed browser acceptance;
- Compose validation and image builds;
- documented environment/branding/connector configuration;
- verified backup and rollback rehearsal plan;
- explicit owner approval for provider costs and worker activation.

## Minimum controlled sequence

1. Inventory the current Marketing deployment, database journal, durable media, secrets, proxy/TLS state, running workers, and rollback assets without mutation.
2. Create and verify database, configuration, and durable-media backups. Record checksums and restore location.
3. Confirm the repository contains every production-applied migration unchanged, including both divergent `033` and `034` names and `035_genx_account_pricing_source.sql`.
4. Build or pull images for the exact SHA; never use an unreviewed `latest` image.
5. Validate production environment and Compose configuration without printing secrets.
6. Stop or drain Marketing services only according to the approved maintenance plan.
7. Apply new forward-only migrations once and verify the journal/schema.
8. Start PostgreSQL/Redis dependencies, API, and web; keep paid generation workers disabled initially.
9. Run health, authentication, SSO, storage, and unpaid browser acceptance.
10. Validate provider catalogue/pricing and print the first paid quote.
11. Start generation, still-motion, and render workers one at a time; verify queue/health/credit behaviour after each.
12. Run the ordered live acceptance in [Client handover](CLIENT_HANDOVER.md).
13. Record exact SHA, images, migration result, backup, live tests, costs, worker state, and rollback evidence.

## Failure and rollback

Do not delete production databases, volumes, media, certificates, proxies, backups, or migration history. On a blocking failure, stop new external work, preserve evidence, roll application services back to the reviewed prior release, and restore data only under the documented owner-approved restore procedure. A migration requiring destructive rollback needs its own reviewed recovery operation.

## Environment rules

Production `.env` files and provider/connector/session secrets are never committed, logged, or copied to browser configuration. White-label branding is supplied through reviewed public configuration; server secrets remain server-only.
