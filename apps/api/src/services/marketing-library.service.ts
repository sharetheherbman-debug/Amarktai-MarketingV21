import crypto from 'crypto';
import { query, transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import {
  buildEquiprofileStarterPackItems,
  EQUIPROFILE_STARTER_PACK,
  type LibraryItemKind,
  type StarterPackItem,
} from '../library/equiprofile-starter-pack';

const ITEM_KINDS = new Set<LibraryItemKind>([
  'copy_template','social_post_template','social_ad_template','image_ad_layout','carousel_layout',
  'story_layout','reel_layout','promotional_graphic_layout','website_banner_layout','email_template',
  'landing_page_template','article_template','offer_template','retargeting_template','video_recipe',
  'campaign_pack','stock_photo_reference','stock_video_reference','uploaded_asset','generated_asset','brand_asset',
]);

function object(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export function assertLibraryItemKind(value: unknown): LibraryItemKind {
  const kind = String(value || '') as LibraryItemKind;
  if (!ITEM_KINDS.has(kind)) throw new AppError(400, 'Unknown Marketing Library item type', 'LIBRARY_ITEM_KIND_UNSUPPORTED');
  return kind;
}

export async function ensureEquiprofileStarterPack(): Promise<string> {
  const pack = await query(
    `INSERT INTO library_packs (slug,version,name,description,status,is_system,metadata)
     VALUES ($1,$2,$3,$4,'active',TRUE,$5)
     ON CONFLICT (slug,version) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
       metadata=EXCLUDED.metadata,updated_at=NOW() RETURNING id`,
    [EQUIPROFILE_STARTER_PACK.slug, EQUIPROFILE_STARTER_PACK.version, EQUIPROFILE_STARTER_PACK.name,
      EQUIPROFILE_STARTER_PACK.description, JSON.stringify({ tenant_family: 'equiprofile', automatic_install: true })]
  );
  const packId = String(pack.rows[0].id);
  for (const item of buildEquiprofileStarterPackItems()) {
    await query(
      `INSERT INTO library_pack_items
         (pack_id,item_key,kind,category,name,description,tags,platforms,channel,aspect_ratio,dimensions,definition,source_kind,is_editable,is_brandable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pack',TRUE,TRUE)
       ON CONFLICT (pack_id,item_key) DO UPDATE SET kind=EXCLUDED.kind,category=EXCLUDED.category,name=EXCLUDED.name,
         description=EXCLUDED.description,tags=EXCLUDED.tags,platforms=EXCLUDED.platforms,channel=EXCLUDED.channel,
         aspect_ratio=EXCLUDED.aspect_ratio,dimensions=EXCLUDED.dimensions,definition=EXCLUDED.definition,updated_at=NOW()`,
      [packId,item.itemKey,item.kind,item.category,item.name,item.description,JSON.stringify(item.tags),
        JSON.stringify(item.platforms),item.channel || null,item.aspectRatio || null,item.dimensions || null,JSON.stringify(item.definition)]
    );
  }
  return packId;
}

export async function isEquiprofileOrganization(organizationId: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM application_connectors
      WHERE default_organization_id=$1 AND active=TRUE AND lower(application_id)='equiprofile' LIMIT 1`,
    [organizationId]
  );
  return result.rows.length > 0;
}

export async function installPack(organizationId: string, packId: string, userId: string): Promise<{ installed: number; version: number }> {
  const pack = await query(`SELECT * FROM library_packs WHERE id=$1 AND status='active'`, [packId]);
  if (!pack.rows[0]) throw new NotFoundError('Library pack');
  if(String(pack.rows[0].slug)===EQUIPROFILE_STARTER_PACK.slug&&!await isEquiprofileOrganization(organizationId)) {
    throw new AppError(403,'The EquiProfile starter pack is restricted to its connected EquiProfile tenant','LIBRARY_PACK_TENANT_FAMILY_MISMATCH');
  }
  if (pack.rows[0].organization_id && String(pack.rows[0].organization_id) !== organizationId) {
    throw new AppError(403, 'This pack belongs to another tenant', 'LIBRARY_PACK_FORBIDDEN');
  }
  const version = Number(pack.rows[0].version);
  const result = await transaction(async (client) => {
    await client.query(
      `INSERT INTO tenant_library_pack_installs (organization_id,pack_id,installed_version,status,installed_by)
       VALUES ($1,$2,$3,'active',$4)
       ON CONFLICT (organization_id,pack_id) DO UPDATE SET installed_version=EXCLUDED.installed_version,
         status='active',installed_by=EXCLUDED.installed_by,updated_at=NOW()`,
      [organizationId,packId,version,userId]
    );
    const inserted = await client.query(
      `INSERT INTO marketing_library_items
         (organization_id,pack_id,pack_item_id,item_key,kind,category,name,description,tags,platforms,
          channel,aspect_ratio,dimensions,definition,preview,source_kind,approval_status,is_editable,is_brandable,version,created_by)
       SELECT $1,item.pack_id,item.id,'pack:' || pack.slug || ':' || item.item_key,item.kind,item.category,item.name,
          item.description,item.tags,item.platforms,item.channel,item.aspect_ratio,item.dimensions,
          item.definition || jsonb_build_object('_pack_source_version',pack.version),'{}'::jsonb,'pack','approved',
          item.is_editable,item.is_brandable,pack.version,$3
       FROM library_pack_items item JOIN library_packs pack ON pack.id=item.pack_id WHERE item.pack_id=$2
       ON CONFLICT (organization_id,item_key) DO UPDATE SET
         pack_id=EXCLUDED.pack_id,pack_item_id=EXCLUDED.pack_item_id,
         name=CASE WHEN COALESCE(marketing_library_items.performance_metadata->>'owner_modified','false')='true' THEN marketing_library_items.name ELSE EXCLUDED.name END,
         description=CASE WHEN COALESCE(marketing_library_items.performance_metadata->>'owner_modified','false')='true' THEN marketing_library_items.description ELSE EXCLUDED.description END,
         definition=CASE WHEN COALESCE(marketing_library_items.performance_metadata->>'owner_modified','false')='true' THEN marketing_library_items.definition ELSE EXCLUDED.definition END,
         version=GREATEST(marketing_library_items.version,EXCLUDED.version),deleted_at=NULL,updated_at=NOW()
       RETURNING id`,
      [organizationId,packId,userId]
    );
    return inserted.rowCount || 0;
  });
  return { installed: result, version };
}

export async function ensureTenantLibrary(organizationId: string, userId: string): Promise<void> {
  const packId = await ensureEquiprofileStarterPack();
  if (await isEquiprofileOrganization(organizationId)) await installPack(organizationId, packId, userId);
}

export async function uninstallPack(organizationId: string, packId: string): Promise<void> {
  await transaction(async (client) => {
    const install = await client.query('SELECT id FROM tenant_library_pack_installs WHERE organization_id=$1 AND pack_id=$2', [organizationId,packId]);
    if (!install.rows[0]) throw new NotFoundError('Installed library pack');
    await client.query("UPDATE tenant_library_pack_installs SET status='uninstalled',updated_at=NOW() WHERE organization_id=$1 AND pack_id=$2", [organizationId,packId]);
    await client.query('UPDATE marketing_library_items SET deleted_at=NOW(),updated_at=NOW() WHERE organization_id=$1 AND pack_id=$2', [organizationId,packId]);
  });
}

export type LibraryFilters = {
  search?: string; kind?: string; category?: string; platform?: string; source?: string;
  approval?: string; favourite?: boolean; limit?: number; offset?: number;
};

export async function listItems(organizationId: string, filters: LibraryFilters = {}) {
  const clauses = ['item.organization_id=$1', 'item.deleted_at IS NULL'];
  const values: unknown[] = [organizationId];
  const add = (column: string, value: unknown) => {
    values.push(value);
    clauses.push(`${column}=$${values.length}`);
  };
  if (filters.search) {
    values.push(`%${filters.search}%`);
    const placeholder = `$${values.length}`;
    clauses.push(`(item.name ILIKE ${placeholder} OR item.description ILIKE ${placeholder} OR item.tags::text ILIKE ${placeholder})`);
  }
  if (filters.kind) add('item.kind', assertLibraryItemKind(filters.kind));
  if (filters.category) add('item.category', filters.category);
  if (filters.platform) {
    values.push(filters.platform);
    clauses.push(`item.platforms ? $${values.length}`);
  }
  if (filters.source) add('item.source_kind', filters.source);
  if (filters.approval) add('item.approval_status', filters.approval);
  if (filters.favourite !== undefined) add('item.is_favourite', filters.favourite);
  const limit = Math.max(1, Math.min(Number(filters.limit || 100), 500));
  const offset = Math.max(0, Number(filters.offset || 0));
  values.push(limit,offset);
  return (await query(
    `SELECT item.*, provenance.provider,provenance.provider_asset_id,provenance.provider_page_url,
            provenance.creator_name,provenance.creator_url,provenance.license_identifier,provenance.license_url,
            provenance.commercial_use_allowed,provenance.derivatives_allowed,provenance.attribution_required,provenance.attribution_text
       FROM marketing_library_items item
       LEFT JOIN asset_provenance_ledger provenance ON provenance.id=item.provenance_id AND provenance.organization_id=item.organization_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY item.is_favourite DESC,item.usage_count DESC,item.updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  )).rows;
}

