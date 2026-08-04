import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as crmService from '../services/crm.service';

const router = Router();
router.use(requireAuth);

// ─── Dashboard ───────────────────────────────────────────────────────────────

router.get('/dashboard', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const stats = await crmService.getDashboardStats(orgId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// ─── Companies ───────────────────────────────────────────────────────────────

router.get('/companies', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const companies = await crmService.listCompanies(orgId, req.query.search as string);
    res.json({ success: true, data: companies });
  } catch (error) { next(error); }
});

router.get('/companies/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const company = await crmService.getCompanyById(req.params.id, orgId);
    res.json({ success: true, data: company });
  } catch (error) { next(error); }
});

router.post('/companies', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const company = await crmService.createCompany(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: company });
  } catch (error) { next(error); }
});

router.put('/companies/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const company = await crmService.updateCompany(req.params.id, orgId, req.body);
    res.json({ success: true, data: company });
  } catch (error) { next(error); }
});

router.delete('/companies/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await crmService.deleteCompany(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Company deleted' } });
  } catch (error) { next(error); }
});

// ─── Contacts ────────────────────────────────────────────────────────────────

router.get('/contacts', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const contacts = await crmService.listContacts(orgId, { status: req.query.status as string, owner_id: req.query.owner_id as string, company_id: req.query.company_id as string, search: req.query.search as string });
    res.json({ success: true, data: contacts });
  } catch (error) { next(error); }
});

router.get('/contacts/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const contact = await crmService.getContactById(req.params.id, orgId);
    res.json({ success: true, data: contact });
  } catch (error) { next(error); }
});

router.post('/contacts', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const contact = await crmService.createContact(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: contact });
  } catch (error) { next(error); }
});

router.put('/contacts/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const contact = await crmService.updateContact(req.params.id, orgId, req.body);
    res.json({ success: true, data: contact });
  } catch (error) { next(error); }
});

router.delete('/contacts/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await crmService.deleteContact(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Contact deleted' } });
  } catch (error) { next(error); }
});

router.post('/contacts/:id/score', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const score = await crmService.scoreContact(req.params.id, orgId);
    res.json({ success: true, data: score });
  } catch (error) { next(error); }
});

// ─── Deals ───────────────────────────────────────────────────────────────────

router.get('/deals', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const deals = await crmService.listDeals(orgId, { stage: req.query.stage as string, status: req.query.status as string, owner_id: req.query.owner_id as string, contact_id: req.query.contact_id as string });
    res.json({ success: true, data: deals });
  } catch (error) { next(error); }
});

router.get('/deals/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const deal = await crmService.getDealById(req.params.id, orgId);
    res.json({ success: true, data: deal });
  } catch (error) { next(error); }
});

router.post('/deals', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const deal = await crmService.createDeal(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: deal });
  } catch (error) { next(error); }
});

router.put('/deals/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const deal = await crmService.updateDeal(req.params.id, orgId, req.body);
    res.json({ success: true, data: deal });
  } catch (error) { next(error); }
});

router.post('/deals/:id/analyze', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const analysis = await crmService.analyzeDeal(req.params.id, orgId);
    res.json({ success: true, data: analysis });
  } catch (error) { next(error); }
});

// ─── Customers ───────────────────────────────────────────────────────────────

router.get('/customers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const customers = await crmService.listCustomers(orgId, { status: req.query.status as string });
    res.json({ success: true, data: customers });
  } catch (error) { next(error); }
});

router.get('/customers/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const customer = await crmService.getCustomerById(req.params.id, orgId);
    res.json({ success: true, data: customer });
  } catch (error) { next(error); }
});

router.post('/customers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const customer = await crmService.createCustomer(orgId, req.body);
    res.status(201).json({ success: true, data: customer });
  } catch (error) { next(error); }
});

router.put('/customers/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const customer = await crmService.updateCustomer(req.params.id, orgId, req.body);
    res.json({ success: true, data: customer });
  } catch (error) { next(error); }
});

router.post('/customers/:id/analyze', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const analysis = await crmService.analyzeCustomer(req.params.id, orgId);
    res.json({ success: true, data: analysis });
  } catch (error) { next(error); }
});

// ─── Activities ──────────────────────────────────────────────────────────────

router.get('/activities', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const entityType = req.query.entity_type as string;
    const entityId = req.query.entity_id as string;
    if (!orgId || !entityType || !entityId) { res.status(400).json({ success: false, error: { message: 'organization_id, entity_type, and entity_id required', code: 'BAD_REQUEST' } }); return; }
    const activities = await crmService.listActivities(orgId, entityType, entityId);
    res.json({ success: true, data: activities });
  } catch (error) { next(error); }
});

router.post('/activities', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const activity = await crmService.createActivity(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: activity });
  } catch (error) { next(error); }
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

router.get('/tasks', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const tasks = await crmService.listTasks(orgId, { assigned_to: req.query.assigned_to as string, status: req.query.status as string });
    res.json({ success: true, data: tasks });
  } catch (error) { next(error); }
});

router.post('/tasks', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const task = await crmService.createTask(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: task });
  } catch (error) { next(error); }
});

router.put('/tasks/:id/complete', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await crmService.completeTask(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Task completed' } });
  } catch (error) { next(error); }
});

// ─── Notes ───────────────────────────────────────────────────────────────────

router.get('/notes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const entityType = req.query.entity_type as string;
    const entityId = req.query.entity_id as string;
    if (!orgId || !entityType || !entityId) { res.status(400).json({ success: false, error: { message: 'organization_id, entity_type, and entity_id required', code: 'BAD_REQUEST' } }); return; }
    const notes = await crmService.listNotes(orgId, entityType, entityId);
    res.json({ success: true, data: notes });
  } catch (error) { next(error); }
});

router.post('/notes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, entity_type, entity_id, content } = req.body;
    if (!organization_id || !entity_type || !entity_id || !content) { res.status(400).json({ success: false, error: { message: 'organization_id, entity_type, entity_id, and content required', code: 'BAD_REQUEST' } }); return; }
    await crmService.createNote(organization_id, entity_type, entity_id, content, req.user!.userId);
    res.status(201).json({ success: true, data: { message: 'Note created' } });
  } catch (error) { next(error); }
});

// ─── Email Templates ─────────────────────────────────────────────────────────

router.get('/email-templates', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const templates = await crmService.listEmailTemplates(orgId, req.query.category as string);
    res.json({ success: true, data: templates });
  } catch (error) { next(error); }
});

router.post('/email-templates', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const template = await crmService.createEmailTemplate(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: template });
  } catch (error) { next(error); }
});

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

router.get('/pipeline-stages', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const stages = await crmService.getPipelineStages(orgId, req.query.pipeline as string);
    res.json({ success: true, data: stages });
  } catch (error) { next(error); }
});

export default router;
