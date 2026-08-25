import { APPROVED_MARKETING_SCENE_QUERY } from '../services/marketing-material-compositor.service';

describe('approved Marketing still selection for economical video', () => {
  it('selects only canonical approved final image materials in the current campaign and tenant', () => {
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain("sibling.material_status='ready_for_review'");
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain("sibling.resolution_status='approved'");
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain("content.status='approved'");
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain('content_approvals approval');
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain("approval.status='approved'");
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain('sibling.final_material_asset_id IS NOT NULL');
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain('sibling.campaign_plan_id=$1 AND sibling.organization_id=$2');
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain('asset.organization_id=sibling.organization_id');
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain('asset.deleted_at IS NULL');
    expect(APPROVED_MARKETING_SCENE_QUERY).toContain("asset.mime_type LIKE 'image/%'");
  });

  it('does not use the obsolete material_status approved predicate that excluded canonically approved materials', () => {
    expect(APPROVED_MARKETING_SCENE_QUERY).not.toContain("sibling.material_status='approved'");
  });
});
