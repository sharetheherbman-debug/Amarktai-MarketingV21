import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('Marketing browser authentication and white-label shell', () => {
  test('normal browser auth keeps access and refresh JWTs in HttpOnly cookies', () => {
    const route = read('apps/api/src/routes/auth.ts');
    const middleware = read('apps/api/src/middleware/auth.ts');

    expect(route).toContain("res.cookie('accessToken'");
    expect(route).toContain("res.cookie('refreshToken'");
    expect(route).toContain('mfa_enrollment_required: true');
    expect(route).not.toContain('accessToken: tokens.accessToken');
    expect(route).not.toContain('refreshToken: tokens.refreshToken');
    expect(route).toContain('data: { refreshed: true }');
    expect(middleware).toContain('req.cookies?.accessToken');
    expect(middleware).toContain('const token = accessTokenFromRequest(req)');
  });

  test('SPA does not persist or read bearer credentials from localStorage', () => {
    const store = read('apps/web/src/stores/auth.store.ts');
    const client = read('apps/web/src/lib/api.ts');
    const mfa = read('apps/web/app/(auth)/mfa/setup/page.tsx');
    const dashboard = read('apps/web/app/(dashboard)/dashboard/page.tsx');
    const billing = read('apps/web/app/(dashboard)/billing/page.tsx');
    const studio = read('apps/web/app/(dashboard)/creative-studio/page.tsx');

    expect(store).not.toContain("localStorage.setItem('auth_token'");
    expect(store).not.toContain("localStorage.setItem('refresh_token'");
    expect(store).not.toContain('token: string | null');
    expect(store).not.toContain('Authorization: `Bearer');
    expect(client).not.toContain('getToken()');
    expect(client).not.toContain('headers.Authorization');
    expect(client).toContain("credentials: 'include'");
    for (const source of [mfa, dashboard, billing, studio]) {
      expect(source).not.toContain('Authorization: `Bearer');
      expect(source).not.toContain("localStorage.getItem('auth_token'");
      expect(source).toContain("credentials: 'include'");
    }
    expect(studio).not.toContain('getToken:');
  });

  test('dashboard always revalidates authentication with the server', () => {
    const layout = read('apps/web/app/(dashboard)/layout.tsx');
    const store = read('apps/web/src/stores/auth.store.ts');

    expect(layout).toContain('void checkAuth()');
    expect(store).toContain("fetch(`${API_URL}/auth/me`, { credentials: 'include' })");
    expect(store).not.toContain('isAuthenticated: state.isAuthenticated');
  });

  test('customer-facing shells have configurable branding and no EquiProfile deployment URLs', () => {
    const branding = read('apps/web/src/lib/branding.ts');
    const root = read('apps/web/app/layout.tsx');
    const authLayout = read('apps/web/app/(auth)/layout.tsx');
    const login = read('apps/web/app/(auth)/login/page.tsx');
    const mfa = read('apps/web/app/(auth)/mfa/setup/page.tsx');
    const dashboardLayout = read('apps/web/app/(dashboard)/layout.tsx');
    const dashboardHome = read('apps/web/app/(dashboard)/dashboard/page.tsx');
    const studio = read('apps/web/app/(dashboard)/creative-studio/page.tsx');
    const register = read('apps/web/app/(auth)/register/page.tsx');

    expect(branding).toContain('NEXT_PUBLIC_MARKETING_BRAND_NAME');
    for (const source of [root, authLayout, login, mfa, dashboardLayout, dashboardHome, studio, register]) {
      expect(source).not.toContain('equiprofile.online');
      expect(source).not.toContain('EquiProfile');
    }
    expect(dashboardHome).toContain('MARKETING_BRAND_NAME');
    expect(studio).toContain('MARKETING_BRAND_NAME');
    expect(studio).not.toContain('equiprofile-');
    expect(register).toContain('Public self-registration is disabled');
  });
});
