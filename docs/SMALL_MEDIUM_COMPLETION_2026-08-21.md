# Standalone Marketing small-medium completion handoff — 21 August 2026

## Branch

`phase-1/small-medium-completion`

Base checkpoint:

`a75515e7444064bd1fa041aea240d476c7fa6e83`

Last separately reviewed CI deployment candidate before this branch:

`f4173d44bfdd85c4702af2537440fbe4d0ac429e` — GitHub CI/CD run #342 passed.

This branch has not been deployed or merged.

## Completed in this branch

### Generic connector naming with compatibility

`apps/api/src/services/application-connector.service.ts` now exposes the generic bootstrap:

`ensureConfiguredApplicationConnector()`

while retaining:

`ensureConfiguredEquiProfileConnector`

as an explicit compatibility alias so existing startup code is not broken.

SSO authorization copy is now host-application neutral rather than hard-coded to EquiProfile wording.

### Management / Academy / Shop product-line context

The Application Connector now validates and preserves:

- `management`
- `academy`
- `shop`

for connected EquiProfile business/conversion context.

Unknown product lines are rejected rather than silently folded into business intelligence.

Conversion events preserve a validated `product_line` plus safe `entity_type` in Marketing performance metrics so attribution/learning can distinguish the EquiProfile product being marketed.

Business snapshots may declare `app.product_lines` and may classify product/plan/pricing/feature/offer/promotion/status records by `product_line`; invalid values fail closed.

Material business-change events preserve the declared product-line set.

### Connector contract regression coverage

`apps/api/src/__tests__/equiprofile-connector-contract.test.ts` now locks:

- exact Application Connector headers;
- canonical HMAC protocol;
- SSO/conversion endpoint paths;
- environment-only connector secret handling;
- generic bootstrap + compatibility alias;
- `management | academy | shop` validation;
- product-line persistence in conversion context;
- business snapshot product-line validation.

## Large work deliberately left for the next pass

### Campaign / Growth Director product-line targeting

The current Campaign Planner still has a free-text Products/Services field. A truthful Management/Academy/Shop selector cannot be added only in the web page: campaign API schemas, plan persistence, business-brain context, Growth Director planning, content generation context, attribution and optimization all need to carry the selected product-line set.

Implement this as one coherent larger change, not a cosmetic UI-only selector.

Required target selection:

- Management only
- Academy only
- Shop only
- Management + Academy
- Management + Shop
- Academy + Shop
- Whole EquiProfile

Every generated campaign/asset should retain its selected product-line scope so performance/conversion learning remains correctly attributed.

### Core event integration

The Core-side publisher has been aligned to this canonical Application Connector protocol on the separate Core small/medium branch. During the final Core reconciliation, wire trusted Management/Academy/Shop events and business snapshots to these existing endpoints.

### Production acceptance

After the larger product-line integration and final Core SHA exist, rerun the complete Marketing CI/release gate and then controlled live acceptance for GenX, workers, Studio durable media, long-form/render, social/email, attribution, autonomous campaign/approval loop, Emergency Stop and owner SSO/MFA.

## Do not overwrite

Tomorrow's large Marketing integration should preserve the generic connector/product-line validation changes from this branch rather than recreating a second connector contract.
