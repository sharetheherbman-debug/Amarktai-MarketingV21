import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';

// Types
export interface MarketplacePublisher {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  email: string | null;
  logo: string | null;
  verified: boolean;
  status: string;
  total_downloads: number;
  total_items: number;
  created_at: string;
}

export interface MarketplaceItem {
  id: string;
  publisher_id: string;
  publisher_name?: string;
  name: string;
  slug: string;
  description: string | null;
  long_description: string | null;
  category: string;
  subcategory: string | null;
  icon: string | null;
  screenshots: string[];
  version: string;
  version_history: unknown[];
  dependencies: unknown[];
  compatibility: Record<string, unknown>;
  config_schema: Record<string, unknown>;
  license: string;
  price_cents: number;
  is_free: boolean;
  download_count: number;
  install_count: number;
  rating_average: number;
  rating_count: number;
  tags: string[];
  status: string;
  published_at: string | null;
  created_at: string;
}

export interface MarketplaceInstallation {
  id: string;
  organization_id: string;
  item_id: string;
  item_name?: string;
  installed_version: string;
  config: Record<string, unknown>;
  status: string;
  health_status: string;
  installed_at: string;
}

export interface MarketplaceReview {
  id: string;
  item_id: string;
  user_id: string;
  user_name?: string;
  rating: number;
  title: string | null;
  comment: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  created_at: string;
}

export interface SkillPack {
  id: string;
  marketplace_item_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  capabilities: string[];
  agents: unknown[];
  prompts: unknown[];
  workflows: unknown[];
  tools: unknown[];
  version: string;
  install_count: number;
  rating_average: number;
  is_active: boolean;
  created_at: string;
}

// ─── Publishers ──────────────────────────────────────────────────────────────

