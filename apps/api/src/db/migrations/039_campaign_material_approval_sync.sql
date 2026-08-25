-- Keep campaign run review state aligned with the canonical content approval
-- decision. The trigger cannot approve a raw ingredient: only a run already
-- marked ready_for_review with a final persisted material is advanced.

CREATE OR REPLACE FUNCTION sync_campaign_final_material_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE campaign_asset_runs
       SET resolution_status = CASE
             WHEN resolution_status = 'approved_and_scheduled' THEN resolution_status
             ELSE 'approved'
           END,
           updated_at = NOW()
     WHERE organization_id = NEW.organization_id
       AND content_id = NEW.id
       AND material_status = 'ready_for_review'
       AND final_material_asset_id IS NOT NULL;
  ELSIF NEW.status IN ('rejected','changes_requested','draft') THEN
    UPDATE campaign_asset_runs
       SET resolution_status = 'pending_review',
           updated_at = NOW()
     WHERE organization_id = NEW.organization_id
       AND content_id = NEW.id
       AND resolution_status IN ('approved','approved_and_scheduled');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_campaign_final_material_approval ON content_items;
CREATE TRIGGER trg_sync_campaign_final_material_approval
AFTER UPDATE OF status ON content_items
FOR EACH ROW EXECUTE FUNCTION sync_campaign_final_material_approval();
