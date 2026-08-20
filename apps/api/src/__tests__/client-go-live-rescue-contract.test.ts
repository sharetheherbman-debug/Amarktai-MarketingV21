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
});
