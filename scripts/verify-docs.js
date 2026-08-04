#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const requiredDocs = [
  'docs/API.md',
  'docs/ARCHITECTURE.md',
  'docs/DATABASE.md',
  'docs/DEPLOYMENT.md',
  'docs/DEVELOPMENT.md',
  'docs/GIT_WORKFLOW.md',
  'CHANGELOG.md',
  'ROADMAP.md',
  'version.json',
];

let ok = true;
for (const doc of requiredDocs) {
  if (!fs.existsSync(path.join(root, doc))) {
    console.error(`MISSING: ${doc}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
