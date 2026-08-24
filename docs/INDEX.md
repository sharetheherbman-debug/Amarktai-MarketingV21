# Documentation index

This index is the source of truth for active AmarktAI Marketing documentation.

## Canonical product and handover documents

- [Product](PRODUCT.md) — product scope, client information architecture, and capability truth rules.
- [Architecture](ARCHITECTURE.md) — system boundaries, runtime components, tenancy, media, and workers.
- [Studio](STUDIO.md) — text/media/long-form production and durable asset rules.
- [Autonomy](AUTONOMY.md) — operating modes, policies, approvals, limits, and Emergency Stop.
- [Application Connector](APPLICATION_CONNECTOR.md) — reusable host integration and security contract.
- [Deployment](DEPLOYMENT.md) — exact-SHA controlled deployment and rollback boundary.
- [Operations](OPERATIONS.md) — health, queues, workers, backups, incidents, and durable storage.
- [Testing and acceptance](TESTING_AND_ACCEPTANCE.md) — local, CI, browser, migration, Docker, and live-provider gates.
- [Client handover](CLIENT_HANDOVER.md) — release record and post-deployment acceptance sequence.
- [Changelog](../CHANGELOG.md) — durable product history.

## Specialist references

- [API reference](API.md)
- [Database reference](DATABASE.md)
- [Development reference](DEVELOPMENT.md)
- [Provider operations](PROVIDERS.md)
- [Application Connector SDK](../packages/application-connector-sdk/README.md)
- [Architecture decisions](adr/)

Specialist references explain implementation details. If they conflict with the canonical release boundary or current source, the canonical document and executable source take precedence and the conflict must be corrected.

## Historical documentation policy

Phase boards, rescue snapshots, duplicate VPS runbooks, old EquiProfile-specific connector documents, and superseded acceptance reports were removed from the active branch after their still-valid security and operational rules were incorporated above. They remain recoverable from Git history; they are not current deployment instructions.
