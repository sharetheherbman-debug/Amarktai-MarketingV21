import { Router, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '../types';
import * as socialService from '../services/social-publishing.service';
import { publishPostThroughControlCentre } from '../services/controlled-social-publishing.service';

const router = Router();

type ControlHold = { status: 'pending_approval' | 'blocked_by_policy'; approvalRequired: boolean; message: string };

function controlHold(error: unknown): ControlHold | null {
  if (!(error instanceof AppError)) return null;
  if (error.code === 'RELAUNCH_APPROVAL_REQUIRED') {
    return {
      status: 'pending_approval',
      approvalRequired: true,
      message: error.message,
    };
  }
  if (error.code === 'RELAUNCH_ACTION_BLOCKED') {
    return {
      status: 'blocked_by_policy',
      approvalRequired: false,
      message: error.message,
    };
  }
  return null;
}

router.post('/social/posts', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const {
      connection_id,
      body,
      content_id,
      campaign_id,
      media_urls,
      hashtags,
      scheduled_at,
      publish_now,
    } = req.body;
    if (!connection_id || !body) {
      res.status(400).json({
        success: false,
        error: { message: 'connection_id and body required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const post = await socialService.schedulePost(organizationId, connection_id, body, {
      content_id,
      campaign_id,
      media_urls,
      hashtags,
      scheduled_at,
    });
    if (!publish_now) {
      res.status(201).json({ success: true, data: post });
      return;
    }

    try {
      const published = await publishPostThroughControlCentre(
        post.id,
        organizationId,
        req.user!.userId
      );
      res.status(201).json({ success: true, data: published });
    } catch (error) {
      const hold = controlHold(error);
      if (!hold) throw error;
      res.status(202).json({
        success: true,
        data: {
          ...post,
          status: hold.status,
          approval_required: hold.approvalRequired,
          control_message: hold.message,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/social/posts/:id/publish', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const post = await publishPostThroughControlCentre(
      req.params.id,
      req.organizationId!,
      req.user!.userId
    );
    res.json({ success: true, data: post });
  } catch (error) {
    const hold = controlHold(error);
    if (hold) {
      res.status(202).json({
        success: true,
        data: {
          id: req.params.id,
          status: hold.status,
          approval_required: hold.approvalRequired,
          control_message: hold.message,
        },
      });
      return;
    }
    next(error);
  }
});

export default router;
