import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err: Error) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('error', (err) => {
  logger.error('Redis error', err);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
  logger.info(`Redis reconnecting in ${delay}ms`);
});

export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    logger.info('Redis ping successful', { response: result });
    return true;
  } catch (error) {
    logger.error('Redis ping failed', error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis connection closed');
}

export default redis;
