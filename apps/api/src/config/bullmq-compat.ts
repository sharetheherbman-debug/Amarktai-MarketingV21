import { Job } from 'bullmq';

declare module 'bullmq' {
  interface Job {
    isActive(): Promise<boolean>;
    readonly name: string;
  }
}

type CompatibleJob = Job & {
  data?: { kind?: string };
  getState(): Promise<string>;
};

const prototype = Job.prototype as CompatibleJob;

if (typeof prototype.isActive !== 'function') {
  Object.defineProperty(prototype, 'isActive', {
    configurable: true,
    value: async function isActive(this: CompatibleJob): Promise<boolean> {
      return (await this.getState()) === 'active';
    },
  });
}

if (!Object.getOwnPropertyDescriptor(prototype, 'name')) {
  Object.defineProperty(prototype, 'name', {
    configurable: true,
    get(this: CompatibleJob): string {
      return this.data?.kind || '';
    },
  });
}
