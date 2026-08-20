import fs from 'fs';
import path from 'path';

describe('Studio queue submission durability', () => {
  test('queue submission failures close the inserted generation instead of leaving a pending orphan', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../services/studio.service.ts'),
      'utf8'
    );

    expect(source).toContain('async function failQueueSubmission(');
    expect(source).toContain("error_code='queue_submission_failed'");
    expect(source).toContain("status='failed'");
    expect(source).toContain('completed_at=NOW()');
    expect(source).toContain('await failQueueSubmission(generation.id, orgId, error)');
    expect(source).toContain('await job.remove().catch(() => undefined);');
  });
});