export async function getItem(organizationId: string, itemId: string) {
  const result = await query(
    `SELECT item.*,provenance.provider,provenance.provider_asset_id,provenance.provider_page_url,
            provenance.creator_name,provenance.creator_url,provenance.license_identifier,provenance.license_url,
            provenance.commercial_use_allowed,provenance.derivatives_allowed,provenance.attribution_required,provenance.attribution_text
       FROM marketing_library_items item LEFT JOIN asset_provenance_ledger provenance
         ON provenance.id=item.provenance_id AND provenance.organization_id=item.organization_id
      WHERE item.id=$1 AND item.organization_id=$2 AND item.deleted_at IS NULL`,
    [itemId,organizationId]
  );
  if (!result.rows[0]) throw new NotFoundError('Marketing Library item');
  return result.rows[0];
}

export async function createItem(organizationId: string, userId: string, data: Record<string, any>) {
  const kind = assertLibraryItemKind(data.kind);
  const key = String(data.item_key || `tenant:${crypto.randomUUID()}`).slice(0,255);
  const result = await query(
    `INSERT INTO marketing_library_items
       (organization_id,item_key,kind,category,name,description,tags,platforms,channel,aspect_ratio,dimensions,
        definition,preview,source_kind,approval_status,is_editable,is_brandable,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,$16,$17) RETURNING *`,
    [organizationId,key,kind,String(data.category || 'custom'),String(data.name || 'Untitled library item').slice(0,255),
      data.description || null,JSON.stringify(array(data.tags)),JSON.stringify(array(data.platforms)),data.channel || null,
      data.aspect_ratio || null,data.dimensions || null,JSON.stringify(object(data.definition)),JSON.stringify(object(data.preview)),
      String(data.source_kind || 'owner_upload'),String(data.approval_status || 'pending_owner_review'),data.is_brandable !== false,userId]
  );
  return result.rows[0];
}

