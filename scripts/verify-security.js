#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const apiSrc = path.join(__dirname, '..', 'apps', 'api', 'src');

const securityFiles = [
  'middleware/auth.ts',
  'middleware/rateLimit.ts',
  'middleware/csrf.ts',
  'middleware/errorHandler.ts',
  'utils/encryption.ts',
  'utils/jwt.ts',
];

let ok = true;
for (const file of securityFiles) {
  if (!fs.existsSync(path.join(apiSrc, file))) {
    console.error(`MISSING: ${file}`);
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

const browserRoots = [
  path.join(__dirname, '..', 'apps', 'web', 'app'),
  path.join(__dirname, '..', 'apps', 'web', 'src'),
  path.join(__dirname, '..', 'packages', 'studio', 'src'),
];
for (const file of browserRoots.flatMap(sourceFiles)) {
  const source = fs.readFileSync(file, 'utf8');
  const insecureRemote = source.match(/(?:http|ws):\/\/(?!localhost|127\.0\.0\.1)[^'"`\s)]+/gi) || [];
  if (insecureRemote.length > 0) {
    console.error(`INSECURE BROWSER URL: ${path.relative(path.join(__dirname, '..'), file)} ${insecureRemote.join(', ')}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
