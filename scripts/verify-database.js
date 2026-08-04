#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const migrationsDir = path.join(__dirname, '..', 'apps', 'api', 'src', 'db', 'migrations');

const required = ['001_initial.sql', '002_ai_core.sql', '003_knowledge.sql'];
let ok = true;

for (const migration of required) {
  if (!fs.existsSync(path.join(migrationsDir, migration))) {
    console.error(`MISSING: ${migration}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
