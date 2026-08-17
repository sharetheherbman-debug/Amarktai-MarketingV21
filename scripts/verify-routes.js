#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'server.ts');
const repositoryRoot = path.join(__dirname, '..');

const required = ['/api/v1/knowledge', '/api/v1/competitors', '/api/v1/trends'];
const content = fs.readFileSync(serverPath, 'utf-8');

let ok = true;
for (const route of required) {
  if (!content.includes(route)) {
    console.error(`MISSING ROUTE: ${route}`);
    ok = false;
  }
}

const clientPages = [
  'apps/web/app/(dashboard)/dashboard/page.tsx',
  'apps/web/app/(dashboard)/campaigns/page.tsx',
  'apps/web/app/(dashboard)/campaigns/new/page.tsx',
  'apps/web/app/(dashboard)/connections/page.tsx',
  'apps/web/app/(dashboard)/creative-studio/page.tsx',
  'apps/web/app/(dashboard)/content-studio/page.tsx',
  'apps/web/app/(dashboard)/content-studio/calendar/page.tsx',
  'apps/web/app/(dashboard)/social/page.tsx',
  'apps/web/app/(dashboard)/analytics/page.tsx',
  'apps/web/app/(dashboard)/relaunch-control/page.tsx',
  'apps/web/app/(dashboard)/billing/page.tsx',
  'apps/web/app/(dashboard)/settings/page.tsx',
];
for (const page of clientPages) {
  if (!fs.existsSync(path.join(repositoryRoot, page))) {
    console.error(`MISSING CLIENT PAGE: ${page}`);
    ok = false;
  }
}

const middleware = fs.readFileSync(path.join(repositoryRoot, 'apps/web/middleware.ts'), 'utf8');
if (/['"]\/connections['"]/.test(middleware)) {
  console.error('CLIENT ROUTE REGRESSION: /connections must not be classified as legacy public marketing');
  ok = false;
}

const sidebar = fs.readFileSync(path.join(repositoryRoot, 'apps/web/src/components/dashboard/DashboardSidebar.tsx'), 'utf8');
for (const exposedInternalPath of ['/admin/providers', '/admin/console', '/admin/users']) {
  if (sidebar.includes(exposedInternalPath)) {
    console.error(`INTERNAL NAVIGATION EXPOSED: ${exposedInternalPath}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
