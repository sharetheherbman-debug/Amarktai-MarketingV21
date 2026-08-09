import { Router, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse } from '../types';
import * as socialService from '../services/social-publishing.service';
import { publishPostThroughControlCentre } from '../services/controlled-social-publishing.service';

const router = Router();

function isApprovalHold(error: unknown): boolean {
  return error instanceof AppError
    && ['RELAUNCH_APPROVAL_REQUIRED', 'RELAUNCH_ACTION_BLOCKED'].includes(error.code);
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
      if (!isApprovalHold(error)) throw error;
      res.status(202).json({
        success: true,
        data: {
          ...post,
          status: 'pending_approval',
          approval_required: true,
          approval_message: error instanceof Error ? error.message : 'Relaunch Control approval required',
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
    if (isApprovalHold(error)) {
      res.status(202).json({
        success: true,
        data: {
          id: req.params.id,
          status: 'pending_approval',
          approval_required: true,
          approval_message: error instanceof Error ? error.message : 'Relaunch Control approval required',
        },
      });
      return;
    }
    next(error);
  }
});

export default router;
