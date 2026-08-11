import fs from 'fs';
import path from 'path';

describe('Web/API routing contract', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');

  it('normalizes the legacy /api browser base to the versioned /api/v1 API', () => {
    const authStore = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/stores/auth.store.ts'),
      'utf8'
    );
    const apiClient = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/lib/api.ts'),
      'utf8'
    );
    const server = fs.readFileSync(
      path.join(repoRoot, 'apps/api/src/server.ts'),
      'utf8'
    );

    expect(server).toContain("app.use('/api/v1/auth', authRoutes)");
    expect(server).toContain("app.use('/api/v1/organizations', organizationRoutes)");

    expect(authStore).toContain("if (!trimmed || trimmed === '/api') return '/api/v1';");
    expect(authStore).toContain('`${API_URL}/auth/login`');
    expect(authStore).toContain('`${API_URL}/organizations`');

    expect(apiClient).toContain("if (!trimmed || trimmed === '/api') return '/api/v1';");
    expect(apiClient).toContain("new URL(joined, origin)");
    expect(apiClient).toContain('return `${url.pathname}${url.search}${url.hash}`;');
  });
});
