import fs from 'fs';
import path from 'path';

describe('BullMQ compatibility shim', () => {
  test('never shadows Job.prototype.name', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../config/bullmq-compat.ts'),
      'utf8'
    );

    expect(source).not.toContain("Object.defineProperty(prototype, 'name'");
    expect(source).not.toContain('readonly name: string');
    expect(source).toContain("Object.defineProperty(prototype, 'isActive'");
  });

  test('loading the shim leaves BullMQ own name descriptor unchanged', () => {
    let before: PropertyDescriptor | undefined;
    let after: PropertyDescriptor | undefined;
    let isActive: unknown;

    jest.isolateModules(() => {
      const { Job } = require('bullmq');
      before = Object.getOwnPropertyDescriptor(Job.prototype, 'name');

      require('../config/bullmq-compat');

      after = Object.getOwnPropertyDescriptor(Job.prototype, 'name');
      isActive = Job.prototype.isActive;
    });

    expect(after).toEqual(before);
    expect(typeof isActive).toBe('function');
  });
});
