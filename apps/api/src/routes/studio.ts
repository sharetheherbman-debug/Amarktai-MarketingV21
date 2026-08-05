import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as studioService from '../services/studio.service';
import { query } from '../config/database';

const router = Router();
router.use(requireAuth);

// Configure multer for file uploads (memory storage for security check first)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/ogg',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Helper: Verify organization membership
async function verifyOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/v1/studio/models
router.get('/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const models = studioService.getAvailableModels();
    res.json({ success: true, data: models });
  } catch (error) { next(error); }
});

// POST /api/v1/studio/generations
router.post('/generations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
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

// GET /api/v1/studio/generations/:id
router.get('/generations/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }

    if (!await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }

    const generation = await studioService.getGeneration(req.params.id, orgId);
    res.json({ success: true, data: generation });
  } catch (error) { next(error); }
});

// POST /api/v1/studio/generations/:id/cancel
router.post('/generations/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }

    if (!await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }

    await studioService.cancelGeneration(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Generation cancelled' } });
  } catch (error) { next(error); }
});

// GET /api/v1/studio/history
router.get('/history', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }

    if (!await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const history = await studioService.listGenerations(orgId, req.user!.userId, limit);
    res.json({ success: true, data: history });
  } catch (error) { next(error); }
});

// POST /api/v1/studio/uploads
router.post('/uploads', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    // Verify auth and org membership BEFORE processing upload
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }

    if (!await verifyOrgMembership(orgId, req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }

    // Now process the upload
    upload.single('file')(req, res, async (err) => {
      if (err) {
        res.status(400).json({ success: false, error: { message: err.message, code: 'UPLOAD_ERROR' } });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, error: { message: 'No file provided', code: 'BAD_REQUEST' } });
        return;
      }

      // Persist file to disk
      const filename = `${crypto.randomUUID()}${path.extname(req.file.originalname)}`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'studio');
      const filePath = path.join(uploadDir, filename);

      try {
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(filePath, req.file.buffer);
      } catch (writeErr) {
        res.status(500).json({ success: false, error: { message: 'Failed to save file', code: 'STORAGE_ERROR' } });
        return;
      }

      const result = await studioService.createUpload(orgId, req.user!.userId, {
        filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: filePath,
      });

      res.status(201).json({ success: true, data: result });
    });
  } catch (error) { next(error); }
});

export default router;
