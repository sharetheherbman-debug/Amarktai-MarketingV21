import { transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export async function redeemStripeCoupon(orgId: string, code: string): Promise<void> {
  await transaction(async (client) => {
    const result = await client.query(
      `SELECT * FROM billing_coupons
       WHERE UPPER(code)=UPPER($1) AND is_active=TRUE AND valid_from<=NOW()
       FOR UPDATE`,
      [code.trim()]
    );
    if (result.rows.length === 0) throw new NotFoundError('Coupon');
    const coupon = result.rows[0];
    if (!coupon.stripe_promotion_code_id) {
      throw new AppError(409, 'Coupon is not linked to a Stripe promotion code', 'COUPON_NOT_CONFIGURED');
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      throw new AppError(400, 'Coupon has expired', 'COUPON_EXPIRED');
    }
    if (coupon.max_redemptions && Number(coupon.redemption_count) >= Number(coupon.max_redemptions)) {
      throw new AppError(400, 'Coupon redemption limit reached', 'COUPON_LIMIT');
    }
    const inserted = await client.query(
      `INSERT INTO billing_redemptions (organization_id,coupon_id,redeemed_at)
       VALUES ($1,$2,NOW()) ON CONFLICT (organization_id,coupon_id) DO NOTHING RETURNING coupon_id`,
      [orgId, coupon.id]
    );
    if (inserted.rows.length === 0) throw new AppError(400, 'Coupon already redeemed', 'COUPON_REDEEMED');
    await client.query('UPDATE billing_coupons SET redemption_count=redemption_count+1 WHERE id=$1', [coupon.id]);
    logger.info(`Stripe-backed coupon redeemed: ${coupon.code} for org ${orgId}`);
  });
}
