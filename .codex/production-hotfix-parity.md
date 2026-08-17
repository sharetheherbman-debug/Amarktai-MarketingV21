# EquiProfile Marketing production hotfix parity

This rescue branch already contains the four browser API-base fixes proven in production. The original VPS-only commit objects are not available on GitHub, but the relevant file blob contents are exact.

Expected customer/browser hotfix blobs:

- `apps/web/app/connector/sso/page.tsx` -> `7f85fc17f6517d6f686f0d36796e59f10167fd89`
- `apps/web/app/(auth)/mfa/setup/page.tsx` -> `f19b29989c1d75f10d90f98eda302656ef4a202f`
- `apps/web/app/(dashboard)/billing/page.tsx` -> `271bcfd8ee8d5ad27422dc736ac0ae037eff3ef8`
- `apps/web/app/(dashboard)/dashboard/page.tsx` -> `0580024d88c774436a7b618bd294ae0bd6490a6b`

These preserve the working SSO, MFA, billing and dashboard `/api` -> `/api/v1` normalization behavior. Do not regress them during client-go-live rescue work.

Do not deploy, merge, force-push, start workers, publish, grant credits, or modify production from Codex.