export async function createPublisher(userId: string, data: { name: string; slug: string; description?: string; website?: string; email?: string }): Promise<MarketplacePublisher> {
  const result = await query(
    `INSERT INTO marketplace_publishers (user_id, name, slug, description, website, email)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, data.name, data.slug, data.description || null, data.website || null, data.email || null]
  );
  logger.info(`Publisher created: ${data.slug}`);
  return mapPublisherRow(result.rows[0]);
}

export async function getPublisherBySlug(slug: string): Promise<MarketplacePublisher> {
  const result = await query('SELECT * FROM marketplace_publishers WHERE slug = $1', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Publisher');
  return mapPublisherRow(result.rows[0]);
}

export async function listPublishers(): Promise<MarketplacePublisher[]> {
  const result = await query('SELECT * FROM marketplace_publishers WHERE status = $1 ORDER BY verified DESC, name', ['active']);
  return result.rows.map(mapPublisherRow);
}

// ─── Marketplace Items ───────────────────────────────────────────────────────

export async function listItems(filters?: { category?: string; search?: string; status?: string; sort?: string }): Promise<MarketplaceItem[]> {
  let sql = `SELECT mi.*, mp.name as publisher_name
             FROM marketplace_items mi
             JOIN marketplace_publishers mp ON mi.publisher_id = mp.id
             WHERE mi.deleted_at IS NULL`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.category) {
    sql += ` AND mi.category = $${idx++}`;
    params.push(filters.category);
  }
  if (filters?.search) {
    sql += ` AND (mi.name ILIKE $${idx} OR mi.description ILIKE $${idx} OR mi.tags::text ILIKE $${idx})`;
    params.push(`%${filters.search}%`);
    idx++;
  }
  if (filters?.status) {
    sql += ` AND mi.status = $${idx++}`;
    params.push(filters.status);
  } else {
    sql += ` AND mi.status = 'published'`;
  }

  switch (filters?.sort) {
    case 'popular': sql += ' ORDER BY mi.install_count DESC'; break;
    case 'rating': sql += ' ORDER BY mi.rating_average DESC'; break;
    case 'newest': sql += ' ORDER BY mi.published_at DESC'; break;
    default: sql += ' ORDER BY mi.install_count DESC';
  }

  const result = await query(sql, params);
  return result.rows.map(mapItemRow);
}

export async function getItemById(id: string): Promise<MarketplaceItem> {
  const result = await query(
    `SELECT mi.*, mp.name as publisher_name
     FROM marketplace_items mi
     JOIN marketplace_publishers mp ON mi.publisher_id = mp.id
     WHERE mi.id = $1 AND mi.deleted_at IS NULL`,
    [id]
  );
  if (result.rows.length === 0) throw new NotFoundError('Marketplace item');
  return mapItemRow(result.rows[0]);
}

export async function getItemBySlug(publisherSlug: string, itemSlug: string): Promise<MarketplaceItem> {
  const result = await query(
    `SELECT mi.*, mp.name as publisher_name
     FROM marketplace_items mi
     JOIN marketplace_publishers mp ON mi.publisher_id = mp.id
     JOIN marketplace_publishers mp2 ON mp2.slug = $1
     WHERE mi.slug = $2 AND mi.publisher_id = mp2.id AND mi.deleted_at IS NULL`,
    [publisherSlug, itemSlug]
  );
  if (result.rows.length === 0) throw new NotFoundError('Marketplace item');
  return mapItemRow(result.rows[0]);
}

export async function createItem(publisherId: string, data: {
  name: string;
  slug: string;
  description?: string;
  long_description?: string;
  category: string;
  subcategory?: string;
  version?: string;
  dependencies?: unknown[];
  config_schema?: Record<string, unknown>;
  license?: string;
  price_cents?: number;
  tags?: string[];
}): Promise<MarketplaceItem> {
  const result = await query(
    `INSERT INTO marketplace_items (publisher_id, name, slug, description, long_description, category, subcategory, version, dependencies, config_schema, license, price_cents, is_free, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [
      publisherId, data.name, data.slug, data.description || null, data.long_description || null,
      data.category, data.subcategory || null, data.version || '1.0.0',
      JSON.stringify(data.dependencies || []), JSON.stringify(data.config_schema || {}),
      data.license || 'MIT', data.price_cents || 0, (data.price_cents || 0) === 0,
      JSON.stringify(data.tags || [])
    ]
  );
  logger.info(`Marketplace item created: ${data.slug}`);
  return mapItemRow(result.rows[0]);
}

export async function updateItem(id: string, publisherId: string, data: Partial<{
  name: string;
  description: string;
  long_description: string;
  version: string;
  status: string;
  tags: string[];
  config_schema: Record<string, unknown>;
}>): Promise<MarketplaceItem> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.long_description !== undefined) { updates.push(`long_description = $${idx++}`); values.push(data.long_description); }
  if (data.version !== undefined) { updates.push(`version = $${idx++}`); values.push(data.version); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); values.push(data.status); }
  if (data.tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(JSON.stringify(data.tags)); }
  if (data.config_schema !== undefined) { updates.push(`config_schema = $${idx++}`); values.push(JSON.stringify(data.config_schema)); }

  if (updates.length === 0) return getItemById(id);

  updates.push('updated_at = NOW()');
  values.push(id, publisherId);

  const result = await query(
    `UPDATE marketplace_items SET ${updates.join(', ')} WHERE id = $${idx} AND publisher_id = $${idx + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Marketplace item');
  return mapItemRow(result.rows[0]);
}

export async function deleteItem(id: string, publisherId: string): Promise<void> {
  await query('UPDATE marketplace_items SET deleted_at = NOW() WHERE id = $1 AND publisher_id = $2', [id, publisherId]);
}

// ─── Installations ───────────────────────────────────────────────────────────

export async function installItem(orgId: string, itemId: string, userId: string, config?: Record<string, unknown>): Promise<MarketplaceInstallation> {
  const item = await getItemById(itemId);

  // Check if already installed
  const existing = await query(
    'SELECT id FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2',
    [orgId, itemId]
  );
  if (existing.rows.length > 0) {
    throw new AppError(400, 'Item already installed', 'ALREADY_INSTALLED');
  }

  const result = await query(
    `INSERT INTO marketplace_installations (organization_id, item_id, installed_version, config, installed_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, itemId, item.version, JSON.stringify(config || {}), userId]
  );

  // Update install count
  await query('UPDATE marketplace_items SET install_count = install_count + 1 WHERE id = $1', [itemId]);

  logger.info(`Item installed: ${item.name} in org ${orgId}`);
  return mapInstallationRow(result.rows[0]);
}

