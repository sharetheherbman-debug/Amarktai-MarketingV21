import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(apiRoot, '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('pre-deployment runtime regressions', () => {
  test('GenX uses the documented text and asynchronous media contracts', () => {
    const textProvider = read('apps/api/src/providers/genx.provider.ts');
    const mediaProvider = read('apps/api/src/providers/genx-multimodal.provider.ts');

    expect(textProvider).toContain('/v1/chat/completions');
    expect(mediaProvider).toContain('/api/v1/generate');
    expect(mediaProvider).toContain('/api/v1/jobs/${encodeURIComponent(jobId)}');
    expect(mediaProvider).toContain('/api/v1/models${suffix}');
  });

  test('the remote AI router is GenX-only and does not silently fail over', () => {
    const router = read('apps/api/src/providers/provider-router.ts');

    expect(router).toContain("type ProviderType = 'genx'");
    expect(router).toContain("throw new Error('GenX is not available')");
    expect(router).not.toContain('TogetherProvider');
    expect(router).not.toContain('DeepInfraProvider');
    expect(router).not.toContain('failover');
  });

  test('the provider API is read-only and cannot accept credentials', () => {
    const route = read('apps/api/src/routes/providers.ts');
    const page = read('apps/web/app/(dashboard)/admin/providers/page.tsx');

    expect(route).not.toContain('providerService.create');
    expect(route).not.toContain('providerService.update');
    expect(route).not.toContain('providerService.remove');
    expect(route).not.toContain("router.post('/'");
    expect(route).not.toContain("router.put('/:id'");
    expect(route).not.toContain("router.delete('/:id'");
    expect(page).not.toContain('API Key');
    expect(page).not.toContain('Together AI');
    expect(page).not.toContain('DeepInfra');
    expect(page).toContain('Environment-only credentials');
  });

  test('tenant-scoped platform routes are mounted behind membership checks', () => {
    const server = read('apps/api/src/server.ts');
    for (const route of [
      'campaigns', 'content', 'agents', 'prompts', 'brand-dna', 'knowledge',
      'competitors', 'trends', 'content-studio', 'templates', 'calendar', 'seo',
      'campaign-ai', 'amai', 'crm', 'integrations', 'generation-credits',
      'relaunch-control', 'agency', 'template-library',
    ]) {
      expect(server).toContain(`app.use('/api/v1/${route}', ...tenant`);
    }
  });

  test('Stripe webhook is raw-body verified before the JSON parser', () => {
    const server = read('apps/api/src/server.ts');
    const webhookIndex = server.indexOf("app.post('/api/v1/stripe/webhook'");
    const parserIndex = server.indexOf('app.use(express.json');
    expect(webhookIndex).toBeGreaterThan(-1);
    expect(parserIndex).toBeGreaterThan(webhookIndex);
    expect(server).toContain('verifyStripeWebhook');
    expect(server).toContain('processStripeEvent');
  });

  test('billing delegates money movement to Stripe and exposes no local pay endpoint', () => {
    const billingRoute = read('apps/api/src/routes/billing.ts');
    const billingService = read('apps/api/src/services/billing.service.ts');

    expect(billingRoute).not.toContain('markInvoicePaid');
    expect(billingRoute).not.toContain('createPaymentMethod');
    expect(billingRoute).not.toMatch(
      /router\.(?:post|put|patch)\(\s*['"]\/invoices\/:invoiceId\/pay['"]/
    );
    expect(billingRoute).toContain('createSubscriptionCheckout');
    expect(billingRoute).toContain('createBillingPortalSession');
    expect(billingService).not.toContain("status: 'active',\n    billing_cycle");
    expect(billingService).not.toContain('card_number');
  });

  test('GBP Generation Credits use an immutable reserve-and-settle ledger', () => {
    const migration = read('apps/api/src/db/migrations/023_genx_gbp_credit_wallet.sql');
    const service = read('apps/api/src/services/generation-credit.service.ts');

    expect(migration).toContain("currency CHAR(3) NOT NULL DEFAULT 'GBP'");
    expect(migration).toContain('prevent_generation_credit_ledger_mutation');
    expect(migration).toContain('generation_credit_reservations');
    expect(service).toContain('reserveCredits');
    expect(service).toContain('settleReservation');
    expect(service).toContain('releaseReservation');
    expect(service).toContain('GENERATION_CREDITS_INSUFFICIENT');
  });

  test('credit checkout is GBP, one-time and funded only by verified webhooks', () => {
    const checkout = read('apps/api/src/services/generation-credit-stripe.service.ts');
    const webhook = read('apps/api/src/services/stripe-webhook.service.ts');
    const page = read('apps/web/app/(dashboard)/billing/page.tsx');

    expect(checkout).toContain("params.set('mode', 'payment')");
    expect(checkout).toContain("params.set('line_items[0][price_data][currency]', 'gbp')");
    expect(checkout).toContain("paymentStatus !== 'paid'");
    expect(checkout).toContain("currency !== 'GBP'");
    expect(checkout).toContain('stripe-credit-session:${sessionId}');
    expect(webhook).toContain('processGenerationCreditStripeEvent');
    expect(page).toContain('Generation Credits');
    expect(page).toContain("currency: 'GBP'");
  });

  test('GenX models require verified GBP price snapshots before retail use', () => {
    const registry = read('apps/api/src/services/genx-model-registry.service.ts');
    const pricing = read('apps/api/src/services/genx-pricing.service.ts');

    expect(registry).toContain("retail_enabled=TRUE AND pricing_status='priced'");
    expect(pricing).toContain('retailFromWholesale');
    expect(pricing).toContain('GBP_FX_RATE_REQUIRED');
    expect(pricing).toContain('GENX_MODEL_UNPRICED');
    expect(pricing).toContain('GENX_PRICE_STALE');
  });

  test('application connector SSO is signed, replay protected and one-use', () => {
    const migration = read('apps/api/src/db/migrations/026_application_connectors.sql');
    const service = read('apps/api/src/services/application-connector.service.ts');
    const route = read('apps/api/src/routes/application-connectors.ts');
    const server = read('apps/api/src/server.ts');
    const page = read('apps/web/app/connector/sso/page.tsx');

    expect(migration).toContain('application_connector_nonces');
    expect(migration).toContain('application_sso_codes');
    expect(migration).toContain('application_conversion_events');
    expect(service).toContain("createHmac('sha256'");
    expect(service).toContain('timingSafeEqual');
    expect(service).toContain('APPLICATION_REPLAY_DETECTED');
    expect(service).toContain('used_at=NOW()');
    expect(service).toContain("currency must be GBP");
    expect(route).toContain("router.post('/sso/issue'");
    expect(route).toContain("router.post('/sso/redeem'");
    expect(route).toContain("router.post('/events/conversion'");
    expect(server).toContain("app.use('/api/v1/application-connectors'");
    expect(page).toContain('acceptTrustedSession');
  });

  test('Relaunch Control Centre starts stopped and enforces GBP and credit boundaries', () => {
    const migration = read('apps/api/src/db/migrations/027_relaunch_control_centre.sql');
    const service = read('apps/api/src/services/relaunch-control.service.ts');
    const route = read('apps/api/src/routes/relaunch-control.ts');
    const page = read('apps/web/app/(dashboard)/relaunch-control/page.tsx');

    expect(migration).toContain("operating_mode VARCHAR(20) NOT NULL DEFAULT 'manual'");
    expect(migration).toContain('emergency_stop BOOLEAN NOT NULL DEFAULT TRUE');
    expect(migration).toContain('daily_ad_budget_pence');
    expect(migration).toContain('prevent_relaunch_control_audit_mutation');
    expect(service).toContain('Only organization owners and admins');
    expect(service).toContain('Emergency stop is active');
    expect(service).toContain('Per-action Generation Credit limit exceeded');
    expect(route).toContain("router.post('/emergency-stop'");
    expect(route).toContain("router.post('/actions/:id/decision'");
    expect(page).toContain('Relaunch Control Centre');
    expect(page).toContain('Daily advertising budget');
  });

  test('external content ingestion uses the public-network fetch guard', () => {
    for (const service of [
      'apps/api/src/services/knowledge-ingestion.service.ts',
      'apps/api/src/services/competitor.service.ts',
      'apps/api/src/services/trend.service.ts',
      'apps/api/src/services/seo.service.ts',
    ]) {
      expect(read(service)).toContain("from '../utils/safe-fetch'");
      expect(read(service)).toContain('safeFetch(');
    }
    const guard = read('apps/api/src/utils/safe-fetch.ts');
    expect(guard).toContain('lookup(hostname');
    expect(guard).toContain('Private network URLs are not allowed');
    expect(guard).toContain("redirect: 'manual'");
  });

  test('white-label domain verification uses DNS evidence', () => {
    const service = read('apps/api/src/services/white-label.service.ts');
    expect(service).toContain('resolveTxt');
    expect(service).toContain('resolveCname');
    expect(service).toContain('DOMAIN_VERIFICATION_PENDING');
    expect(service).not.toContain("verification_status = 'verified' WHERE id = $1");
  });

  test('clean-install repair, GBP wallet, pricing, connector and control migrations are present', () => {
    for (const migration of [
      '018_external_integration_schema_alignment.sql',
      '020_provider_runtime_integrity.sql',
      '021_research_runtime_alignment.sql',
      '022_stripe_billing_runtime.sql',
      '023_genx_gbp_credit_wallet.sql',
      '024_genx_retail_pricing_status.sql',
      '025_gbp_billing_policy.sql',
      '026_application_connectors.sql',
      '027_relaunch_control_centre.sql',
    ]) {
      expect(fs.existsSync(path.resolve(repositoryRoot, 'apps/api/src/db/migrations', migration))).toBe(true);
    }
  });
});
