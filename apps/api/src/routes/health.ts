import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Queue } from 'bullmq';
import { query } from '../config/database';
import redis from '../config/redis';
import { env } from '../config/env';

const router = Router();

const queueConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const generationQueue = new Queue('studio-generations', { connection: queueConnection });
const renderQueue = new Queue('video-renders', { connection: queueConnection });

function getVersionInfo() {
  try {
    const versionPath = join(__dirname, '..', '..', '..', '..', 'version.json');
    const raw = readFileSync(versionPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      name: 'AmarktAI Marketing',
      version: process.env.npm_package_version || '0.3.0',
      tag: 'unknown',
      milestone: 'unknown',
      releaseDate: 'unknown',
      commit: 'unknown',
      buildNumber: 'unknown',
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkQueueWorkers(queue: Queue, label: string) {
  try {
    const workers = await withTimeout(queue.getWorkers(), env.HEALTHCHECK_TIMEOUT_MS, label);
    return {
      ok: workers.length > 0,
      count: workers.length,
      workers: workers.map((worker) => ({
        id: worker.id,
        addr: worker.addr,
        name: worker.name,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: getVersionInfo().version,
  });
});

router.get('/live', (_req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, any> = {
    database: { ok: false },
    redis: { ok: false },
    generationWorker: { ok: !env.REQUIRE_WORKERS_READY, required: env.REQUIRE_WORKERS_READY },
    renderWorker: { ok: !env.REQUIRE_WORKERS_READY, required: env.REQUIRE_WORKERS_READY },
  };

  try {
    await withTimeout(query('SELECT 1'), env.HEALTHCHECK_TIMEOUT_MS, 'database');
    checks.database = { ok: true };
  } catch (error) {
    checks.database = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  try {
    const pong = await withTimeout(redis.ping(), env.HEALTHCHECK_TIMEOUT_MS, 'redis');
    checks.redis = { ok: pong === 'PONG' };
  } catch (error) {
    checks.redis = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (env.REQUIRE_WORKERS_READY && checks.redis.ok) {
    checks.generationWorker = {
      ...(await checkQueueWorkers(generationQueue, 'generation worker check')),
      required: true,
    };
    checks.renderWorker = {
      ...(await checkQueueWorkers(renderQueue, 'render worker check')),
      required: true,
    };
  }

  const ready = Object.values(checks).every((check: any) => check.ok || check.required === false);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

router.get('/version', (_req: Request, res: Response) => {
  const version = getVersionInfo();
  res.json({
    success: true,
    data: {
      ...version,
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

export async function closeHealthQueues(): Promise<void> {
  await Promise.allSettled([generationQueue.close(), renderQueue.close()]);
}

export default router;