export async function uninstallItem(orgId: string, itemId: string): Promise<void> {
  const result = await query(
    'DELETE FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2',
    [orgId, itemId]
  );
  if (result.rowCount === 0) throw new NotFoundError('Installation');

  await query('UPDATE marketplace_items SET install_count = GREATEST(install_count - 1, 0) WHERE id = $1', [itemId]);
  logger.info(`Item uninstalled: ${itemId} from org ${orgId}`);
}

export async function listInstallations(orgId: string): Promise<MarketplaceInstallation[]> {
  const result = await query(
    `SELECT mi.*, mkt.name as item_name
     FROM marketplace_installations mi
     JOIN marketplace_items mkt ON mi.item_id = mkt.id
     WHERE mi.organization_id = $1 ORDER BY mi.installed_at DESC`,
    [orgId]
  );
  return result.rows.map(mapInstallationRow);
}

export async function updateInstallation(orgId: string, itemId: string, data: { config?: Record<string, unknown>; status?: string }): Promise<MarketplaceInstallation> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.config !== undefined) { updates.push(`config = $${idx++}`); values.push(JSON.stringify(data.config)); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); values.push(data.status); }

  if (updates.length === 0) {
    const result = await query('SELECT * FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2', [orgId, itemId]);
    if (result.rows.length === 0) throw new NotFoundError('Installation');
    return mapInstallationRow(result.rows[0]);
  }

  updates.push('updated_at = NOW()');
  values.push(orgId, itemId);

  const result = await query(
    `UPDATE marketplace_installations SET ${updates.join(', ')} WHERE organization_id = $${idx} AND item_id = $${idx + 1} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new NotFoundError('Installation');
  return mapInstallationRow(result.rows[0]);
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export async function listReviews(itemId: string): Promise<MarketplaceReview[]> {
  const result = await query(
    `SELECT mr.*, u.name as user_name
     FROM marketplace_reviews mr
     JOIN users u ON mr.user_id = u.id
     WHERE mr.item_id = $1 AND mr.status = 'published'
     ORDER BY mr.created_at DESC`,
    [itemId]
  );
  return result.rows.map(mapReviewRow);
}

export async function createReview(itemId: string, userId: string, data: { rating: number; title?: string; comment?: string }): Promise<MarketplaceReview> {
  const result = await query(
    `INSERT INTO marketplace_reviews (item_id, user_id, rating, title, comment)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [itemId, userId, data.rating, data.title || null, data.comment || null]
  );

  // Update item rating
  const avgResult = await query(
    'SELECT AVG(rating) as avg, COUNT(*) as count FROM marketplace_reviews WHERE item_id = $1 AND status = $2',
    [itemId, 'published']
  );
  await query(
    'UPDATE marketplace_items SET rating_average = $1, rating_count = $2 WHERE id = $3',
    [parseFloat(avgResult.rows[0].avg) || 0, parseInt(avgResult.rows[0].count), itemId]
  );

  return mapReviewRow(result.rows[0]);
}

// ─── Skill Packs ─────────────────────────────────────────────────────────────

export async function listSkillPacks(industry?: string): Promise<SkillPack[]> {
  let sql = 'SELECT * FROM skill_packs WHERE is_active = TRUE';
  const params: unknown[] = [];
  if (industry) { sql += ' AND industry = $1'; params.push(industry); }
  sql += ' ORDER BY install_count DESC';
  const result = await query(sql, params);
  return result.rows.map(mapSkillPackRow);
}

