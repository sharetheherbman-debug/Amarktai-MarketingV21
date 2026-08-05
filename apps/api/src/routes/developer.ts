import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as devPortal from '../services/developer-portal.service';

const router = Router();

// Public routes
router.get('/sdk', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const sdkInfo = devPortal.getSdkInfo();
    res.json({ success: true, data: sdkInfo });
  } catch (error) { next(error); }
});

router.post('/webhooks/test', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { url, payload, headers } = req.body;
    if (!url || !payload) {
      res.status(400).json({ success: false, error: { message: 'url and payload required', code: 'BAD_REQUEST' } });
      return;
    }
    const result = await devPortal.testWebhook(url, payload, headers);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

// Protected routes
router.use(requireAuth);

// Developer Profile
router.get('/profile', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const profile = await devPortal.getDeveloperProfile(req.user!.userId);
    res.json({ success: true, data: profile });
  } catch (error) { next(error); }
});

// OAuth Applications
router.post('/oauth/apps', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const result = await devPortal.createOAuthApp(req.user!.userId, req.body.organization_id || null, req.body);
    res.status(201).json({ success: true, data: result.app, meta: { client_secret: result.client_secret } });
  } catch (error) { next(error); }
});

router.get('/oauth/apps', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const apps = await devPortal.listOAuthApps(req.user!.userId);
    res.json({ success: true, data: apps });
  } catch (error) { next(error); }
});

router.delete('/oauth/apps/:clientId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    await devPortal.deleteOAuthApp(req.params.clientId, req.user!.userId);
    res.json({ success: true, data: { message: 'OAuth app deleted' } });
  } catch (error) { next(error); }
});

// API Keys
router.post('/api-keys', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const result = await devPortal.createApiKey(req.user!.userId, orgId, req.body);
    res.status(201).json({ success: true, data: result.key, meta: { plain_key: result.plain_key } });
  } catch (error) { next(error); }
});

router.get('/api-keys', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const keys = await devPortal.listApiKeys(req.user!.userId, orgId);
    res.json({ success: true, data: keys });
  } catch (error) { next(error); }
});

router.delete('/api-keys/:keyId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    await devPortal.revokeApiKey(req.params.keyId, req.user!.userId);
    res.json({ success: true, data: { message: 'API key revoked' } });
  } catch (error) { next(error); }
});

export default router;