export async function updateItem(organizationId: string, itemId: string, data: Record<string, any>) {
  const existing = await getItem(organizationId,itemId);
  if (data.kind !== undefined) assertLibraryItemKind(data.kind);
  const merged = {
    name: data.name ?? existing.name, description: data.description ?? existing.description,
    category: data.category ?? existing.category, kind: data.kind ?? existing.kind,
    tags: data.tags ?? existing.tags, platforms: data.platforms ?? existing.platforms,
    channel: data.channel ?? existing.channel, aspect_ratio: data.aspect_ratio ?? existing.aspect_ratio,
    dimensions: data.dimensions ?? existing.dimensions, definition: data.definition ?? existing.definition,
    preview: data.preview ?? existing.preview, approval_status: data.approval_status ?? existing.approval_status,
    is_favourite: data.is_favourite ?? existing.is_favourite,
  };
  return (await query(
    `UPDATE marketing_library_items SET name=$1,description=$2,category=$3,kind=$4,tags=$5,platforms=$6,
       channel=$7,aspect_ratio=$8,dimensions=$9,definition=$10,preview=$11,approval_status=$12,is_favourite=$13,
       performance_metadata=COALESCE(performance_metadata,'{}'::jsonb) || '{"owner_modified":true}'::jsonb,
       version=version+1,updated_at=NOW() WHERE id=$14 AND organization_id=$15 RETURNING *`,
    [merged.name,merged.description,merged.category,merged.kind,JSON.stringify(array(merged.tags)),JSON.stringify(array(merged.platforms)),
      merged.channel,merged.aspect_ratio,merged.dimensions,JSON.stringify(object(merged.definition)),JSON.stringify(object(merged.preview)),
      merged.approval_status,merged.is_favourite,itemId,organizationId]
  )).rows[0];
}

export async function duplicateItem(organizationId: string, itemId: string, userId: string) {
  const original = await getItem(organizationId,itemId);
  return createItem(organizationId,userId,{ ...original,item_key:`tenant:${crypto.randomUUID()}`,name:`${original.name} (Copy)`,source_kind:'owner_upload',approval_status:'draft' });
}

