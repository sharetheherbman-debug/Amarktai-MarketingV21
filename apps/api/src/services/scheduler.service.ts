import { query } from '../config/database';
import redis from '../config/redis';
import { logger } from '../utils/logger';
import { healthCheck as providerHealthCheck } from './provider.service';

interface ScheduledTask {
  name: string;
  intervalMs: number;
  callback: () => Promise<void>;
  timer: ReturnType<typeof setInterval> | null;
  lastRun: Date | null;
  nextRun: Date | null;
  running: boolean;
}

class SchedulerService {
  private tasks: Map<string, ScheduledTask> = new Map();
  private started = false;

  scheduleTask(name: string, intervalMs: number, callback: () => Promise<void>): void {
    if (this.tasks.has(name)) {
      logger.warn(`Task "${name}" already exists, cancelling before rescheduling`);
      this.cancelTask(name);
    }

    const task: ScheduledTask = {
      name,
      intervalMs,
      callback,
      timer: null,
      lastRun: null,
      nextRun: new Date(Date.now() + intervalMs),
      running: false,
    };

    this.tasks.set(name, task);

    if (this.started) {
      this.startTask(name);
    }

    logger.info(`Task "${name}" scheduled with interval ${intervalMs}ms`);
  }

  cancelTask(name: string): boolean {
    const task = this.tasks.get(name);
    if (!task) {
      logger.warn(`Task "${name}" not found`);
      return false;
    }

    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }

    this.tasks.delete(name);
    logger.info(`Task "${name}" cancelled`);
    return true;
  }

  listTasks(): Array<{ name: string; intervalMs: number; lastRun: Date | null; nextRun: Date | null; running: boolean }> {
    return Array.from(this.tasks.values()).map((task) => ({
      name: task.name,
      intervalMs: task.intervalMs,
      lastRun: task.lastRun,
      nextRun: task.nextRun,
      running: task.running,
    }));
  }

  startScheduler(): void {
    if (this.started) {
      logger.warn('Scheduler already started');
      return;
    }

    this.started = true;

    this.registerDefaultTasks();

    for (const [name] of this.tasks) {
      this.startTask(name);
    }

    logger.info(`Scheduler started with ${this.tasks.size} tasks`);
  }

  stopScheduler(): void {
    if (!this.started) {
      logger.warn('Scheduler not started');
      return;
    }

    for (const [name, task] of this.tasks) {
      if (task.timer) {
        clearInterval(task.timer);
        task.timer = null;
      }
      logger.debug(`Stopped task "${name}"`);
    }

    this.started = false;
    logger.info('Scheduler stopped');
  }

  isRunning(): boolean {
    return this.started;
  }

  private startTask(name: string): void {
    const task = this.tasks.get(name);
    if (!task) return;

    const runTask = async () => {
      if (task.running) {
        logger.debug(`Task "${name}" still running, skipping`);
        return;
      }

      task.running = true;
      task.lastRun = new Date();

      try {
        await task.callback();
        logger.debug(`Task "${name}" completed`);
      } catch (error) {
        logger.error(`Task "${name}" failed:`, error);
      } finally {
        task.running = false;
        task.nextRun = new Date(Date.now() + task.intervalMs);
      }
    };

    task.timer = setInterval(runTask, task.intervalMs);
    logger.debug(`Task "${name}" started`);
  }

  private registerDefaultTasks(): void {
    this.scheduleTask('health-check', 5 * 60 * 1000, async () => {
      logger.info('Running provider health check...');
      try {
        const results = await providerHealthCheck();
        const unhealthy = results.filter((r) => r.status !== 'healthy');
        if (unhealthy.length > 0) {
          logger.warn(`Unhealthy providers: ${unhealthy.map((r) => r.name).join(', ')}`);
        } else {
          logger.info('All providers healthy');
        }
      } catch (error) {
        logger.error('Health check task failed:', error);
      }
    });

    this.scheduleTask('cleanup-expired-tokens', 60 * 60 * 1000, async () => {
      logger.info('Cleaning up expired refresh tokens...');
      try {
        const result = await query(
          'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = true'
        );
        logger.info(`Cleaned up ${result.rowCount} expired/revoked refresh tokens`);
      } catch (error) {
        logger.error('Token cleanup task failed:', error);
      }
    });

    this.scheduleTask('cleanup-expired-invitations', 60 * 60 * 1000, async () => {
      logger.info('Cleaning up expired invitations...');
      try {
        const result = await query(
          'DELETE FROM invitations WHERE expires_at < NOW() AND accepted = false'
        );
        logger.info(`Cleaned up ${result.rowCount} expired invitations`);
      } catch (error) {
        logger.error('Invitation cleanup task failed:', error);
      }
    });
  }
}

const scheduler = new SchedulerService();

export default scheduler;
