# Product

## Purpose

AmarktAI Marketing is a virtual marketing department for a business, not a collection of unrelated AI tools. It turns approved business knowledge into research, strategy, campaigns, durable content and creative assets, governed publishing, measured results, and next actions.

It is standalone and white-label. A host application supplies branding, product/service scope, approved business context, and consented events through the Application Connector. EquiProfile is the first deployment, not a hard-coded engine dependency.

## Client information architecture

| Area | Client outcome |
| --- | --- |
| Command Centre | Current readiness, campaigns, production, approvals, channel health, credits, autonomy state, and next actions. |
| Business Brain | Business, offer, audience, positioning, voice, restrictions, geography, goals, and host snapshot. |
| Research & Intelligence | Website, market, competitor, SEO, and opportunity research with evidence and durable results. |
| Strategy & Campaigns | Versioned strategies, campaign plans, budgets, assets, production, and optimisation. |
| Content Studio | Saved and revisable social, article, landing, email, newsletter, product, advertising, script, and SEO copy. |
| Creative Studio | Governed text, image, video, audio, lip-sync where available, Cinema, and long-form production. |
| Calendar & Production | Production queue, scheduling, due work, and delivery state. |
| Publish & Channels | Connected-channel validation, queueing, controlled delivery, retries, and external results. |
| CRM | Leads, audiences, contacts, segments, and conversion context. |
| Analytics & Optimisation | Evidence-backed campaign/content/channel performance, attribution, recommendations, and next actions. |
| Marketing Team | Marketing Director and specialist role visibility without exposing infrastructure internals. |
| Workflows & Approvals | Approval, rejection, revision, exact-version protection, and audit history. |
| Connections | Host connector and external channel state without browser secrets. |
| Usage & Safety | Wallet, reserves, usage, costs, mode, limits, approvals, provider state, audit, and Emergency Stop. |
| Settings | Organisation, brand, user, notification, and authorised operational preferences. |

## Truth rules

- Visible metrics come from durable API data; demonstration values are never presented as client facts.
- A provider-dependent action shows connection-required or unavailable when its provider is absent.
- A successful toast is emitted only after the durable operation succeeds.
- Generation results survive refresh and respect organisation isolation.
- Client navigation excludes developer consoles, runtime diagnostics, raw provider keys, and obsolete relaunch surfaces.
- External publishing and paid generation are bounded by policy, approval, idempotency, and cost controls.

## Product completion boundary

Source, deterministic tests, and local provider adapters prove internal behaviour. Real provider quality, real channel publication, and production routing are separate opt-in live acceptance gates and must never be inferred from mocks.
