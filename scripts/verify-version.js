#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const versionPath = path.join(__dirname, '..', 'version.json');

if (!fs.existsSync(versionPath)) {
  console.error('MISSING: version.json');
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
const required = ['name', 'version', 'tag', 'milestone', 'releaseDate', 'commit'];

let ok = true;
for (const field of required) {
  if (!version[field]) {
    console.error(`MISSING FIELD: ${field}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
