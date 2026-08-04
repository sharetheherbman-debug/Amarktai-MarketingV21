import { PluginInterface, PluginHook, HookName, PluginManifest, PluginExecutionContext, PluginResult } from './plugin.interface';
import { logger } from '../utils/logger';

export class PluginManager {
  private plugins: Map<string, PluginInterface> = new Map();
  private hooks: Map<HookName, PluginHook[]> = new Map();

  async registerPlugin(plugin: PluginInterface): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }

    for (const hook of plugin.hooks) {
      if (!this.hooks.has(hook.name)) {
        this.hooks.set(hook.name, []);
      }
      this.hooks.get(hook.name)!.push(hook);
    }

    this.plugins.set(plugin.id, plugin);
    logger.info(`Plugin registered: ${plugin.name} v${plugin.version}`);

    await this.executeHook('onInit', { pluginId: plugin.id });
  }

  unregisterPlugin(id: string): void {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin not found: ${id}`);
    }

    for (const hook of plugin.hooks) {
      const hooks = this.hooks.get(hook.name);
      if (hooks) {
        const index = hooks.indexOf(hook);
        if (index > -1) {
          hooks.splice(index, 1);
        }
      }
    }

    this.plugins.delete(id);
    logger.info(`Plugin unregistered: ${id}`);
  }

  getPlugin(id: string): PluginInterface | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): PluginInterface[] {
    return Array.from(this.plugins.values());
  }

  async executeHook(hookName: HookName, data: Record<string, unknown>, context?: PluginExecutionContext): Promise<PluginResult[]> {
    const hooks = this.hooks.get(hookName) || [];
    const results: PluginResult[] = [];

    for (const hook of hooks) {
      try {
        const result = await hook.handler({
          ...data,
          context,
        });
        results.push({
          success: true,
          data: result,
          continueExecution: true,
        });
      } catch (error) {
        logger.error(`Plugin hook ${hookName} failed: ${error}`);
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          continueExecution: true,
        });
      }
    }

    return results;
  }

  async shutdown(): Promise<void> {
    await this.executeHook('onShutdown', {});
    this.plugins.clear();
    this.hooks.clear();
    logger.info('Plugin manager shut down');
  }

  getPluginCount(): number {
    return this.plugins.size;
  }

  hasPlugin(id: string): boolean {
    return this.plugins.has(id);
  }
}

export const pluginManager = new PluginManager();
