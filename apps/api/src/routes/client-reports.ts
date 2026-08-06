import { Router, Response, NextFunction } from 'express';
import * as reportsService from '../services/client-reports.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireAgencyAccess } from '../middleware/agency-access';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const createReportSchema = z.object({
  agency_id: z.string().uuid(), client_organization_id: z.string().uuid(), title: z.string().min(1).max(500),
  report_type: z.enum(['monthly', 'weekly', 'campaign', 'custom']), period_start: z.string().optional(),
  period_end: z.string().optional(), content: z.record(z.unknown()).optional(), summary: z.string().optional(),
});
const sendReportSchema = z.object({
  agency_id: z.string().uuid().optional(),
  recipients: z.array(z.string().email()).min(1).max(20),
});

router.get('/', requireAgencyAccess(), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    res.json({ success: true, data: await reportsService.listReports(String(req.query.agency_id), req.query.client_organization_id ? String(req.query.client_organization_id) : undefined) });
  } catch (error) { next(error); }
});

router.get('/stats', requireAgencyAccess(), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await reportsService.getReportStats(String(req.query.agency_id)) }); }
  catch (error) { next(error); }
});

router.get('/:reportId', requireAgencyAccess(), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await reportsService.getReport(req.params.reportId, String(req.query.agency_id)) }); }
  catch (error) { next(error); }
});

router.post('/', requireAgencyAccess('owner', 'admin', 'manager'), validateBody(createReportSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.status(201).json({ success: true, data: await reportsService.createReport(req.body.agency_id, req.user!.userId, req.body) }); }
  catch (error) { next(error); }
});

router.put('/:reportId', requireAgencyAccess('owner', 'admin', 'manager'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await reportsService.updateReport(req.params.reportId, req.body.agency_id, req.body) }); }
  catch (error) { next(error); }
});

router.post('/:reportId/publish', requireAgencyAccess('owner', 'admin', 'manager'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await reportsService.publishReport(req.params.reportId, req.body.agency_id) }); }
  catch (error) { next(error); }
});

router.post('/:reportId/send', requireAgencyAccess('owner', 'admin', 'manager'), validateBody(sendReportSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await reportsService.sendReport(req.params.reportId, req.body.agency_id, req.body.recipients) }); }
  catch (error) { next(error); }
});

router.delete('/:reportId', requireAgencyAccess('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await reportsService.deleteReport(req.params.reportId, String(req.query.agency_id));
    res.json({ success: true, data: { message: 'Report deleted' } });
  } catch (error) { next(error); }
});

export default router;
