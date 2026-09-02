import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..');
const server = fs.readFileSync(path.resolve(root, 'apps/api/src/server.ts'), 'utf8');
const scheduler = fs.readFileSync(path.resolve(root, 'apps/api/src/services/scheduler.service.ts'), 'utf8');
const pricing = fs.readFileSync(path.resolve(root, 'apps/api/src/services/genx-pricing.service.ts'), 'utf8');
const longformRoute = fs.readFileSync(path.resolve(root, 'apps/api/src/routes/longform-video.ts'), 'utf8');

describe('GenX pricing and render resilience contract', () => {
  test('refreshes pricing at startup and on the normal scheduler', () => {
    expect(server).toContain('await refreshGenXCataloguePricing()');
    expect(server).toContain('generation remains fail-closed');
    expect(scheduler).toContain("'refresh-genx-catalogue-pricing'");
  });

  test('uses single-flight, bounded cooldown and quote-time stale recovery', () => {
    expect(pricing).toContain('if (pricingRefreshInFlight) return pricingRefreshInFlight');
    expect(pricing).toContain('PRICING_REFRESH_FAILURE_COOLDOWN_MS');
    expect(pricing).toContain("'GENX_PRICE_STALE'");
    expect(pricing.match(/await refreshGenXCataloguePricing\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('keeps the canonical render runtime as the only routed implementation', () => {
    expect(longformRoute).toContain("../services/render-runtime.service");
    expect(fs.existsSync(path.resolve(root, 'apps/api/src/services/render-queue.service.ts'))).toBe(false);
  });
});
