import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { testConnection, closePool } from './config/database';
import { testRedisConnection, closeRedis } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimit';
import { csrfProtection } from './middleware/csrf';
import { requireAuth } from './middleware/auth';
import { requireOrganizationMembership } from './middleware/organization-access';
import { providerRouter } from './providers/provider-router';

import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import applicationConnectorRoutes from './routes/application-connectors';
import organizationRoutes from './routes/organizations';
import userRoutes from './routes/users';
import providerRoutes from './routes/providers';
import onboardingRoutes from './routes/onboarding';
import campaignRoutes from './routes/campaigns';
import contentRoutes from './routes/content';
import agentRoutes from './routes/agents';
import toolRoutes from './routes/tools';
import promptRoutes from './routes/prompts';
import brandDnaRoutes from './routes/brand-dna';
import knowledgeRoutes from './routes/knowledge';
import competitorRoutes from './routes/competitors';
import trendRoutes from './routes/trends';
import contentStudioRoutes from './routes/content-studio';
import templateRoutes from './routes/templates';
import calendarRoutes from './routes/calendar';
import seoRoutes from './routes/seo';
import campaignAiRoutes from './routes/campaign-ai';
import controlledSocialRoutes from './routes/controlled-social';
import amaiRoutes from './routes/amai';
import crmAiActionRoutes from './routes/crm-ai-actions';
import crmRoutes from './routes/crm';
import integrationRoutes from './routes/integrations';
import billingRoutes from './routes/billing';
import generationCreditRoutes from './routes/generation-credits';
import relaunchControlRoutes from './routes/relaunch-control';
import agencyRoutes from './routes/agency';
import whiteLabelPublicRoutes from './routes/white-label-public';
import whiteLabelRoutes from './routes/white-label';
import templateLibraryRoutes from './routes/template-library';
import clientReportsRoutes from './routes/client-reports';
import adminRoutes from './routes/admin';
import marketplaceCommerceRoutes from './routes/marketplace-commerce';
import marketplaceRoutes from './routes/marketplace';
import developerRoutes from './routes/developer';
import studioOperationalRoutes from './routes/studio-operational-models';
import studioRoutes from './routes/studio';
import genxAdminRoutes from './routes/genx-admin';
import longformVideoRoutes from './routes/longform-video';
import longformProductionRoutes from './routes/longform-production';
import longformSceneProductionRoutes from './routes/longform-scene-production';
import growthDirectorRoutes from './routes/growth-director';
import emailUnsubscribeRoutes from './routes/email-unsubscribe';
import scheduler from './services/scheduler.service';
import { verifyStripeWebhook } from './services/stripe-client.service';
import { processStripeEvent } from './services/stripe-webhook.service';
import { ensureConfiguredEquiProfileConnector } from './services/application-connector.service';
import { hardenLegacyEmailProviderConfigs } from './services/integration.service';

const app = express();
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.disable('x-powered-by');

function toOrigin(value: string): string {
  try { return new URL(value).origin; }
  catch { return value.replace(/\/$/, ''); }
}

const allowedOrigins = new Set(
  [env.APP_URL, env.API_URL, ...env.CORS_ORIGIN.split(',')]
    .map((value) => value.trim()).filter(Boolean).map(toOrigin)
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(toOrigin(origin))) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token',
    'X-Organization-Id', 'X-Idempotency-Key', 'Idempotency-Key', 'Range',
    'X-Application-Id', 'X-Application-Key', 'X-Application-Timestamp',
    'X-Application-Nonce', 'X-Application-Signature',
  ],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  maxAge: 86400,
}));

app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] } },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(compression());
app.use(morgan('combined', { stream: { write: (message: string) => logger.http(message.trim()) } }));

const stripeWebhookHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const signature = req.header('stripe-signature');
    if (!signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ success: false, error: { message: 'Stripe signature and raw body required', code: 'STRIPE_SIGNATURE_REQUIRED' } });
      return;
    }
    const event = verifyStripeWebhook(req.body, signature);
    await processStripeEvent(event);
    res.json({ received: true });
  } catch (error) { next(error); }
};

