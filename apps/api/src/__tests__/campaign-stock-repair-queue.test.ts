import path from 'path';
import { readFileSync } from 'fs';

describe('campaign stock-first repair state machine', () => {
  it('routes repairable synchronous material rejection into the governed repair queue', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../services/campaign-production.service.ts'),
      'utf8'
    );

    expect(source).toContain("'MATERIAL_VISUAL_QA_REJECTED'");
    expect(source).toContain("'MATERIAL_INGREDIENT_TECHNICAL_QA_FAILED'");
    expect(source).toContain('if (isRepairableCampaignMaterialError(error))');
    expect(source).toContain('const replacementGenerationId = await queueCampaignMaterialRepair({');
    expect(source).toContain('runId: String(run.id)');
    expect(source).toContain('organizationId: orgId');
    expect(source).toContain('if (replacementGenerationId) continue;');
  });

  it('keeps repair queue failure fail-closed instead of making content reviewable', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../services/campaign-production.service.ts'),
      'utf8'
    );

    expect(source).toContain("material_status='failed_after_bounded_retries'");
    expect(source).toContain("resolution_status='failed_after_bounded_retries'");
    expect(source).not.toContain("material_status='ready_for_review'\n                      resolution_status='failed_after_bounded_retries'");
  });
});
