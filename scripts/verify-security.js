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

process.exit(ok ? 0 : 1);
