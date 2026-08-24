#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const freshUrl = required('MIGRATION_FRESH_DATABASE_URL');
const upgradeUrl = required('MIGRATION_UPGRADE_DATABASE_URL');
const productionHistoryMaximum = '035_genx_account_pricing_source.sql';
const forwardMigration = '036_longform_cost_governor.sql';

function assertDisposable(url, suffix) {
  const database = new URL(url).pathname.replace(/^\//, '');
  if (!database.endsWith(suffix)) {
    throw new Error(`Refusing migration acceptance against non-disposable database ${database}`);
  }
}

function migrate(databaseUrl, maximum) {
  const result = spawnSync(process.execPath, ['apps/api/dist/db/migrate.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      MIGRATION_TEST_MAX_FILENAME: maximum || '',
    },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Migration runner failed:\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

async function rows(databaseUrl, text, values = []) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return (await client.query(text, values)).rows; }
  finally { await client.end(); }
}

async function journal(databaseUrl) {
  return rows(databaseUrl, 'SELECT filename,checksum,applied_at FROM schema_migrations ORDER BY filename');
}

async function assertSchema(databaseUrl) {
  const result = await rows(databaseUrl, `
    SELECT
      to_regclass('public.idx_autonomous_growth_cycles_manual_idempotency') IS NOT NULL AS has_cycle_index,
      to_regclass('public.idx_video_projects_cost_quote') IS NOT NULL AS has_quote_index,
      to_regclass('public.idx_video_projects_generation_idempotency') IS NOT NULL AS has_project_idempotency,
      to_regclass('public.idx_video_renders_idempotency') IS NOT NULL AS has_render_idempotency,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='autonomous_growth_cycles'
          AND column_name='originating_instruction' AND data_type='text'
      ) AS has_instruction,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='autonomous_growth_cycles'
          AND column_name='generation_credit_ceiling' AND data_type='bigint'
      ) AS has_ceiling,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='autonomous_growth_cycles_credit_ceiling_check'
      ) AS has_ceiling_constraint,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='video_projects'
          AND column_name='cost_quote_created_at'
      ) AS has_quote_timestamp
  `);
  const failed = Object.entries(result[0] || {}).filter(([, value]) => value !== true).map(([key]) => key);
  if (failed.length) throw new Error(`Schema assertions failed: ${failed.join(', ')}`);
}

async function main() {
  assertDisposable(freshUrl, '_migration_acceptance_fresh');
  assertDisposable(upgradeUrl, '_migration_acceptance_upgrade');

  migrate(freshUrl);
  const freshFirst = await journal(freshUrl);
  migrate(freshUrl);
  const freshSecond = await journal(freshUrl);
  if (JSON.stringify(freshFirst) !== JSON.stringify(freshSecond)) throw new Error('Fresh database second migration run changed the journal');
  if (freshFirst.at(-1)?.filename !== forwardMigration) throw new Error('Fresh database did not finish at migration 036');
  await assertSchema(freshUrl);

  // This is a genuine production-history fixture: the repository migrator
  // executes and journals every SQL file through 035 in filename order.
  migrate(upgradeUrl, productionHistoryMaximum);
  const beforeUpgrade = await journal(upgradeUrl);
  if (beforeUpgrade.some((entry) => entry.filename === forwardMigration)) throw new Error('Pre-036 fixture unexpectedly contains migration 036');
  const historicalTimes = new Map(beforeUpgrade.map((entry) => [entry.filename, String(entry.applied_at)]));
  migrate(upgradeUrl);
  const afterUpgrade = await journal(upgradeUrl);
  const added = afterUpgrade.filter((entry) => !historicalTimes.has(entry.filename));
  if (added.length !== 1 || added[0].filename !== forwardMigration) throw new Error(`Upgrade applied unexpected migrations: ${added.map((entry) => entry.filename).join(', ')}`);
  for (const entry of beforeUpgrade) {
    const current = afterUpgrade.find((candidate) => candidate.filename === entry.filename);
    if (!current || String(current.applied_at) !== historicalTimes.get(entry.filename) || current.checksum !== entry.checksum) {
      throw new Error(`Historical journal entry changed: ${entry.filename}`);
    }
  }
  migrate(upgradeUrl);
  const upgradeSecond = await journal(upgradeUrl);
  if (JSON.stringify(afterUpgrade) !== JSON.stringify(upgradeSecond)) throw new Error('Post-036 second migration run changed the journal');
  await assertSchema(upgradeUrl);

  console.log(`MIGRATION_ACCEPTANCE_REPORT=${JSON.stringify({status:'PASS',fresh:{migrations:freshFirst.length,second_run:'no-op'},upgrade:{historical_migrations:beforeUpgrade.length,applied:[forwardMigration],second_run:'no-op'},schema_assertions:'PASS'})}`);
}

main().catch((error) => {
  console.error(`MIGRATION_ACCEPTANCE_REPORT=${JSON.stringify({status:'FAIL',reason:error instanceof Error?error.message:String(error)})}`);
  process.exit(1);
});
