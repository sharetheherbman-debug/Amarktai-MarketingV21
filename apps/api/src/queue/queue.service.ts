import { Queue, Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { QueueJobData } from '../types';

const queues: Map<string, Queue> = new Map();
const workers: Map<string, Worker> = new Map();

const connection = {
  url: env.REDIS_URL,
};

export type QueueName = 'content-generation' | 'campaign-execution' | 'analytics' | 'notifications';

export function createQueue(name: QueueName): Queue {
  if (queues.has(name)) {
    return queues.get(name)!;
  }

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  queues.set(name, queue);
  logger.info(`Queue created: ${name}`);
  return queue;
}

export async function addJob(
  queueName: QueueName,
  data: QueueJobData,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<Job> {
  const queue = createQueue(queueName);
  const job = await queue.add(queueName, data, {
    delay: options?.delay,
    priority: options?.priority,
    jobId: options?.jobId,
  });

  logger.info(`Job added to ${queueName}: ${job.id}`);
  return job;
}

export async function getJobStatus(queueName: QueueName, jobId: string): Promise<{
  id: string;
  status: string;
  progress: number;
  result?: unknown;
  error?: string;
} | null> {
  const queue = queues.get(queueName);
  if (!queue) {
    return null;
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  return {
    id: job.id!,
    status: state,
    progress: typeof job.progress === 'number' ? job.progress : 0,
    result: job.returnvalue,
    error: job.failedReason,
  };
}

export async function cancelJob(queueName: QueueName, jobId: string): Promise<boolean> {
  const queue = queues.get(queueName);
  if (!queue) {
    return false;
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return false;
  }

  await job.remove();
  logger.info(`Job cancelled: ${jobId} from ${queueName}`);
  return true;
}

export function registerWorker(
  queueName: QueueName,
  processor: (job: Job) => Promise<unknown>
): Worker {
  if (workers.has(queueName)) {
    return workers.get(queueName)!;
  }

  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job: Job) => {
    logger.info(`Job completed: ${job.id} in ${queueName}`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(`Job failed: ${job?.id} in ${queueName}: ${err.message}`);
  });

  workers.set(queueName, worker);
  logger.info(`Worker registered for: ${queueName}`);
  return worker;
}

export async function closeAllQueues(): Promise<void> {
  for (const [name, worker] of workers) {
    await worker.close();
    logger.info(`Worker closed: ${name}`);
  }

  for (const [name, queue] of queues) {
    await queue.close();
    logger.info(`Queue closed: ${name}`);
  }

  queues.clear();
  workers.clear();
}

export async function getQueueStats(queueName: QueueName): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = queues.get(queueName);
  if (!queue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

createQueue('content-generation');
createQueue('campaign-execution');
createQueue('analytics');
createQueue('notifications');
