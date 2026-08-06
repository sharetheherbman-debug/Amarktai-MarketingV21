import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface PriceConfig {
  slug: string;
  monthly: string;
  yearly: string;
}

function configuredPrices(): PriceConfig[] {
  return [
    { slug: 'starter', monthly: env.STRIPE_PRICE_STARTER_MONTHLY_ID, yearly: env.STRIPE_PRICE_STARTER_YEARLY_ID },
    { slug: 'professional', monthly: env.STRIPE_PRICE_PROFESSIONAL_MONTHLY_ID, yearly: env.STRIPE_PRICE_PROFESSIONAL_YEARLY_ID },
    { slug: 'enterprise', monthly: env.STRIPE_PRICE_ENTERPRISE_MONTHLY_ID, yearly: env.STRIPE_PRICE_ENTERPRISE_YEARLY_ID },
  ];
}

export async function syncAndValidateBillingConfiguration(): Promise<void> {
  for (const config of configuredPrices()) {
    if (!config.monthly && !config.yearly) continue;
    await query(
      `UPDATE billing_plans SET
         stripe_price_monthly_id=COALESCE(NULLIF($1,''),stripe_price_monthly_id),
         stripe_price_yearly_id=COALESCE(NULLIF($2,''),stripe_price_yearly_id),
         updated_at=NOW()
       WHERE slug=$3`,
      [config.monthly, config.yearly, config.slug]
    );
  }

  const paidPlans = await query(
    `SELECT slug,name,price_monthly_cents,price_yearly_cents,
            stripe_price_monthly_id,stripe_price_yearly_id
     FROM billing_plans
     WHERE is_active=TRUE AND is_public=TRUE
       AND (price_monthly_cents>0 OR price_yearly_cents>0)
     ORDER BY sort_order`
  );
  if (paidPlans.rows.length === 0) return;

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'Paid billing plans are enabled but Stripe credentials are missing', 'STRIPE_BILLING_REQUIRED');
  }

  const incomplete = paidPlans.rows.filter((plan) =>
    (Number(plan.price_monthly_cents || 0) > 0 && !plan.stripe_price_monthly_id) ||
    (Number(plan.price_yearly_cents || 0) > 0 && !plan.stripe_price_yearly_id)
  );
  if (incomplete.length > 0) {
    throw new AppError(
      503,
      `Paid billing plans are missing Stripe Price IDs: ${incomplete.map((plan) => String(plan.slug)).join(', ')}`,
      'STRIPE_PRICE_REQUIRED'
    );
  }

  logger.info(`Stripe billing configuration validated for ${paidPlans.rows.length} paid plan(s)`);
}
