import { Router, Request, Response, NextFunction } from 'express';
import { unsubscribeRecipient } from '../services/email-unsubscribe.service';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await unsubscribeRecipient(String(req.query.token || req.body?.token || ''));
    res.status(200).json({ success: true, data: { message: 'You have been unsubscribed from marketing email.' } });
  } catch (error) { next(error); }
});

export default router;
