import { query } from '../config/database';
import { logger } from '../utils/logger';
import { healthCheck as providerHealthCheck } from './provider.service';
import { publishDuePostsThroughControlCentre } from './controlled-social-publishing.service';
import { checkCompetitor } from './competitor.service';
import { checkMonitor } from './trend.service';

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
  private tasks = new Map<string, ScheduledTask>();
  private started = false;

  scheduleTask(name: string, intervalMs: number, callback: () => Promise<void>): void {
    if (this.tasks.has(name)) this.cancelTask(name);
    const task: ScheduledTask = {
      name, intervalMs, callback, timer: null, lastRun: null,
      nextRun: new Date(Date.now() + intervalMs), running: false,
    };
    this.tasks.set(name, task);
    if (this.started) this.startTask(name);
    logger.info(`Task "${name}" scheduled every ${intervalMs}ms`);
  }

  cancelTask(name: string): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    if (task.timer) clearInterval(task.timer);
    this.tasks.delete(name);
    return true;
  }

  listTasks(): Array<{ name: string; intervalMs: number; lastRun: Date | null; nextRun: Date | null; running: boolean }> {
    return [...this.tasks.values()].map(({ name, intervalMs, lastRun, nextRun, running }) => ({ name, intervalMs, lastRun, nextRun, running }));
  }

  startScheduler(): void {
    if (this.started) return;
    this.started = true;
    this.registerDefaultTasks();
    for (const [name] of this.tasks) this.startTask(name);
    logger.info(`Scheduler started with ${this.tasks.size} tasks`);
  }

  stopScheduler(): void {
    for (const task of this.tasks.values()) {
      if (task.timer) clearInterval(task.timer);
      task.timer = null;
    }
    this.started = false;
  }

  isRunning(): boolean { return this.started; }

  private startTask(name: string): void {
    const task = this.tasks.get(name);
    if (!task) return;
    const runTask = async () => {
      if (task.running) return;
      task.running = true;
      task.lastRun = new Date();
      try { await task.callback(); }
      catch (error) { logger.error(`Task "${name}" failed`, error); }
      finally {
        task.running = false;
        task.nextRun = new Date(Date.now() + task.intervalMs);
      }
    };
    task.timer = setInterval(runTask, task.intervalMs);
    task.timer.unref?.();
    void runTask();
  }

  private registerDefaultTasks(): void {
    this.scheduleTask('publish-due-social-posts', 60 * 1000, async () => {
      const published = await publishDuePostsThroughControlCentre(25);
      if (published > 0) logger.info(`Published ${published} approved scheduled social posts`);
    });

    this.scheduleTask('check-trend-monitors', 15 * 60 * 1000, async () => {
      const result = await query(
        `SELECT id,organization_id FROM trend_monitors
         WHERE is_active=TRUE AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '30 minutes')
         ORDER BY last_checked_at NULLS FIRST LIMIT 20`
      );
      for (const row of result.rows) {
        try { await checkMonitor(String(row.id), String(row.organization_id)); }
        catch (error) { logger.warn(`Scheduled trend check failed for ${row.id}: ${error}`); }
      }
    });

    this.scheduleTask('check-competitors', 60 * 60 * 1000, async () => {
      const result = await query(
        `SELECT id,organization_id FROM competitors
         WHERE status='active' AND deleted_at IS NULL
           AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '6 hours')
         ORDER BY last_checked_at NULLS FIRST LIMIT 20`
      );
      for (const row of result.rows) {
        try { await checkCompetitor(String(row.id), String(row.organization_id)); }
        catch (error) { logger.warn(`Scheduled competitor check failed for ${row.id}: ${error}`); }
      }
    });

    this.scheduleTask('health-check', 5 * 60 * 1000, async () => {
      const results = await providerHealthCheck();
      const unhealthy = results.filter((result) => result.status !== 'healthy');
      if (unhealthy.length > 0) logger.warn(`Unhealthy providers: ${unhealthy.map((result) => result.name).join(', ')}`);
    });

    this.scheduleTask('cleanup-expired-tokens', 60 * 60 * 1000, async () => {
      await query('DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked=TRUE');
    });

    this.scheduleTask('cleanup-expired-invitations', 60 * 60 * 1000, async () => {
      await query('DELETE FROM invitations WHERE expires_at < NOW() AND accepted=FALSE');
    });
  }
}

const scheduler = new SchedulerService();
export default scheduler;
