import { Job } from 'bullmq';

declare module 'bullmq' {
  interface Job {
    isActive(): Promise<boolean>;
  }
}

type CompatibleJob = Job & {
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

// Do not polyfill Job.prototype.name. Modern BullMQ owns the Job name
// lifecycle and may assign it during construction/hydration. A getter-only
// compatibility property on the prototype makes those assignments throw at
// runtime ("Cannot set property name ... which has only a getter").
