#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const webSrc = path.join(__dirname, '..', 'apps', 'web', 'src');
const webPublic = path.join(__dirname, '..', 'apps', 'web', 'public');

const brandingFiles = [
  path.join(webPublic, 'logo.svg'),
  path.join(webPublic, 'logo-icon.svg'),
  path.join(webPublic, 'favicon.svg'),
  path.join(webSrc, 'components', 'dashboard', 'DashboardSidebar.tsx'),
];

let ok = true;
for (const file of brandingFiles) {
  if (!fs.existsSync(file)) {
    console.error(`MISSING: ${path.relative(path.join(__dirname, '..'), file)}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
