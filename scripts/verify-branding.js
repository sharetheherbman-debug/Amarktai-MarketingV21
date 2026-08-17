#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const webSrc = path.join(__dirname, '..', 'apps', 'web', 'src');
const webApp = path.join(__dirname, '..', 'apps', 'web', 'app');
const webPublic = path.join(__dirname, '..', 'apps', 'web', 'public');
const studioSrc = path.join(__dirname, '..', 'packages', 'studio', 'src');

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

function sourceFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

for (const file of [...sourceFiles(webApp), ...sourceFiles(webSrc), ...sourceFiles(studioSrc)]) {
  const content = fs.readFileSync(file, 'utf8');
  if (/genx/i.test(content)) {
    console.error(`CUSTOMER BRAND LEAK: ${path.relative(path.join(__dirname, '..'), file)}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