app.post('/api/v1/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookHandler);
app.post('/api/v1/marketplace/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhookHandler);
app.use('/api/v1/email/unsubscribe', generalLimiter, express.json({ limit: '16kb' }), express.urlencoded({ extended: false, limit: '16kb' }), emailUnsubscribeRoutes);

app.use(cookieParser());
app.use(csrfProtection);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(generalLimiter);

app.get('/', (_req: Request, res: Response) => res.json({ name: 'EquiProfile Marketing API', version: '1.0.0', status: 'running', timestamp: new Date().toISOString() }));
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

const tenant = [requireAuth, requireOrganizationMembership] as const;

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/application-connectors', applicationConnectorRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/campaigns', ...tenant, campaignRoutes);
app.use('/api/v1/content', ...tenant, contentRoutes);
app.use('/api/v1/agents', ...tenant, agentRoutes);
app.use('/api/v1/tools', toolRoutes);
app.use('/api/v1/prompts', ...tenant, promptRoutes);
app.use('/api/v1/brand-dna', ...tenant, brandDnaRoutes);
app.use('/api/v1/knowledge', ...tenant, knowledgeRoutes);
app.use('/api/v1/competitors', ...tenant, competitorRoutes);
app.use('/api/v1/trends', ...tenant, trendRoutes);
app.use('/api/v1/content-studio', ...tenant, contentStudioRoutes);
app.use('/api/v1/templates', ...tenant, templateRoutes);
app.use('/api/v1/calendar', ...tenant, calendarRoutes);
app.use('/api/v1/seo', ...tenant, seoRoutes);
app.use('/api/v1/campaign-ai', ...tenant, campaignAiRoutes);
// These two external-delivery endpoints are intercepted before the legacy AMAI
// router so neither manual nor scheduled social publishing can bypass Relaunch Control.
app.use('/api/v1/amai', ...tenant, controlledSocialRoutes);
app.use('/api/v1/amai', ...tenant, amaiRoutes);
app.use('/api/v1/crm', ...tenant, crmAiActionRoutes);
app.use('/api/v1/crm', ...tenant, crmRoutes);
app.use('/api/v1/integrations', ...tenant, integrationRoutes);
app.use('/api/v1/billing', ...tenant, billingRoutes);
app.use('/api/v1/generation-credits', ...tenant, generationCreditRoutes);
app.use('/api/v1/relaunch-control', ...tenant, relaunchControlRoutes);
app.use('/api/v1/agency', ...tenant, agencyRoutes);
app.use('/api/v1/white-label', whiteLabelPublicRoutes);
app.use('/api/v1/white-label', whiteLabelRoutes);
app.use('/api/v1/template-library', ...tenant, templateLibraryRoutes);
app.use('/api/v1/client-reports', clientReportsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/marketplace', marketplaceCommerceRoutes);
app.use('/api/v1/marketplace', marketplaceRoutes);
app.use('/api/v1/developer', developerRoutes);
app.use('/api/v1/studio', studioOperationalRoutes);
app.use('/api/v1/studio', studioRoutes);
app.use('/api/v1/admin/genx', genxAdminRoutes);
app.use('/api/v1/longform-video', longformSceneProductionRoutes);
app.use('/api/v1/longform-video', longformVideoRoutes);
app.use('/api/v1/longform-video', longformProductionRoutes);
app.use('/api/v1/growth-director', ...tenant, growthDirectorRoutes);

app.use((_req: Request, res: Response) => res.status(404).json({ success: false, error: { message: 'Route not found', code: 'NOT_FOUND' } }));
app.use(errorHandler);

async function startServer() {
  try {
    if (!await testConnection()) { logger.error('Failed to connect to database'); process.exit(1); }
    if (!await testRedisConnection()) { logger.error('Redis connection failed; queue-backed features cannot start'); process.exit(1); }
    await ensureConfiguredEquiProfileConnector();
    await hardenLegacyEmailProviderConfigs();
    await providerRouter.loadProviders();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`API URL: ${env.API_URL}`);
      logger.info(`App URL: ${env.APP_URL}`);
      scheduler.startScheduler();
    });

    let shuttingDown = false;
    const gracefulShutdown = async (signal: string, exitCode = 0) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`${signal} received. Starting graceful shutdown...`);
      const forceExit = setTimeout(() => process.exit(1), 30000);
      forceExit.unref();
      server.close(async () => {
        scheduler.stopScheduler();
        try {
          await closePool();
          await closeRedis();
          clearTimeout(forceExit);
          process.exit(exitCode);
        } catch (error) {
          logger.error('Error during shutdown', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
    process.on('unhandledRejection', (reason, promise) => { logger.error('Unhandled Rejection at:', promise, 'reason:', reason); void gracefulShutdown('unhandledRejection', 1); });
    process.on('uncaughtException', (error) => { logger.error('Uncaught Exception:', error); void gracefulShutdown('uncaughtException', 1); });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

void startServer();
export default app;
