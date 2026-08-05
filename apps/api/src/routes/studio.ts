import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as studioService from '../services/studio.service';
import { query } from '../config/database';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

async function verifyOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return result.rows.length > 0;
}

function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.length >= 6 && ['GIF87a','GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return 'video/webm';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return null;
}

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/mpeg': '.mp3',
};

router.get('/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const operation = req.query.operation as string | undefined;
    const models = await studioService.getAvailableModels(operation);
    res.json({
      success: true,
      data: models.map((model) => ({
        id: model.id,
        name: model.name,
        category: model.category,
        provider: 'genx',
        operations: model.operations || [],
        inputs: model.inputs || [],
        outputs: model.outputs || [],
        parameters: model.parameters || {},
        status: model.available === false ? 'unavailable' : 'available',
      })),
    });
  } catch (error) { next(error); }
});

router.post('/generations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    if (!await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }
    const generation = await studioService.createGeneration(orgId, req.user!.userId, {
      type: req.body.type,
      model: req.body.model,
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      options: req.body.options,
    });
    res.status(201).json({ success: true, data: generation });
  } catch (error) { next(error); }
});

router.get('/generations/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId || !await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(orgId ? 403 : 400).json({
        success: false,
        error: { message: orgId ? 'Not a member of this organization' : 'organization_id required', code: orgId ? 'FORBIDDEN' : 'BAD_REQUEST' },
      });
      return;
    }
    res.json({ success: true, data: await studioService.getGeneration(req.params.id, orgId) });
  } catch (error) { next(error); }
});

router.post('/generations/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id as string;
    if (!orgId || !await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(orgId ? 403 : 400).json({
        success: false,
        error: { message: orgId ? 'Not a member of this organization' : 'organization_id required', code: orgId ? 'FORBIDDEN' : 'BAD_REQUEST' },
      });
      return;
    }
    await studioService.cancelGeneration(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Generation cancelled' } });
  } catch (error) { next(error); }
});

router.get('/history', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId || !await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(orgId ? 403 : 400).json({
        success: false,
        error: { message: orgId ? 'Not a member of this organization' : 'organization_id required', code: orgId ? 'FORBIDDEN' : 'BAD_REQUEST' },
      });
      return;
    }
    const history = await studioService.listGenerations(orgId, req.user!.userId, Number(req.query.limit || 50));
    res.json({ success: true, data: history });
  } catch (error) { next(error); }
});

router.post(
  '/organizations/:organizationId/uploads',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!await verifyOrgMembership(req.params.organizationId, req.user!.userId)) {
        res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
        return;
      }
      next();
    } catch (error) { next(error); }
  },
  upload.single('file'),
  async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: { message: 'No file provided', code: 'BAD_REQUEST' } });
        return;
      }
      const detectedMime = detectMime(req.file.buffer);
      if (!detectedMime || !extensions[detectedMime]) {
        res.status(400).json({ success: false, error: { message: 'Unsupported or invalid file content', code: 'INVALID_FILE' } });
        return;
      }
      if (req.file.mimetype && req.file.mimetype !== detectedMime) {
        res.status(400).json({ success: false, error: { message: 'File MIME type does not match its content', code: 'MIME_MISMATCH' } });
        return;
      }

      const uploadDir = path.join(process.cwd(), 'uploads', 'studio');
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filename = `${crypto.randomUUID()}${extensions[detectedMime]}`;
      const filePath = path.join(uploadDir, filename);
      await fs.promises.writeFile(filePath, req.file.buffer, { flag: 'wx' });

      try {
        const asset = await studioService.createAsset(req.params.organizationId, req.user!.userId, {
          filename,
          originalName: path.basename(req.file.originalname),
          mimeType: detectedMime,
          size: req.file.size,
          path: filePath,
        });
        res.status(201).json({ success: true, data: asset });
      } catch (error) {
        await fs.promises.unlink(filePath).catch(() => undefined);
        throw error;
      }
    } catch (error) { next(error); }
  }
);

router.get('/assets/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const asset = await studioService.getAsset(req.params.id);
    if (!await verifyOrgMembership(asset.organization_id, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }
    const stat = await fs.promises.stat(asset.storage_path).catch(() => null);
    if (!stat?.isFile()) {
      res.status(404).json({ success: false, error: { message: 'Asset file missing', code: 'NOT_FOUND' } });
      return;
    }
    res.setHeader('Content-Type', asset.mime_type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start > end || end >= stat.size) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      fs.createReadStream(asset.storage_path, { start, end }).pipe(res);
      return;
    }
    res.setHeader('Content-Length', String(stat.size));
    fs.createReadStream(asset.storage_path).pipe(res);
  } catch (error) { next(error); }
});

router.delete('/assets/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const asset = await studioService.getAsset(req.params.id);
    if (!await verifyOrgMembership(asset.organization_id, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }
    await studioService.deleteAsset(asset.id, asset.organization_id);
    res.json({ success: true, data: { message: 'Asset deleted' } });
  } catch (error) { next(error); }
});

router.post('/uploads', (_req, res) => {
  res.status(410).json({ success: false, error: { message: 'Use the organization-scoped upload route', code: 'UPLOAD_ROUTE_MOVED' } });
});

export default router;
