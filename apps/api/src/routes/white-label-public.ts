import { Router, Request, Response, NextFunction } from 'express';
import { isAuthorizedCustomDomain } from '../services/white-label.service';

const router = Router();

router.get('/domains/authorize', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const domain = String(req.query.domain || req.query.host || '').trim();
    if (!domain) {
      res.status(400).type('text/plain').send('domain required');
      return;
    }
    if (!await isAuthorizedCustomDomain(domain)) {
      res.status(403).type('text/plain').send('domain not authorized');
      return;
    }
    res.status(200).type('text/plain').send('authorized');
  } catch (error) { next(error); }
});

export default router;
