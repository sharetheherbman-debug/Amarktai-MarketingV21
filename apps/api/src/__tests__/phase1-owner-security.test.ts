import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

describe('Phase 1 owner-only security boundary', () => {
  test('public registration and public product entry are disabled', () => {
    expect(read('apps/api/src/routes/auth.ts')).toContain('REGISTRATION_DISABLED');
    const middleware = read('apps/web/middleware.ts');
    expect(middleware).toContain("'/', '/register', '/pricing'");
    expect(middleware).toContain("new URL('/login'");
  });

  test('full sessions require Marketing MFA even after connector SSO', () => {
    const auth = read('apps/api/src/middleware/auth.ts');
    const connector = read('apps/api/src/services/application-connector.service.ts');
    expect(auth).toContain('payload.mfa !== true');
    expect(connector).toContain('mfa_enrollment_required: !mfaComplete');
    expect(connector).toContain("const membershipRole = 'owner'");
    expect(connector).toContain('OWNER_ALREADY_PROVISIONED');
  });

  test('TOTP secrets, one-time recovery codes, replay counters and audit evidence are present', () => {
    const mfa = read('apps/api/src/services/mfa.service.ts');
    expect(mfa).toContain('QRCode.toDataURL');
    expect(mfa).toContain('JSON.stringify(encrypt(secret))');
    expect(mfa).toContain('two_factor_last_counter');
    expect(mfa).toContain("hashes.splice(index, 1)");
    expect(mfa).toContain('mfa.recovery_codes_regenerated');
  });

  test('billing and credit views are authenticated and Phase 1 hides checkout', () => {
    expect(read('apps/api/src/server.ts')).toContain("app.use('/api/v1/billing', ...tenant, billingRoutes)");
    const credits = read('apps/web/app/(dashboard)/billing/page.tsx');
    expect(credits).toContain('Public purchases are disabled for Phase 1');
    expect(credits).not.toContain('Continue to Stripe');
  });
});