export async function getSkillPackBySlug(slug: string): Promise<SkillPack> {
  const result = await query('SELECT * FROM skill_packs WHERE slug = $1 AND is_active = TRUE', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Skill pack');
  return mapSkillPackRow(result.rows[0]);
}

export async function installSkillPack(orgId: string, packSlug: string, userId: string): Promise<void> {
  const pack = await getSkillPackBySlug(packSlug);

  // Install agents from pack
  if (Array.isArray(pack.agents)) {
    for (const agent of pack.agents) {
      const a = agent as Record<string, unknown>;
      try {
        await query(
          `INSERT INTO agent_definitions (organization_id, name, description, system_prompt, model, capabilities, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [orgId, a.name, a.description || null, a.system_prompt || null, a.model || null, JSON.stringify(a.capabilities || []), JSON.stringify(a.config || {})]
        );
      } catch (e) { logger.warn(`Failed to install agent: ${a.name}`); }
    }
  }

  // Install prompts from pack
  if (Array.isArray(pack.prompts)) {
    for (const prompt of pack.prompts) {
      const p = prompt as Record<string, unknown>;
      try {
        await query(
          `INSERT INTO prompt_library (organization_id, name, slug, category, template, variables, system_prompt)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [orgId, p.name, p.slug || p.name, p.category || pack.slug, p.template, JSON.stringify(p.variables || []), p.system_prompt || null]
        );
      } catch (e) { logger.warn(`Failed to install prompt: ${p.name}`); }
    }
  }

  await query('UPDATE skill_packs SET install_count = install_count + 1 WHERE id = $1', [pack.id]);
  logger.info(`Skill pack installed: ${pack.name} in org ${orgId}`);
}

// ─── Marketplace Admin ───────────────────────────────────────────────────────

export async function listSubmissions(status?: string): Promise<unknown[]> {
  let sql = `SELECT ms.*, mi.name as item_name, mi.category, mp.name as publisher_name
             FROM marketplace_submissions ms
             JOIN marketplace_items mi ON ms.item_id = mi.id
             JOIN marketplace_publishers mp ON ms.publisher_id = mp.id`;
  const params: unknown[] = [];
  if (status) { sql += ' WHERE ms.status = $1'; params.push(status); }
  sql += ' ORDER BY ms.submitted_at DESC';
  const result = await query(sql, params);
  return result.rows;
}

export async function reviewSubmission(submissionId: string, reviewerId: string, decision: string, notes?: string): Promise<void> {
  await query(
    `UPDATE marketplace_submissions SET status = $1, reviewer_id = $2, review_notes = $3, reviewed_at = NOW()
     WHERE id = $4`,
    [decision, reviewerId, notes || null, submissionId]
  );

  const sub = await query('SELECT item_id FROM marketplace_submissions WHERE id = $1', [submissionId]);
  if (sub.rows.length > 0 && decision === 'approved') {
    await query("UPDATE marketplace_items SET status = 'published', published_at = NOW() WHERE id = $1", [sub.rows[0].item_id]);
  }

  logger.info(`Submission ${submissionId} ${decision} by ${reviewerId}`);
}

export async function getMarketplaceStats(): Promise<Record<string, unknown>> {
  const [items, publishers, installs, reviews] = await Promise.all([
    query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'published') as published FROM marketplace_items WHERE deleted_at IS NULL"),
    query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE verified = TRUE) as verified FROM marketplace_publishers"),
    query('SELECT COUNT(*) as total FROM marketplace_installations'),
    query('SELECT COUNT(*) as total, AVG(rating) as avg_rating FROM marketplace_reviews WHERE status = $1', ['published']),
  ]);

  return {
    total_items: parseInt(items.rows[0].total),
    published_items: parseInt(items.rows[0].published),
    total_publishers: parseInt(publishers.rows[0].total),
    verified_publishers: parseInt(publishers.rows[0].verified),
    total_installations: parseInt(installs.rows[0].total),
    total_reviews: parseInt(reviews.rows[0].total),
    average_rating: parseFloat(reviews.rows[0].avg_rating) || 0,
  };
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapPublisherRow(row: Record<string, unknown>): MarketplacePublisher {
  return {
    id: row.id as string, user_id: row.user_id as string,
    organization_id: row.organization_id as string | null,
    name: row.name as string, slug: row.slug as string,
    description: row.description as string | null,
    website: row.website as string | null, email: row.email as string | null,
    logo: row.logo as string | null, verified: row.verified as boolean,
    status: row.status as string,
    total_downloads: parseInt(row.total_downloads as string) || 0,
    total_items: parseInt(row.total_items as string) || 0,
    created_at: row.created_at as string,
  };
}

