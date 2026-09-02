import { query } from '../config/database';
import { getItem, listItems, recordUsage, createItem } from './marketing-library.service';
import { saveStockReference, searchStock, verifyStockSaveToken } from './stock-media.service';

export async function searchLibrary(organizationId:string,input:{search?:string;kind?:string;category?:string;platform?:string;limit?:number}) {
  return listItems(organizationId,{...input,approval:'approved'});
}

export const searchOwnAssets = searchLibrary;
export const findApprovedAssets = searchLibrary;
export const inspectAvailableMaterials = searchLibrary;
export const lookForExistingTemplates = searchLibrary;
export const reviewPreviousCampaignMaterials = searchLibrary;

export async function findReusableStudioAsset(organizationId:string,input:{platform?:string;tags?:string[]}) {
  const values:unknown[]=[organizationId];
  const clauses=["item.organization_id=$1","item.deleted_at IS NULL","item.approval_status='approved'","item.studio_asset_id IS NOT NULL","asset.deleted_at IS NULL"];
  if(input.platform){values.push(input.platform);clauses.push(`item.platforms ? $${values.length}`);}
  if(input.tags?.length){values.push(input.tags);clauses.push(`item.tags ?| $${values.length}::text[]`);}
  return (await query(
    `SELECT item.*,asset.storage_path,asset.mime_type FROM marketing_library_items item
       JOIN studio_assets asset ON asset.id=item.studio_asset_id AND asset.organization_id=item.organization_id
      WHERE ${clauses.join(' AND ')} ORDER BY item.usage_count ASC,item.updated_at DESC LIMIT 1`,values
  )).rows[0] || null;
}

/**
 * Acquires a commercially usable stock ingredient only after the approved
 * tenant library has been searched. The approved campaign itself is the owner
 * authorization for this import; provenance and attribution remain attached.
 * A provider outage or missing optional key simply returns null so the caller
 * can continue to the guarded generation fallback.
 */
export async function findOrImportCampaignStockAsset(
  organizationId:string,
  userId:string,
  input:{query:string;platform?:string;tags?:string[];mediaType?:'photo'|'video'}
) {
  const queryText=String(input.query||'').replace(/\s+/g,' ').trim().slice(0,160);
  if(queryText.length<2) return null;
  try {
    const response=await searchStock({query:queryText,mediaType:input.mediaType||'photo'});
    for(const candidate of response.results.slice(0,4)) {
      try {
        const item=await saveStockReference(organizationId,userId,verifyStockSaveToken(candidate.saveToken));
        if(!item?.studio_asset_id) continue;
        const tags=Array.from(new Set([...(Array.isArray(item.tags)?item.tags:[]),...(input.tags||[]),'campaign-stock']));
        const platforms=Array.from(new Set([...(Array.isArray(item.platforms)?item.platforms:[]),input.platform].filter(Boolean)));
        return (await query(
          `UPDATE marketing_library_items
             SET approval_status='approved',tags=$1,platforms=$2,
                 performance_metadata=COALESCE(performance_metadata,'{}'::jsonb) || $3::jsonb,
                 updated_at=NOW()
           WHERE id=$4 AND organization_id=$5
           RETURNING *`,
          [JSON.stringify(tags),JSON.stringify(platforms),JSON.stringify({campaign_owner_authorized_import:true}),item.id,organizationId]
        )).rows[0] || null;
      } catch {
        // Try the next licensed result without turning an optional stock
        // provider failure into a campaign-wide failure.
      }
    }
  } catch {
    // Optional providers degrade gracefully.
  }
  return null;
}

export async function useLibraryItem(organizationId:string,itemId:string,event:{campaignPlanId?:string;campaignRunId?:string}) {
  await getItem(organizationId,itemId);
  await recordUsage(organizationId,itemId,{eventType:'used',...event});
}

export async function saveFinalMaterialToLibrary(organizationId:string,userId:string,input:{studioAssetId:string;contentId?:string;name:string;description?:string;tags?:string[];platforms?:string[]}) {
  const asset=await query('SELECT id FROM studio_assets WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[input.studioAssetId,organizationId]);
  if(!asset.rows[0]) throw new Error('Final material asset does not belong to this tenant');
  const item=await createItem(organizationId,userId,{kind:'generated_asset',category:'campaign-materials',name:input.name,description:input.description,tags:input.tags,platforms:input.platforms,source_kind:'generated',approval_status:'pending_owner_review',definition:{final_material:true}});
  return (await query('UPDATE marketing_library_items SET studio_asset_id=$1,content_id=$2 WHERE id=$3 AND organization_id=$4 RETURNING *',[input.studioAssetId,input.contentId||null,item.id,organizationId])).rows[0];
}
