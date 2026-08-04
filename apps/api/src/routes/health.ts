import { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

const router = Router();

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

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: getVersionInfo().version,
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

export default router;
