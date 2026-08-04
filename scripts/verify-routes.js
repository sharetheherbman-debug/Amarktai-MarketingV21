#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'server.ts');

const required = ['/api/v1/knowledge', '/api/v1/competitors', '/api/v1/trends'];
const content = fs.readFileSync(serverPath, 'utf-8');

let ok = true;
for (const route of required) {
  if (!content.includes(route)) {
    console.error(`MISSING ROUTE: ${route}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
