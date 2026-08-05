import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { closePool, getClient } from '../config/database';
import { logger } from '../utils/logger';

interface AppliedMigration {
  filename: string;
  checksum: string;
}

async function ensureMigrationTable(): Promise<void> {
  const client = await getClient();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

async function getApplied(): Promise<Map<string, string>> {
  const client = await getClient();
  try {
    const result = await client.query<AppliedMigration>(
      'SELECT filename, checksum FROM schema_migrations ORDER BY filename'
    );
    return new Map(result.rows.map((row) => [row.filename, row.checksum]));
  } finally {
    client.release();
  }
}

async function run(): Promise<void> {
  const compiledMigrationsDir = path.join(__dirname, 'migrations');
  const sourceMigrationsDir = path.resolve(__dirname, '../../src/db/migrations');
  const migrationsDir = await fs.access(compiledMigrationsDir)
    .then(() => compiledMigrationsDir)
    .catch(() => sourceMigrationsDir);
  const files = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  await ensureMigrationTable();
  const applied = await getApplied();

  for (const filename of files) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `Migration checksum mismatch for ${filename}. Add a new migration instead of changing it.`
        );
      }
      logger.info(`Migration already applied: ${filename}`);
      continue;
    }

    const client = await getClient();
    try {
      logger.info(`Applying migration: ${filename}`);
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
      await client.query('COMMIT');
      logger.info(`Applied migration: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `Migration ${filename} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      client.release();
    }
  }

  logger.info(`Migration run complete (${files.length} files discovered)`);
}

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Migration run failed', error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
