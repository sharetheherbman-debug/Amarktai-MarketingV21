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
    expect(apiClient).toContain('new URL(joined, origin)');
    expect(apiClient).toContain('return `${url.pathname}${url.search}${url.hash}`;');
  });

  it('establishes authentication before entering the dashboard and honors embedded SSO mode', () => {
    const loginPage = fs.readFileSync(
      path.join(repoRoot, 'apps/web/app/(auth)/login/page.tsx'),
      'utf8'
    );
    const dashboardLayout = fs.readFileSync(
      path.join(repoRoot, 'apps/web/app/(dashboard)/layout.tsx'),
      'utf8'
    );

    expect(loginPage).toContain("import { useAuthStore } from '@/stores/auth.store';");
    expect(loginPage).toContain('await login({ email, password, mfa_code: mfaCode || undefined });');
    expect(loginPage).toContain("router.replace(enrollmentRequired ? '/mfa/setup' : '/dashboard');");
    expect(loginPage).not.toContain("fetch('/api/auth/login'");
    expect(loginPage).not.toContain('Sign up');

    expect(dashboardLayout).toContain('const [authChecked, setAuthChecked] = useState(false);');
    expect(dashboardLayout).toContain('if (!authChecked || isLoading || isAuthenticated) return;');
    expect(dashboardLayout).toContain('if (MARKETING_EMBEDDED_SSO_ONLY)');
    expect(dashboardLayout).toContain('window.location.replace(MARKETING_HOST_RETURN_URL);');
    expect(dashboardLayout).toContain("router.replace('/login');");
    expect(dashboardLayout).toContain('if (!authChecked || isLoading)');
  });
});
