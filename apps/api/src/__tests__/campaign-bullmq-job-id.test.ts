import path from 'path';
import { readFileSync } from 'fs';

describe('campaign BullMQ custom job ID contract', () => {
  it('uses a deterministic colon-free campaign-text job ID', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../services/campaign-production.service.ts'),
      'utf8'
    );

    expect(source).toContain('jobId: `campaign-text-${run.id}-attempt-${attempt}`');
    expect(source).not.toContain('jobId: `campaign-text:${run.id}:attempt:${attempt}`');
  });
});
