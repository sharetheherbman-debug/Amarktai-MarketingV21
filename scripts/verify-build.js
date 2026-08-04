#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');

try {
  execSync('npm run build', { cwd: root, stdio: 'pipe' });
  process.exit(0);
} catch {
  console.error('FAIL: Build');
  process.exit(1);
}
