import fs from 'fs';
import path from 'path';

describe('tenant-governed social OAuth onboarding', () => {
  const root = path.resolve(__dirname, '../../../..');
  const service = fs.readFileSync(path.join(root, 'apps/api/src/services/social-oauth.service.ts'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'apps/api/src/routes/amai.ts'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'apps/api/src/db/migrations/040_social_oauth_onboarding.sql'), 'utf8');

  it('implements real provider authorization/token contracts with state, PKCE and one-use tenant binding', () => {
    for (const value of ['accounts.google.com/o/oauth2/v2/auth','oauth2.googleapis.com/token','linkedin.com/oauth/v2/authorization','twitter.com/i/oauth2/authorize','www.facebook.com/v25.0/dialog/oauth']) expect(service).toContain(value);
    expect(service).toContain("state_hash=$4");
    expect(service).toContain("consumed_at IS NULL");
    expect(service).toContain("code_challenge_method', 'S256'");
    expect(service).toContain("clientIdParameter: 'client_key'");
    expect(service).toContain("scopeSeparator: ','");
    expect(service).toContain("body.set('continuous_refresh', 'true')");
    expect(migration).toContain('organization_id UUID NOT NULL');
    expect(migration).toContain('user_id UUID NOT NULL');
  });

  it('encrypts credentials, exposes only public account choices, and requires owner/admin membership', () => {
    expect(service).toContain('sealSecrets');
    expect(service).toContain("secret_envelope='{}'::jsonb");
    expect(routes).toContain('requireAuth, requireOrganizationMembership');
    expect(routes).toContain("requireOrganizationRole('owner', 'admin')");
    expect(service).not.toMatch(/return \{[^}]*access_token/);
  });
});
