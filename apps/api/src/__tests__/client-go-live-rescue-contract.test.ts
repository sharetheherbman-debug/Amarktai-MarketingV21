import fs from 'fs';
import path from 'path';

const apiRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(apiRoot, '../../..');

describe('client go-live rescue contracts', () => {
  test('tools runtime repair supports clean and repeatable upgrades', () => {
    const migration = fs.readFileSync(
      path.join(apiRoot, 'db/migrations/033_tools_runtime_repair.sql'),
      'utf8'
    );

    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS tools/i);
    expect(migration).toMatch(/ALTER TABLE tools[\s\S]*ADD COLUMN IF NOT EXISTS organization_id/i);
    expect(migration).toMatch(/input_schema JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
    expect(migration).toMatch(/handler_config JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
    expect(migration).toMatch(/idx_tools_organization_name/i);
  });

  test('tool catalogue and execution require verified organization membership and are mounted', () => {
    const tools = fs.readFileSync(path.join(apiRoot, 'routes/tools.ts'), 'utf8');
    const server = fs.readFileSync(path.join(apiRoot, 'server.ts'), 'utf8');
    expect(tools).toContain("import { requireOrganizationMembership } from '../middleware/organization-access';");
    expect(tools).toContain('router.use(requireOrganizationMembership);');
    expect(tools).toContain('const orgId = req.organizationId;');
    expect(tools).toContain('toolService.getByName(req.params.name, orgId)');
    expect(tools).toContain('toolService.execute(req.params.name, input, orgId)');
    expect(tools).not.toContain('organization_id || req.user?.userId');
    expect(tools).not.toContain('toolService.execute(req.params.name, input, organization_id)');
    expect(server).toContain("import toolRoutes from './routes/tools';");
    expect(server).toContain("app.use('/api/v1/tools', toolRoutes);");
  });

  test('knowledge vector storage uses the canonical knowledge_items embedding column', () => {
    const vectorService = fs.readFileSync(path.join(apiRoot, 'services/vector.service.ts'), 'utf8');
    expect(vectorService).not.toContain('knowledge_embeddings');
    expect(vectorService).toContain('UPDATE knowledge_items');
    expect(vectorService).toContain('SET embedding = $2::vector, updated_at = NOW()');
    expect(vectorService).toContain('1 - (ki.embedding <=> $2::vector) AS similarity');
    expect(vectorService).toContain('ki.embedding IS NOT NULL');
  });

  test('knowledge source creation keeps PostgreSQL parameter types unambiguous', () => {
    const knowledgeService = fs.readFileSync(path.join(apiRoot, 'services/knowledge.service.ts'), 'utf8');
    expect(knowledgeService).toContain('VALUES ($1,$2,$3::varchar,$4,$5,$6,$7,');
    expect(knowledgeService).toContain("CASE WHEN $3::varchar IN ('website','api','rss') THEN NOW() ELSE NULL END");
    expect(knowledgeService).toContain('NOW() + make_interval(mins => $7::int)');
    expect(knowledgeService).not.toContain('$3::text');
    expect(knowledgeService).not.toContain("($7 || ' minutes')::interval");
  });

  test('generation credit settlement keeps reused PostgreSQL parameters explicitly typed', () => {
    const creditService = fs.readFileSync(path.join(apiRoot, 'services/generation-credit.service.ts'), 'utf8');
    expect(creditService).toContain('provider_job_id=COALESCE(provider_job_id,$2::varchar),settled_credits=$3::bigint');
    expect(creditService).toContain('released_credits=$4::bigint,status=$5::varchar');
    expect(creditService).toContain('settled_at=CASE WHEN $3::bigint>0 THEN NOW() ELSE settled_at END');
    expect(creditService).toContain('released_at=CASE WHEN $4::bigint>0 OR $3::bigint=0 THEN NOW() ELSE released_at END');
  });

  test('relaunch decision insert keeps status and approval TTL parameters unambiguous', () => {
    const gateService = fs.readFileSync(path.join(apiRoot, 'services/relaunch-execution-gate.service.ts'), 'utf8');
    expect(gateService).toContain('VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,$8,$9,$10,$11,$12,$13,$14,$15,');
    expect(gateService).toContain("CASE WHEN $6::varchar='approved' THEN NOW() ELSE NULL END");
    expect(gateService).toContain("CASE WHEN $6::varchar='approved' THEN NOW() + make_interval(mins => $16::int) ELSE NULL END");
    expect(gateService).not.toContain("($16 || ' minutes')::interval");
  });

  test('relaunch manual proposal and decision keep reused status parameters explicitly typed', () => {
    const controlService = fs.readFileSync(path.join(apiRoot, 'services/relaunch-control.service.ts'), 'utf8');
    expect(controlService).toContain('VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,$8,$9,$10,$11,$12,$13,$14,$15,');
    expect(controlService).toContain("CASE WHEN $6::varchar='approved' THEN NOW() ELSE NULL END");
    expect(controlService).toContain('status=$4::varchar,decided_by_user_id=$3');
    expect(controlService).toContain("approval_expires_at=CASE WHEN $4::varchar='approved' THEN NOW() + interval '30 minutes' ELSE NULL END");
  });

  test('BullMQ custom media job IDs avoid the reserved colon separator', () => {
    const studio = fs.readFileSync(path.join(apiRoot, 'services/studio.service.ts'), 'utf8');
    const longform = fs.readFileSync(path.join(apiRoot, 'services/longform-queue.service.ts'), 'utf8');
    const campaign = fs.readFileSync(path.join(apiRoot, 'services/campaign-production.service.ts'), 'utf8');

    expect(studio).toContain('jobId: `studio-${generation.id}`');
    expect(studio).toContain('jobId: `studio-${id}-retry-${Number(row.attempt_count || 0) + 1}`');
    expect(studio).not.toMatch(/jobId:\s*`studio:/);

    expect(longform).toContain('const queueJobId = `scene-${sceneId}-${Number(scene.retry_count || 0)}-${mode}`;');
    expect(longform).toContain('jobId: queueJobId');
    expect(longform).not.toContain('jobId: idempotencyKey');

    expect(campaign).toContain('jobId: `campaign-text-${run.id}-attempt-${attempt}`');
    expect(campaign).not.toMatch(/jobId:\s*`campaign-text:/);
  });

  test('campaign reads and writes derive tenant from authenticated context', () => {
    const campaigns = fs.readFileSync(path.join(apiRoot, 'routes/campaigns.ts'), 'utf8');
    expect(campaigns).toContain('router.use(requireOrganizationMembership)');
    expect(campaigns).toContain('const orgId = req.organizationId;');
    expect(campaigns).not.toMatch(/req\.(?:query|body)\.organization_id/);
  });

  test('Connections requires verified organization membership before data access', () => {
    const integrations = fs.readFileSync(path.join(apiRoot, 'routes/integrations.ts'), 'utf8');
    expect(integrations).toContain('router.use(requireOrganizationMembership)');
    expect(integrations.indexOf('router.use(requireOrganizationMembership)'))
      .toBeLessThan(integrations.indexOf("router.get('/providers'"));
  });

  test('customer-facing browser source has no upstream provider brand', () => {
    const roots = [
      path.join(repositoryRoot, 'apps/web/app'),
      path.join(repositoryRoot, 'apps/web/src'),
      path.join(repositoryRoot, 'packages/studio/src'),
    ];
    const collect = (root: string): string[] => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(root, entry.name);
      return entry.isDirectory() ? collect(fullPath) : /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
    });

    const leaks = roots.flatMap(collect).filter((file) => /genx/i.test(fs.readFileSync(file, 'utf8')));
    expect(leaks).toEqual([]);
  });

  test('dashboard shared client, SSO, MFA and billing retain canonical API base normalization', () => {
    const apiClient = fs.readFileSync(path.join(repositoryRoot, 'apps/web/src/lib/api.ts'), 'utf8');
    expect(apiClient).toContain("trimmed === '/api'");
    expect(apiClient).toContain("return '/api/v1'");
    expect(apiClient).toContain("localStorage.getItem('org_id')");
    expect(apiClient).toContain("localStorage.getItem('auth-storage')");
    expect(apiClient).toContain('currentOrganization?.id');
    expect(apiClient).toContain("localStorage.setItem('org_id', recovered)");
    expect(apiClient).toContain('private refreshPromise: Promise<boolean> | null = null;');
    expect(apiClient).toContain('private async refreshAccessToken(): Promise<boolean>');
    expect(apiClient).toContain("/auth/refresh");
    expect(apiClient).toContain("credentials: 'include'");
    expect(apiClient).toContain('if (response.status === 401');
    expect(apiClient).toContain('if (refreshed) response = await perform();');

    const dashboard = fs.readFileSync(
      path.join(repositoryRoot, 'apps/web/app/(dashboard)/dashboard/page.tsx'),
      'utf8'
    );
    expect(dashboard).toContain("import { api } from '@/lib/api';");

    const directFetchFiles = [
      path.join(repositoryRoot, 'apps/web/app/connector/sso/page.tsx'),
      path.join(repositoryRoot, 'apps/web/app/(auth)/mfa/setup/page.tsx'),
      path.join(repositoryRoot, 'apps/web/app/(dashboard)/billing/page.tsx'),
    ];
    for (const file of directFetchFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).toContain("trimmed === '/api'");
      expect(source).toContain("return '/api/v1'");
    }
  });

  test('Marketing favicon is same-origin and locally served', () => {
    const rootLayout = fs.readFileSync(path.join(repositoryRoot, 'apps/web/app/layout.tsx'), 'utf8');
    expect(rootLayout).toContain("const BRAND_ICON = '/favicon.svg';");
    expect(rootLayout).not.toContain('https://equiprofile.online/favicon.svg');
    expect(fs.existsSync(path.join(repositoryRoot, 'apps/web/public/favicon.svg'))).toBe(true);
  });
});