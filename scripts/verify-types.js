#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');

function check(label, cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    console.error(`FAIL: ${label}`);
    return false;
  }
}

const apiOk = check('API TypeScript', 'npx tsc --noEmit', path.join(root, 'apps', 'api'));
const webOk = check('Web TypeScript', 'npx tsc --noEmit', path.join(root, 'apps', 'web'));

if (!apiOk || !webOk) process.exit(1);
process.exit(0);
