declare module 'bullmq' {
  export class Queue {
    constructor(name: string, opts?: any);
    add(name: string, data: any, opts?: any): Promise<Job>;
    getJob(jobId: string): Promise<Job | undefined>;
    getJobCounts(...types: string[]): Promise<Record<string, number>>;
    close(): Promise<void>;
  }

  export class Worker {
    constructor(name: string, processor: any, opts?: any);
    on(event: string, callback: (...args: any[]) => void): void;
    close(): Promise<void>;
  }

  export class Job {
    id: string | undefined;
    data: any;
    progress: number | object;
    returnvalue: any;
    failedReason: string | undefined;
    getState(): Promise<string>;
    remove(): Promise<void>;
  }
}
