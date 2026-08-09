import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import {
  authenticateApplicationRequest,
  issueSsoCode,
  redeemSsoCode,
  recordConversionEvent,
  type SsoIssuePayload,
  type ConversionEventPayload,
} from '../services/application-connector.service';

const router = Router();

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

router.post('/sso/issue', async (req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const application = await authenticateApplicationRequest(req, req.body);
    const result = await issueSsoCode(application, req.body as SsoIssuePayload);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/sso/redeem', async (req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const code = String(req.body?.code || '');
    const session = await redeemSsoCode(code);

    res.cookie('accessToken', session.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', session.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: session.user,
        organization: session.organization,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        target_path: session.target_path,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events/conversion', async (req: Request, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const application = await authenticateApplicationRequest(req, req.body);
    const result = await recordConversionEvent(application, req.body as ConversionEventPayload);
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
