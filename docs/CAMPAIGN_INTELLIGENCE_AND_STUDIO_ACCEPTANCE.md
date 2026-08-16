# Campaign Intelligence and Studio Acceptance

## Release boundary

This document separates code-complete behaviour from evidence that can only be obtained with the deployed GenX account and connected delivery providers. Automated checks prove structure, safety and accounting; they do not prove subjective creative excellence.

## Governed campaign flow

1. The owner supplies business, audience, objective, offer, proof, restrictions, channels, success criteria, language and a campaign Generation Credit limit.
2. GenX produces a structured strategy, creative concept, audience/message plan, channel plan, calendar, asset requirements, briefs, tracking plan and bounded optimisation plan.
3. The strategy is saved as a versioned draft. The owner may edit it and must approve it before campaign asset production.
4. Production creates one durable `campaign_asset_runs` record per brief and meaningful variant. Text and media jobs share the approved campaign and brand context.
5. Every paid generation obtains a fresh Control Centre decision and reserves credits before the provider call. Text input and output use their separate authenticated rate-card metrics.
6. Each successful asset settles only its own actual usage. Failed or cancelled work releases its unused reservation. A failed component does not replace or recharge successful siblings.
7. Quality checks score brief alignment, brand consistency, factual/compliance risks, channel structure, CTA clarity, originality and accessibility metadata. Missing or failed checks block review submission.
8. The owner can edit, comment, request a targeted revision, compare versions, restore a version, duplicate an asset, approve or reject it.
9. Scheduling, social publication, outbound email and any future advertising mutation must pass the shared Control Centre immediately before execution. Advertising mutation is intentionally unavailable in Phase 1.
10. Analytics and conversions may inform bounded recommendations. They cannot silently change an approved offer or bypass a new execution decision.

## Capability matrix

| Capability | State | Evidence / release condition |
| --- | --- | --- |
| Structured campaign strategy and creative concept | Implemented and automated | Campaign planner schema, version history and deterministic quality fixtures |
| Owner edit and strategy approval before production | Intentionally owner-controlled | Only an approved, complete plan can queue campaign assets |
| Coordinated text asset variants | Implemented and automated | Durable per-brief runs, governed text queue and partial-recovery tests |
| Image, video, audio and long-form job orchestration | Implemented; live-provider acceptance required | Governed worker paths, retries, cancellation and partial recovery are code-tested; exact GenX media capability must be proved after deployment |
| Content editing, autosave, comparison, restore, duplicate and targeted revision | Implemented and automated | Content Studio editor and versioned API routes |
| Deterministic quality evaluation | Implemented and automated | Five representative campaign fixtures; structural checks are not a substitute for human creative review |
| Approval, rejection, revision comments and exact-version binding | Intentionally owner-controlled | Assigned reviewer and content version are checked transactionally |
| Scheduling, social and email execution | Implemented; provider acceptance required | Shared policy gate and low-level sender isolation; one controlled live test per connected provider remains required |
| Advertising campaign mutation | Deferred and unavailable | Phase 1 advertising integration is read/sync only; no mutation route is exposed |
| Analytics/conversion recommendations | Implemented and bounded | Recommendations remain drafts until owner/policy-authorised action |
| GenX token and media credit accounting | Implemented; catalogue acceptance required | Immutable reservations/ledger, split input/output token rates and actual-usage settlement; live account catalogue/FX freshness remains a gate |
| Autonomous mode | Implemented within policy | Exact payload binding, approval expiry, policy-version recheck, channel/budget limits and Emergency Stop |

## Deterministic evaluation set

The automated evaluator covers five representative campaign shapes:

- service-business lead generation;
- product promotion;
- educational/thought leadership;
- event or launch;
- retention/reactivation.

Fixtures check campaign and audience references, CTA presence, platform structure, prohibited or unsupported claims, suspicious statistics/testimonials/guarantees, repetition and accessibility metadata. Targeted revision is required to preserve unrelated approved sections and create a new version.

## Human creative acceptance

For each representative campaign, an owner reviewer must confirm in the isolated deployed environment that:

- the central idea is distinctive, relevant and consistent across assets;
- the language sounds natural for the intended audience and saved brand voice;
- every factual claim, price, offer, testimonial and proof point comes from owner-supplied context;
- platform-specific hooks, length, layout, aspect ratio, captions and alt text are appropriate;
- variations are meaningfully different rather than superficial rewrites;
- image/video/audio assets are technically valid and visually coherent;
- a targeted revision improves only the selected component;
- partial failure and retry leave completed siblings and their ledger entries unchanged.

No code-only report may label subjective creative quality as proven. These checks are a deployment acceptance gate and must use sandbox/test destinations before any public send, publication or spend.

## Isolated end-to-end acceptance script

With workers initially disabled, provision the owner, enroll MFA, configure a sandbox GenX catalogue and grant internal promotional credits. Turn on one generation worker and run:

`business/brand setup -> campaign brief -> strategy review/edit -> owner approval -> coordinated asset generation -> Studio quality review -> targeted revision -> exact-version approval -> controlled schedule -> fresh execution decision -> sandbox delivery -> analytics/conversion ingestion -> audit and ledger reconciliation`.

Repeat in Manual, Approval and limited Autonomous modes, and activate Emergency Stop while queued and retry work exists. The pass condition is no new external action, no duplicate publication, no duplicate charge, no negative balance, an immutable decision trail and recoverable successful assets.
