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

  test('connector secrets are environment-managed and plaintext is never stored', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');
    const migration = read('apps/api/src/db/migrations/026_application_connectors.sql');

    expect(service).toContain("requiredConnectorValue('EQUIPROFILE_CONNECTOR_KEY'");
    expect(service).toContain("requiredConnectorValue('APPLICATION_CONNECTOR_SIGNING_SECRET'");
    expect(service).toContain('connectorKeyHash(config.connectorKey)');
    expect(service).toContain('ensureConfiguredApplicationConnector');
    expect(service).toContain('ensureConfiguredEquiProfileConnector = ensureConfiguredApplicationConnector');
    expect(service).not.toMatch(/INSERT INTO application_connectors[^]*connector_key/i);
    expect(migration).toContain('key_hash');
    expect(migration).not.toContain('connector_key TEXT');
  });

  test('conversion event storage is idempotent, GBP-only and preserves a validated product line', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');
    const migration = read('apps/api/src/db/migrations/026_application_connectors.sql');

    expect(service).toContain("export type HostProductLine = 'management' | 'academy' | 'shop'");
    expect(service).toContain('CONVERSION_PRODUCT_LINE_INVALID');
    expect(service).toContain('product_line: productLine');
    expect(service).toContain("Conversion value currency must be GBP");
    expect(service).toContain('value_pence must be a non-negative integer');
    expect(service).toContain('duplicate');
    expect(migration).toContain('application_conversion_events');
    expect(migration).toContain('UNIQUE (application_id, event_id)');
  });

  test('business snapshots may classify Management, Academy and Shop but reject unknown product lines', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');

    expect(service).toContain('product_lines?: HostProductLine[]');
    expect(service).toContain('validateSnapshotProductLines(payload)');
    expect(service).toContain('BUSINESS_SNAPSHOT_PRODUCT_LINE_INVALID');
    expect(service).toContain("['management', 'academy', 'shop']");
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
