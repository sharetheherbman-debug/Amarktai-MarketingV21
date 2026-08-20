import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');

describe('Studio generation worker schema contract', () => {
  test('uses canonical Studio columns and derives optional campaign context from options', () => {
    const worker = fs.readFileSync(
      path.join(apiRoot, 'workers/generation-worker.ts'),
      'utf8'
    );
    const migration = fs.readFileSync(
      path.join(apiRoot, 'db/migrations/012_creative_studio.sql'),
      'utf8'
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS studio_generations');
    expect(migration).not.toMatch(/studio_generations[\s\S]*?campaign_id UUID/i);

    expect(worker).toContain('`SELECT user_id, type, model, prompt, options, attempt_count,');
    expect(worker).not.toContain('`SELECT campaign_id, user_id, type, model, prompt, options, attempt_count,');
    expect(worker).toContain("const campaignPlanId = typeof generationOptions.campaign_plan_id === 'string'");
    expect(worker).toContain('campaignId: campaignPlanId,');
    expect(worker).toContain('campaign_plan_id: campaignPlanId,');
  });
});
