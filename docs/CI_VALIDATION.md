# CI validation marker

This owner-authored commit exists to trigger the full PR validation pipeline after the automated dependency upgrade updated package manifests and `package-lock.json`.

Expected gates:

- API and web TypeScript
- production builds
- 47+ API tests
- clean PostgreSQL migrations 000-016
- high-severity dependency audit
- API, render-worker, and web Docker builds
- Compose validation
- repository verification suite
