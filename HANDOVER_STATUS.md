# EquiProfile / AmarktAI repository migration handover

Recorded: 2026-09-07

This record identifies the final **verified source snapshots**. The Git commit
which adds this file has its own later SHA; use the branch tip at transfer time
as the final documentation commit. No credentials or production data belong in
this repository.

## Canonical repositories

| Area | Repository | Branch | Final verified source SHA | Status |
| --- | --- | --- | --- | --- |
| Core | `sharetheherbman-debug/Equiprofile-Marketing` | `chatgpt/final-client-handover-2026-09-02` | `d01fc9fd6c0870985c4386353b26d536add4518a` | PASS — source migration readiness |
| Marketing | `sharetheherbman-debug/Amarktai-MarketingV21` | `chatgpt/final-client-handover-2026-09-02` | `d0cc7076f86c521d6ef7c74bd68614d41e37864e` | PASS — source migration readiness |
| Billing (specified rescue branch) | `sharetheherbman-debug/Equiprofile-Billing` | `rescue/client-handoff-2026-09-01` | `d1dc171549bae84635bc0eba8a9a27e0984ed09c` | INCOMPLETE — preserved, not retested in this run |
| Billing (current active handover) | `sharetheherbman-debug/Equiprofile-Billing` | `chatgpt/final-client-handover-2026-09-02` | `61c2c74eaa1014691b8439632d0837583b1a21af` | PASS — source migration readiness |

The requested Billing rescue branch remains preserved. The current active
handover branch was tested instead; no branches were renamed, reset, or
removed.

## Verified

- Marketing uses the GenX multimodal chat endpoint with image data URLs and a
  strict, fail-closed Visual QA contract. The default is `gemini-3-flash`; no
  direct model-provider integration was added.
- Marketing's campaign job ID regression, governed material repair path,
  robots precedence, autonomy, owner-security, authenticated integrations, and
  E2E provider-stub coverage pass.
- The Core acquisition and Shop crawler-policy tests pass; the policy gives
  `AmarktAI-Marketing-KnowledgeBot` access while wildcard crawlers remain
  disallowed.
- Current source checks passed locally: Marketing types, 57 API suites / 308
  tests, and API build; Core type check, 18 acceptance/policy tests, and build;
  Billing type check, 10 tests, and build.
- Current branch heads were verified directly on GitHub before this record.

## Three-profile Marketing state

| Profile | Source SHA | Source build/tests | Deployment state | Remaining work |
| --- | --- | --- | --- | --- |
| EquiProfile (`marketing.equiprofile.online`) | `d0cc707` | PASS | Existing production intentionally unchanged; candidate is not promoted. | Client-authenticated SSO and private acceptance. |
| AmarktAI (`marketing.amarktai.co.za`) | `d0cc707` | PASS | Not accepted in the target environment. | DNS/TLS and tenant configuration verification. |
| Generic white-label | `d0cc707` | PASS | No fresh tenant provisioned. | Tenant setup, environment configuration, and private acceptance. |

## Not yet verified / blocked

- **FULL PRODUCTION ACCEPTANCE: NOT YET COMPLETED.** The end-to-end sequence
  from Business Brain through Billing and client handover has not been run in
  the target environment.
- Production SSO acceptance requires an authenticated client session and target
  configuration. No marketing content was published, no email was sent, and no
  advertising spend was initiated.
- Billing remains the final deployment stage and has not been production
  accepted.
- **VPS CLEANUP: NOT YET COMPLETED.** Limited, explicitly approved cleanup was
  performed separately; a complete controlled cleanup audit and handover remain
  outstanding.

## Migration checklist

The repositories contain source, tests, manifests and lockfiles, Docker and
Compose definitions where applicable, migrations, deployment scripts,
environment templates, README files, architecture/deployment documentation,
and this status record. Before transfer, confirm each branch tip is pushed and
each working tree is clean; do not transfer credentials, production databases,
or generated artifacts.
