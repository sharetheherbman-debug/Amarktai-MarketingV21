import { Router, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { ApiResponse } from '../types';
import * as socialService from '../services/social-publishing.service';
import { publishPostThroughControlCentre } from '../services/controlled-social-publishing.service';

const router = Router();

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
    const result = publish_now
      ? await publishPostThroughControlCentre(post.id, organizationId, req.user!.userId)
      : post;
    res.status(201).json({ success: true, data: result });
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
    next(error);
  }
});

export default router;
