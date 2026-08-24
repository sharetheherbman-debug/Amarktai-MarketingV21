#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const requiredDocs = [
  'README.md',
  'docs/INDEX.md',
  'docs/PRODUCT.md',
  'docs/API.md',
  'docs/ARCHITECTURE.md',
  'docs/STUDIO.md',
  'docs/AUTONOMY.md',
  'docs/APPLICATION_CONNECTOR.md',
  'docs/DATABASE.md',
  'docs/DEPLOYMENT.md',
  'docs/DEVELOPMENT.md',
  'docs/OPERATIONS.md',
  'docs/TESTING_AND_ACCEPTANCE.md',
  'docs/CLIENT_HANDOVER.md',
  'CHANGELOG.md',
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