export async function archiveItem(organizationId: string, itemId: string): Promise<void> {
  const result = await query("UPDATE marketing_library_items SET approval_status='archived',deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING id", [itemId,organizationId]);
  if (!result.rows[0]) throw new NotFoundError('Marketing Library item');
}

export async function createPack(organizationId: string, userId: string, data: Record<string, any>) {
  const slug = String(data.slug || `${organizationId}-${crypto.randomUUID()}`).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,180);
  return (await query(
    `INSERT INTO library_packs (organization_id,slug,version,name,description,status,is_system,metadata,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,$8) RETURNING *`,
    [organizationId,slug,Math.max(1,Number(data.version || 1)),String(data.name || 'Tenant Library Pack'),data.description || null,
      String(data.status || 'draft'),JSON.stringify(object(data.metadata)),userId]
  )).rows[0];
}

export async function listPacks(organizationId: string) {
  await ensureEquiprofileStarterPack();
  const equiprofile=await isEquiprofileOrganization(organizationId);
  return (await query(
    `SELECT pack.*,install.status AS install_status,install.installed_version,
       (SELECT COUNT(*)::int FROM library_pack_items item WHERE item.pack_id=pack.id) AS item_count
     FROM library_packs pack LEFT JOIN tenant_library_pack_installs install
       ON install.pack_id=pack.id AND install.organization_id=$1
     WHERE pack.organization_id=$1 OR (pack.is_system=TRUE AND ($2::boolean=TRUE OR COALESCE(pack.metadata->>'tenant_family','')<>'equiprofile'))
     ORDER BY pack.is_system DESC,pack.name,pack.version DESC`, [organizationId,equiprofile]
  )).rows;
}

export async function addPackItem(organizationId: string, packId: string, data: StarterPackItem) {
  const pack = await query('SELECT id FROM library_packs WHERE id=$1 AND organization_id=$2', [packId,organizationId]);
  if (!pack.rows[0]) throw new AppError(403,'Only tenant-owned packs may be edited','LIBRARY_PACK_FORBIDDEN');
  const kind = assertLibraryItemKind(data.kind);
  return (await query(
    `INSERT INTO library_pack_items (pack_id,item_key,kind,category,name,description,tags,platforms,channel,aspect_ratio,dimensions,definition)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (pack_id,item_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
       tags=EXCLUDED.tags,platforms=EXCLUDED.platforms,definition=EXCLUDED.definition,updated_at=NOW() RETURNING *`,
    [packId,data.itemKey,kind,data.category,data.name,data.description,JSON.stringify(data.tags || []),JSON.stringify(data.platforms || []),
      data.channel || null,data.aspectRatio || null,data.dimensions || null,JSON.stringify(data.definition || {})]
  )).rows[0];
}

export async function exportPack(organizationId:string,packId:string){
  const pack=await query('SELECT * FROM library_packs WHERE id=$1 AND (organization_id=$2 OR is_system=TRUE)',[packId,organizationId]);
  if(!pack.rows[0]) throw new NotFoundError('Library pack');
  const items=await query('SELECT item_key,kind,category,name,description,tags,platforms,channel,aspect_ratio,dimensions,definition FROM library_pack_items WHERE pack_id=$1 ORDER BY item_key',[packId]);
  return {schema:'marketing_library_pack_v1',pack:{slug:pack.rows[0].slug,version:pack.rows[0].version,name:pack.rows[0].name,description:pack.rows[0].description,metadata:pack.rows[0].metadata},items:items.rows};
}

export async function importPack(organizationId:string,userId:string,payload:Record<string,any>){
  if(payload.schema!=='marketing_library_pack_v1'||!payload.pack||!Array.isArray(payload.items)) throw new AppError(400,'Unsupported structured library pack','LIBRARY_PACK_IMPORT_INVALID');
  if(payload.items.length>1000) throw new AppError(413,'Library pack exceeds the 1,000 item import limit','LIBRARY_PACK_IMPORT_TOO_LARGE');
  const pack=await createPack(organizationId,userId,{...payload.pack,slug:`${String(payload.pack.slug||'imported')}-${crypto.randomUUID().slice(0,8)}`,status:'draft',metadata:{...object(payload.pack.metadata),imported:true}});
  for(const raw of payload.items){
    await addPackItem(organizationId,pack.id,{itemKey:String(raw.item_key||raw.itemKey||crypto.randomUUID()),kind:assertLibraryItemKind(raw.kind),category:String(raw.category||'imported'),name:String(raw.name||'Imported item'),description:String(raw.description||''),tags:array(raw.tags).map(String),platforms:array(raw.platforms).map(String),channel:raw.channel?String(raw.channel):undefined,aspectRatio:raw.aspect_ratio?String(raw.aspect_ratio):undefined,dimensions:raw.dimensions?String(raw.dimensions):undefined,definition:object(raw.definition)});
  }
  return pack;
}