function mapItemRow(row: Record<string, unknown>): MarketplaceItem {
  return {
    id: row.id as string, publisher_id: row.publisher_id as string,
    publisher_name: row.publisher_name as string | undefined,
    name: row.name as string, slug: row.slug as string,
    description: row.description as string | null,
    long_description: row.long_description as string | null,
    category: row.category as string,
    subcategory: row.subcategory as string | null,
    icon: row.icon as string | null,
    screenshots: typeof row.screenshots === 'string' ? JSON.parse(row.screenshots) : (row.screenshots as string[]) || [],
    version: row.version as string,
    version_history: typeof row.version_history === 'string' ? JSON.parse(row.version_history) : (row.version_history as unknown[]) || [],
    dependencies: typeof row.dependencies === 'string' ? JSON.parse(row.dependencies) : (row.dependencies as unknown[]) || [],
    compatibility: typeof row.compatibility === 'string' ? JSON.parse(row.compatibility) : (row.compatibility as Record<string, unknown>) || {},
    config_schema: typeof row.config_schema === 'string' ? JSON.parse(row.config_schema) : (row.config_schema as Record<string, unknown>) || {},
    license: row.license as string,
    price_cents: parseInt(row.price_cents as string) || 0,
    is_free: row.is_free as boolean,
    download_count: parseInt(row.download_count as string) || 0,
    install_count: parseInt(row.install_count as string) || 0,
    rating_average: parseFloat(row.rating_average as string) || 0,
    rating_count: parseInt(row.rating_count as string) || 0,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags as string[]) || [],
    status: row.status as string,
    published_at: row.published_at as string | null,
    created_at: row.created_at as string,
  };
}

function mapInstallationRow(row: Record<string, unknown>): MarketplaceInstallation {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    item_id: row.item_id as string,
    item_name: row.item_name as string | undefined,
    installed_version: row.installed_version as string,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    status: row.status as string, health_status: row.health_status as string,
    installed_at: row.installed_at as string,
  };
}

function mapReviewRow(row: Record<string, unknown>): MarketplaceReview {
  return {
    id: row.id as string, item_id: row.item_id as string,
    user_id: row.user_id as string,
    user_name: row.user_name as string | undefined,
    rating: parseInt(row.rating as string),
    title: row.title as string | null, comment: row.comment as string | null,
    is_verified_purchase: row.is_verified_purchase as boolean,
    helpful_count: parseInt(row.helpful_count as string) || 0,
    created_at: row.created_at as string,
  };
}

function mapSkillPackRow(row: Record<string, unknown>): SkillPack {
  return {
    id: row.id as string,
    marketplace_item_id: row.marketplace_item_id as string,
    name: row.name as string, slug: row.slug as string,
    description: row.description as string | null,
    industry: row.industry as string | null,
    capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : (row.capabilities as string[]) || [],
    agents: typeof row.agents === 'string' ? JSON.parse(row.agents) : (row.agents as unknown[]) || [],
    prompts: typeof row.prompts === 'string' ? JSON.parse(row.prompts) : (row.prompts as unknown[]) || [],
    workflows: typeof row.workflows === 'string' ? JSON.parse(row.workflows) : (row.workflows as unknown[]) || [],
    tools: typeof row.tools === 'string' ? JSON.parse(row.tools) : (row.tools as unknown[]) || [],
    version: row.version as string,
    install_count: parseInt(row.install_count as string) || 0,
    rating_average: parseFloat(row.rating_average as string) || 0,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
  };
}
