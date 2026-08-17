#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const migrationsDir = path.join(__dirname, '..', 'apps', 'api', 'src', 'db', 'migrations');

const required = ['001_initial.sql', '002_ai_core.sql', '003_knowledge.sql', '033_tools_runtime_repair.sql'];
let ok = true;

for (const migration of required) {
  if (!fs.existsSync(path.join(migrationsDir, migration))) {
    console.error(`MISSING: ${migration}`);
    ok = false;
  }
}

const toolsRepair = fs.readFileSync(path.join(migrationsDir, '033_tools_runtime_repair.sql'), 'utf8');
for (const contract of [
  /CREATE TABLE IF NOT EXISTS tools/i,
  /ADD COLUMN IF NOT EXISTS organization_id/i,
  /idx_tools_global_name/i,
  /idx_tools_organization_name/i,
]) {
  if (!contract.test(toolsRepair)) {
    console.error(`INVALID TOOLS REPAIR: missing ${contract}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
