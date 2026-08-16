import fs from 'fs';
import path from 'path';
import { approvedContentHash } from '../services/approved-content.service';
import { MARKETING_WORKFORCE } from '../services/marketing-workforce.service';
import { getRequestedOrganizationId } from '../middleware/organization-access';
import { validatePublicHttpUrl } from '../utils/safe-fetch';

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

describe('final autonomous growth engine invariants', () => {
  test('bootstraps a complete, uniquely keyed specialist workforce', () => {
    expect(MARKETING_WORKFORCE).toHaveLength(19);
    expect(new Set(MARKETING_WORKFORCE.map((role) => role.key)).size).toBe(19);
    expect(MARKETING_WORKFORCE.some((role) => role.key === 'marketing-director')).toBe(true);
    expect(MARKETING_WORKFORCE.some((role) => role.key === 'governance-officer')).toBe(true);
  });

  test('approval hashes bind every material customer-facing field', () => {
    const base = { id: 'content-1', version: 4, title: 'Title', body: 'Body', type: 'email', format: 'html', platform: null, metadata: { subject: 'Hello' } };
    const hash = approvedContentHash(base);
    expect(approvedContentHash({ ...base, body: 'Changed' })).not.toBe(hash);
    expect(approvedContentHash({ ...base, version: 5 })).not.toBe(hash);
    expect(approvedContentHash({ ...base, metadata: { subject: 'Changed' } })).not.toBe(hash);
  });

  test('rejects conflicting organization selectors before route logic', () => {
    const request = {
      body: { organization_id: 'org-a' }, query: { organization_id: 'org-b' }, params: {},
      header: () => undefined,
    } as never;
    expect(getRequestedOrganizationId(request)).toBe('');
  });

  test('persists immutable lifecycle, attribution, approval, suppression and lineage state', () => {
    const migration = read('apps/api/src/db/migrations/030_autonomous_growth_engine.sql');
    for (const expected of [
      'autonomous_growth_cycles', 'autonomous_growth_events', 'marketing_performance_events',
      'business_knowledge_snapshots', 'knowledge_page_versions', 'approved_content_hash',
      'email_suppressions', 'email_delivery_log', 'root_content_id', 'source_content_id',
      'prevent_autonomous_history_mutation',
    ]) expect(migration).toContain(expected);
    const feedbackMigration = read('apps/api/src/db/migrations/031_autonomous_campaign_feedback_closure.sql');
    for (const expected of [
      'planning_idempotency_key', 'resolution_status', 'campaign_asset_resolution_events',
      'approved_and_scheduled', 'retired_by_owner', 'failed_after_bounded_retries',
    ]) expect(feedbackMigration).toContain(expected);
  });

  test('enforces exact approved content both at preparation and delivery time', () => {
    const controlledSocial = read('apps/api/src/services/controlled-social-publishing.service.ts');
    const social = read('apps/api/src/services/social-publishing.service.ts');
    const email = read('apps/api/src/services/controlled-email-delivery.service.ts');
    expect((controlledSocial.match(/assertApprovedContentVersion/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((social.match(/assertApprovedContentVersion/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(email).toContain('contentId: string');
    expect(email).toContain('assertApprovedContentVersion');
    expect(email).toContain('email_delivery_log');
    expect(email).toContain('consent_basis');
    expect(read('apps/api/src/services/email-delivery.service.ts')).toContain('createUnsubscribeUrl');
    expect(read('apps/api/src/services/integration.service.ts')).toContain('sealSecrets(data.config)');
    expect(read('apps/api/src/services/growth-director.service.ts')).toContain('schedulePostThroughControlCentre');
  });

  test('truthfully gates platform formats and deferred networks', () => {
    const social = read('apps/api/src/services/social-publishing.service.ts');
    expect(social).toContain("tiktok: { enabled: false");
    expect(social).toContain("bluesky: { enabled: false");
    expect(social).toContain("youtube: { enabled: true, formats: ['single_video']");
    expect(social).toContain('assertSupportedSocialPayload');
  });

  test('keeps dynamic outbound URLs behind the safe fetch boundary', () => {
    expect(read('apps/api/src/services/tool.service.ts')).toContain('safeFetch(url');
    expect(read('apps/api/src/services/developer-portal.service.ts')).toContain('safeFetch(url');
    expect(read('apps/api/src/services/external-platform.service.ts')).toContain('safeFetch(url');
    expect(read('apps/api/src/workers/render-worker.ts')).toContain('safeFetch(source');
    expect(read('apps/api/src/workers/generation-worker.ts')).toContain('safeFetch(sourceUrl');
  });

  test('rejects loopback, link-local, credentials, and non-HTTP outbound URLs', async () => {
    for (const unsafe of [
      'http://127.0.0.1/private',
      'http://169.254.169.254/latest/meta-data',
      'http://user:pass@example.com/',
      'file:///etc/passwd',
      'http://[::1]/',
    ]) {
      await expect(validatePublicHttpUrl(unsafe)).rejects.toMatchObject({ code: 'UNSAFE_EXTERNAL_URL' });
    }
  });

  test('retains versioned knowledge history and schedules refresh', () => {
    const ingestion = read('apps/api/src/services/knowledge-ingestion.service.ts');
    const scheduler = read('apps/api/src/services/scheduler.service.ts');
    expect(ingestion).toContain("change_type<>'deleted'");
    expect(ingestion).toContain('knowledge_sync_runs');
    expect(ingestion).toContain('knowledge_page_versions');
    expect(scheduler).toContain('refresh-business-knowledge');
    expect(scheduler).toContain('autonomous-growth-director');
  });

  test('uses internal strategy validation and bounded quality revision', () => {
    const production = read('apps/api/src/services/campaign-production.service.ts');
    const content = read('apps/api/src/services/content-engine.service.ts');
    expect(production).toContain("strategy_validation_status || 'pending') !== 'valid'");
    expect(content).toContain('revision <= 2');
    expect(content).toContain('findReusableContent');
    expect(content).toContain("transformation_type='ai_adaptation'");
    expect(content).toContain('reviseContentFromOwnerFeedback');
    expect(content).toContain('owner_feedback_quality_revision');
  });

  test('advances approval through joined production assets and bounded experiments', () => {
    const director = read('apps/api/src/services/growth-director.service.ts');
    const experiments = read('apps/api/src/services/marketing-experiment.service.ts');
    expect(director).toContain('JOIN content_items content');
    expect(director).not.toContain('content_items WHERE organization_id=$1 AND campaign_plan_id=$2');
    expect(director).toContain('performance_summary');
    expect(director).toContain('owner_marketing_preferences');
    expect(director).toContain("'performance_learning'");
    expect(director).toContain('autonomous_strategy_created_and_validated');
    expect(director).toContain('processOwnerFeedback');
    expect(director).toContain('all_required_assets_resolved');
    expect(experiments).toContain("status='inconclusive'");
    expect(experiments).toContain('minimum_sample_size');
    expect(experiments).toContain('max_duration_days');
  });

  test('retires the unsafe legacy content mutation surface', () => {
    const legacy = read('apps/api/src/routes/content.ts');
    expect(legacy).toContain('LEGACY_CONTENT_ROUTE_RETIRED');
    expect(legacy).toContain('content_items');
    expect(legacy).not.toContain('INSERT INTO content ');
  });

  test('does not publish fabricated proof or unsupported AI providers', () => {
    const home = read('apps/web/app/(marketing)/page.tsx');
    expect(home).not.toContain('Sarah Chen');
    expect(home).not.toContain('Together AI');
    expect(home).not.toContain('DeepInfra');
    expect(home).not.toContain("'TikTok'");
    expect(home).toContain('Built around verifiable safeguards');
  });
});
