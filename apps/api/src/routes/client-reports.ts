import { Router, Response, NextFunction } from 'express';
import * as reportsService from '../services/client-reports.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

const createReportSchema = z.object({
  agency_id: z.string().uuid(),
  client_organization_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  report_type: z.enum(['monthly', 'weekly', 'campaign', 'custom']),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  content: z.record(z.unknown()).optional(),
  summary: z.string().optional(),
});

// List Reports
router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.query.agency_id as string;
    const clientOrgId = req.query.client_organization_id as string;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const reports = await reportsService.listReports(agencyId, clientOrgId);
    res.json({ success: true, data: reports });
  } catch (error) { next(error); }
});

// Get Report Stats
router.get('/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.query.agency_id as string;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const stats = await reportsService.getReportStats(agencyId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// Get Single Report
router.get('/:reportId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.query.agency_id as string;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const report = await reportsService.getReport(req.params.reportId, agencyId);
    res.json({ success: true, data: report });
  } catch (error) { next(error); }
});

// Create Report
router.post('/', validateBody(createReportSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const report = await reportsService.createReport(req.body.agency_id, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: report });
  } catch (error) { next(error); }
});

// Update Report
router.put('/:reportId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.body.agency_id;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const report = await reportsService.updateReport(req.params.reportId, agencyId, req.body);
    res.json({ success: true, data: report });
  } catch (error) { next(error); }
});

// Publish Report
router.post('/:reportId/publish', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.body.agency_id;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const report = await reportsService.publishReport(req.params.reportId, agencyId);
    res.json({ success: true, data: report });
  } catch (error) { next(error); }
});

// Send Report
router.post('/:reportId/send', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.body.agency_id;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const report = await reportsService.sendReport(req.params.reportId, agencyId);
    res.json({ success: true, data: report });
  } catch (error) { next(error); }
});

// Delete Report
router.delete('/:reportId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agencyId = req.query.agency_id as string;
    if (!agencyId) {
      res.status(400).json({ success: false, error: { message: 'agency_id required', code: 'BAD_REQUEST' } });
      return;
    }
    await reportsService.deleteReport(req.params.reportId, agencyId);
    res.json({ success: true, data: { message: 'Report deleted' } });
  } catch (error) { next(error); }
});

export default router;
