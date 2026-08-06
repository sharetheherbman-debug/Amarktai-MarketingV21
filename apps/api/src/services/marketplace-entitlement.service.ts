import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import * as marketplaceRuntime from './marketplace-runtime.service';

export async function installEntitledItem(
  orgId: string,
  itemId: string,
  userId: string,
  config: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const item = await query(
    `SELECT id, price_cents FROM marketplace_items
     WHERE id = $1 AND status = 'published' AND deleted_at IS NULL`,
    [itemId]
  );
  if (item.rows.length === 0) throw new NotFoundError('Published marketplace item');

  if (Number(item.rows[0].price_cents || 0) > 0) {
    const purchase = await query(
      `SELECT id FROM marketplace_purchases
       WHERE organization_id = $1 AND item_id = $2 AND status = 'paid'
       ORDER BY paid_at DESC LIMIT 1`,
      [orgId, itemId]
    );
    if (purchase.rows.length === 0) {
      throw new AppError(402, 'Purchase this marketplace item before installation', 'MARKETPLACE_PURCHASE_REQUIRED');
    }
    config = { ...config, purchase_id: String(purchase.rows[0].id) };
  }

  return marketplaceRuntime.installItem(orgId, itemId, userId, config);
}

export const uninstallItem = marketplaceRuntime.uninstallItem;
export const listInstallations = marketplaceRuntime.listInstallations;
