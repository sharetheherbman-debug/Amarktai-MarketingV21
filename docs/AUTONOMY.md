# Autonomy

## Operating modes

- **Manual** — the owner initiates each material action.
- **Approval** — the Marketing Director may research and prepare work, but configured actions require exact-version approval.
- **Autonomous** — the Marketing Director may execute the allowed workflow inside explicit policies, budgets, channels, schedules, and approval rules.

Autonomous operation follows Business Brain → research → opportunity → strategy → campaign → content/creative → approval where required → calendar → publish → analytics → optimisation → next actions.

## Controls

The organisation controls:

- Emergency Stop;
- per-run and period Generation Credit limits;
- long-form project ceilings;
- allowed channels and action types;
- approval requirements;
- scheduling windows and rate limits;
- campaign/product/service scopes;
- safe retry and idempotency policy;
- autonomous mode enablement.

Emergency Stop is checked at planning/execution boundaries and immediately before an external action. It prevents new paid or public actions and exposes blocked/queued state truthfully.

## Approvals

Approvals bind the exact current payload, content version, media selection, channel, campaign, reviewer, policy version, and canonical hash. Editing an approved asset invalidates approval. A retry cannot substitute different content under a previous approval.

## Cost and credits

An autonomous action requires fresh pricing and a complete quote. Credits are reserved before provider submission, settled from authoritative cost, and released or reversed on terminal failure. Missing price, stale price, insufficient wallet, budget overrun, or ledger ambiguity blocks execution.

## Audit and failure visibility

Planning decisions, policy checks, approvals, reservations, submissions, retries, deliveries, external references, failures, cancellations, Emergency Stop changes, and optimisation actions are durably audited. Failed actions are visible and do not produce success notifications.

## External systems

Autonomy never assumes a channel or provider is configured. Publication and generation remain unavailable until the provider/channel passes its explicit connection and acceptance gate. Paid advertising remains bounded by implemented provider capability and spend policy; unsupported spend operations must not be simulated.