export async function duplicatePack(organizationId:string,userId:string,packId:string){
  const exported=await exportPack(organizationId,packId);
  exported.pack={...exported.pack,name:`${exported.pack.name} (Copy)`,slug:`${exported.pack.slug}-copy`};
  return importPack(organizationId,userId,exported);
}

export async function setPackStatus(organizationId:string,packId:string,status:'draft'|'active'|'inactive'|'archived'){
  const result=await query('UPDATE library_packs SET status=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3 AND is_system=FALSE RETURNING *',[status,packId,organizationId]);
  if(!result.rows[0]) throw new AppError(403,'Only tenant-owned packs may be changed','LIBRARY_PACK_FORBIDDEN');
  return result.rows[0];
}

export async function importLegacyContentTemplates(organizationId: string, userId: string): Promise<number> {
  const templates = await query('SELECT * FROM content_templates WHERE organization_id=$1 AND deleted_at IS NULL', [organizationId]);
  let imported = 0;
  for (const template of templates.rows) {
    const kind: LibraryItemKind = String(template.type) === 'email' ? 'email_template'
      : String(template.type) === 'landing_page' ? 'landing_page_template'
        : String(template.type) === 'social' ? 'social_post_template' : 'copy_template';
    const result = await query(
      `INSERT INTO marketing_library_items
        (organization_id,item_key,kind,category,name,description,tags,platforms,channel,definition,source_kind,approval_status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'["legacy"]'::jsonb,$7,$8,$9,'legacy_template','approved',$10)
       ON CONFLICT (organization_id,item_key) DO NOTHING RETURNING id`,
      [organizationId,`legacy:${template.id}`,kind,template.category,template.name,template.description,
        JSON.stringify(template.platform ? [template.platform] : []),template.platform || null,
        JSON.stringify({ schema:'legacy_content_template_v1',template_body:template.template_body,variables:template.variables,prompt_template:template.prompt_template }),userId]
    );
    imported += result.rowCount || 0;
  }
  return imported;
}

export async function findReusableItems(organizationId: string, input: { kind?: string; category?: string; tags?: string[]; limit?: number }) {
  const values: unknown[] = [organizationId];
  const clauses = ["organization_id=$1","deleted_at IS NULL","approval_status='approved'","source_kind IN ('owner_upload','first_party','generated','stock_provider','pack')"];
  if (input.kind) { values.push(assertLibraryItemKind(input.kind)); clauses.push(`kind=$${values.length}`); }
  if (input.category) { values.push(input.category); clauses.push(`category=$${values.length}`); }
  if (input.tags?.length) { values.push(input.tags); clauses.push(`tags ?| $${values.length}::text[]`); }
  values.push(Math.max(1,Math.min(Number(input.limit || 10),50)));
  return (await query(
    `SELECT * FROM marketing_library_items WHERE ${clauses.join(' AND ')}
     ORDER BY (performance_metadata->>'fatigue')::numeric NULLS FIRST,
       (performance_metadata->>'quality_score')::numeric DESC NULLS LAST,usage_count DESC,updated_at DESC LIMIT $${values.length}`,
    values
  )).rows;
}

export async function recordUsage(organizationId: string, itemId: string, event: { eventType: string; campaignPlanId?: string; campaignRunId?: string; metrics?: Record<string,unknown> }) {
  const item = await getItem(organizationId,itemId);
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO library_usage_events (organization_id,library_item_id,campaign_plan_id,campaign_asset_run_id,event_type,metrics)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [organizationId,item.id,event.campaignPlanId || null,event.campaignRunId || null,event.eventType,JSON.stringify(event.metrics || {})]
    );
    await client.query('UPDATE marketing_library_items SET usage_count=usage_count+1,last_used_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2', [item.id,organizationId]);
  });
}

export async function summary(organizationId: string, userId: string) {
  await ensureTenantLibrary(organizationId,userId);
  const counts = await query(
    `SELECT kind,COUNT(*)::int AS count FROM marketing_library_items
      WHERE organization_id=$1 AND deleted_at IS NULL GROUP BY kind ORDER BY kind`, [organizationId]
  );
  const total = counts.rows.reduce((sum,row)=>sum+Number(row.count),0);
  return { total, empty: total === 0, tenantStarterInstalled: await isEquiprofileOrganization(organizationId), counts: counts.rows };
}
