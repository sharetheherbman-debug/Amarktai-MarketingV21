import express, { Request, Response, NextFunction } from 'express';
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

import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import organizationRoutes from './routes/organizations';
import userRoutes from './routes/users';
import providerRoutes from './routes/providers';
import onboardingRoutes from './routes/onboarding';
import campaignRoutes from './routes/campaigns';
import contentRoutes from './routes/content';
import agentRoutes from './routes/agents';
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
import amaiRoutes from './routes/amai';
import crmRoutes from './routes/crm';
import scheduler from './services/scheduler.service';

const app = express();

app.use(cors({
  origin: env.APP_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());

app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.http(message.trim()),
  },
}));

app.use(cookieParser());

app.use(csrfProtection);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(generalLimiter);

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'AmarktAI Marketing API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/content', contentRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/prompts', promptRoutes);
app.use('/api/v1/brand-dna', brandDnaRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);
app.use('/api/v1/competitors', competitorRoutes);
app.use('/api/v1/trends', trendRoutes);
app.use('/api/v1/content-studio', contentStudioRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/seo', seoRoutes);
app.use('/api/v1/campaign-ai', campaignAiRoutes);
app.use('/api/v1/amai', amaiRoutes);
app.use('/api/v1/crm', crmRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route not found', code: 'NOT_FOUND' },
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database');
      process.exit(1);
    }

    const redisConnected = await testRedisConnection();
    if (!redisConnected) {
      logger.warn('Redis connection failed, some features may be limited');
    }

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`API URL: ${env.API_URL}`);
      logger.info(`App URL: ${env.APP_URL}`);

      scheduler.startScheduler();
    });

    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        scheduler.stopScheduler();

        try {
          await closePool();
          await closeRedis();
          logger.info('All connections closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();

export default app;
