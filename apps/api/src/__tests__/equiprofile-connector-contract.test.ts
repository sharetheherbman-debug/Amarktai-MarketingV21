import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('EquiProfile connector wire contract', () => {
  test('Marketing authenticates the exact signed headers sent by EquiProfile', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');
    const server = read('apps/api/src/server.ts');

    for (const header of [
      'x-application-id',
      'x-application-key',
      'x-application-timestamp',
      'x-application-nonce',
      'x-application-signature',
    ]) {
      expect(service.toLowerCase()).toContain(header);
    }

    expect(service).toContain('function canonicalize(value: unknown)');
    expect(service).toContain('Object.keys(object).sort()');
    expect(service).toContain('return `${timestamp}\\n${nonce}\\n${canonicalize(body)}`;');
    expect(service).toContain("crypto.createHmac('sha256', key)");
    expect(service).toContain('APPLICATION_REPLAY_DETECTED');
    expect(server).toContain("app.use('/api/v1/application-connectors', applicationConnectorRoutes)");
  });

  test('SSO and conversion endpoints match the frozen EquiProfile connector paths', () => {
    const route = read('apps/api/src/routes/application-connectors.ts');
    const service = read('apps/api/src/services/application-connector.service.ts');

    expect(route).toContain("router.post('/sso/issue'");
    expect(route).toContain("router.post('/sso/redeem'");
    expect(route).toContain("router.post('/events/conversion'");
    expect(route).toContain('authenticateApplicationRequest(req, req.body)');
    expect(route).toContain('recordConversionEvent');
    expect(service).toContain("external_role: 'admin' | 'superadmin'");
    expect(service).toContain("consent_basis: 'contract' | 'consent' | 'legitimate_interest' | 'anonymous_aggregate'");
    expect(service).toContain('Only authorized host-application administrators may use Marketing SSO');
  });

  test('SSO provisions one owner safely and later authorized host admins as Marketing admins', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');

    expect(service).toContain("SELECT id FROM organizations WHERE id=$1 FOR UPDATE");
    expect(service).toContain("role='owner'");
    expect(service).toContain("=== 0 ? 'owner' : 'admin'");
    expect(service).toContain("WHEN organization_members.role='owner' THEN 'owner'");
    expect(service).not.toContain('OWNER_ALREADY_PROVISIONED');
  });

  test('connector secrets are environment-managed and plaintext is never stored', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');
    const migration = read('apps/api/src/db/migrations/026_application_connectors.sql');

    expect(service).toContain("requiredConnectorSecret(['HOST_APP_CONNECTOR_KEY', 'EQUIPROFILE_CONNECTOR_KEY']");
    expect(service).toContain("requiredConnectorSecret(['APPLICATION_CONNECTOR_SIGNING_SECRET']");
    expect(service).not.toContain("requiredConnectorValue('EQUIPROFILE_CONNECTOR_KEY'");
    expect(service).toContain('connectorKeyHash(config.connectorKey)');
    expect(service).toContain('ensureConfiguredApplicationConnector');
    expect(service).toContain('ensureConfiguredEquiProfileConnector = ensureConfiguredApplicationConnector');
    expect(service).not.toMatch(/INSERT INTO application_connectors[^]*connector_key/i);
    expect(migration).toContain('key_hash');
    expect(migration).not.toContain('connector_key TEXT');
  });

  test('conversion event storage is idempotent, GBP-only and preserves validated generic product scopes', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');
    const migration = read('apps/api/src/db/migrations/026_application_connectors.sql');

    expect(service).toContain('export type ProductScopeKey = string');
    expect(service).toContain('export type HostProductLine = ProductScopeKey');
    expect(service).toContain("from '../utils/product-scope'");
    expect(service).toContain('normalizeProductScopes(');
    expect(service).toContain('product_line: productLine');
    expect(service).toContain('product_lines: productLines');
    expect(service).toContain('application_conversion_events');
    expect(service).toContain('marketing_performance_events');
    expect(service).toContain('Conversion value currency must be GBP');
    expect(service).toContain('value_pence must be a non-negative integer');
    expect(service).toContain('duplicate');
    expect(migration).toContain('application_conversion_events');
    expect(migration).toContain('UNIQUE (application_id, event_id)');
  });

  test('business snapshots accept host-defined product scopes and reject invalid slug syntax', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');

    expect(service).toContain('product_lines?: ProductScopeKey[]');
    expect(service).toContain('validateSnapshotProductLines(payload)');
    expect(service).toContain('normalizeProductScopes(payload.app.product_lines || [])');
    expect(service).toContain('PRODUCT_SCOPE_INVALID');
    expect(service).not.toContain("['management', 'academy', 'shop'].includes");
  });

  test('reusable SDK preserves the canonical signed wire protocol without product branding', () => {
    const sdk = read('packages/application-connector-sdk/src/index.ts');
    const sdkGuide = read('packages/application-connector-sdk/README.md');

    for (const header of [
      'X-Application-Id',
      'X-Application-Key',
      'X-Application-Timestamp',
      'X-Application-Nonce',
      'X-Application-Signature',
    ]) expect(sdk).toContain(header);

    expect(sdk).toContain('Object.keys(object).sort()');
    expect(sdk).toContain("createHmac('sha256', key)");
    expect(sdk).toContain("'/sso/issue'");
    expect(sdk).toContain("'/events/conversion'");
    expect(sdk).toContain("'/business-snapshot'");
    expect(sdk).toContain("randomBytes(24).toString('base64url')");
    expect(sdk).not.toContain('equiprofile');
    expect(sdkGuide).toContain('post-commit boundary');
    expect(sdkGuide).toContain('must not reverse an order, subscription, membership, access decision');
  });
});
