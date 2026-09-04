import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('reusable Application Connector release boundaries', () => {
  test('production connector identity, URL and secrets fail closed while legacy EquiProfile env names remain compatibility aliases', () => {
    const service = read('apps/api/src/services/application-connector.service.ts');

    expect(service).toContain("requiredHostValue(['HOST_APP_ID', 'EQUIPROFILE_APP_ID']");
    expect(service).toContain("requiredHostValue(['HOST_APP_NAME', 'EQUIPROFILE_APP_NAME']");
    expect(service).toContain("requiredHostValue(['HOST_APP_URL', 'EQUIPROFILE_APP_URL']");
    expect(service).toContain("requiredConnectorSecret(['HOST_APP_CONNECTOR_KEY', 'EQUIPROFILE_CONNECTOR_KEY']");
    expect(service).toContain("requiredConnectorSecret(['APPLICATION_CONNECTOR_SIGNING_SECRET']");
    expect(service).toContain("env.NODE_ENV === 'production' ? '' : developmentDefault");
    expect(service).toContain('value.length < 32');
    expect(service).toContain("parsedApplicationUrl.protocol !== 'https:'");
    expect(service).toContain('Host application ID must be a stable lowercase slug');
  });

  test('shared production environment and public API startup use neutral deployment defaults', () => {
    const environment = read('apps/api/src/config/env.ts');
    const server = read('apps/api/src/server.ts');

    expect(environment).toContain("APP_URL must use HTTPS in production");
    expect(environment).toContain("BILLING_CURRENCY must be GBP for this deployment");
    expect(environment).toContain("SMTP_FROM: isProduction ? getEnv('SMTP_FROM')");
    expect(environment).not.toContain('noreply@equiprofile.online');
    expect(environment).not.toContain('EquiProfile launch deployment');
    expect(server).toContain('ensureConfiguredApplicationConnector');
    expect(server).not.toContain('ensureConfiguredEquiProfileConnector');
    expect(server).toContain("name: 'Marketing API'");
    expect(server).not.toContain("name: 'EquiProfile Marketing API'");
  });

  test('production template and release gate are reusable, fail-closed and reject copy-template runtime values', () => {
    const template = read('.env.production.example');
    const releaseGate = read('scripts/vps-release-gate.sh');

    expect(template).toContain('NEXT_PUBLIC_MARKETING_PUBLIC_URL=');
    expect(template).toContain('NEXT_PUBLIC_MARKETING_BRAND_NAME=');
    expect(template).toContain('NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=false');
    expect(template).toContain('NEXT_PUBLIC_MARKETING_HOST_RETURN_URL=https://app.example.com');
    expect(template).toContain('NEXT_PUBLIC_AMARKTAI_NETWORK_URL=https://amarktai.co.za');
    expect(template).toContain('HOST_APP_CONNECTOR_KEY=');
    expect(template).toContain('HOST_APP_ID=host-app');
    expect(template).toContain('HOST_APP_URL=https://app.example.com');
    expect(template).toContain('DOMAIN=marketing.example.com');
    expect(template).not.toContain('marketing.equiprofile.online');
    expect(template).not.toContain('noreply@equiprofile.online');
    expect(template).not.toContain('POSTGRES_USER=equiprofile_marketing');
    expect(template).not.toContain('BACKUP_DIR=/opt/equiprofile-marketing');
    expect(template).not.toContain('phase-1/equiprofile-relaunch-genx-credits');

    expect(releaseGate).toContain('is_placeholder_value()');
    expect(releaseGate).toContain('*example.com*');
    expect(releaseGate).toContain('require_https_url "APP_URL"');
    expect(releaseGate).toContain('require_https_url "API_URL"');
    expect(releaseGate).toContain('require_https_url "CORS_ORIGIN"');
    expect(releaseGate).toContain('require_https_url "NEXT_PUBLIC_MARKETING_PUBLIC_URL"');
    expect(releaseGate).toContain('require_secret_length "POSTGRES_PASSWORD" "${POSTGRES_PASSWORD:-}" 24');
    expect(releaseGate).toContain('require_secret_length "REDIS_PASSWORD" "${REDIS_PASSWORD:-}" 24');
    expect(releaseGate).toContain('require_secret_length "JWT_SECRET" "${JWT_SECRET:-}" 32');
    expect(releaseGate).toContain('require_secret_length "JWT_REFRESH_SECRET" "${JWT_REFRESH_SECRET:-}" 32');
    expect(releaseGate).toContain('ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
    expect(releaseGate).toContain('require_value "GENX_API_KEY"');
    expect(releaseGate).toContain('require_https_url "GENX_BASE_URL"');
    expect(releaseGate).toContain('require_secret_length "GENX_WEBHOOK_SECRET" "${GENX_WEBHOOK_SECRET:-}" 32');
    expect(releaseGate).toContain('require_https_url "GENX_WEBHOOK_URL"');
    expect(releaseGate).toContain('require_value "SMTP_HOST"');
    expect(releaseGate).toContain('require_value "SMTP_FROM"');
    expect(releaseGate).toContain('HOST_APP_CONNECTOR_KEY');
    expect(releaseGate).toContain('HOST_APP_ID HOST_APP_NAME HOST_APP_URL');
    expect(releaseGate).toContain('HOST_APP_URL must use HTTPS in production');
    expect(releaseGate).toContain('ALLOW_FIRST_RUN_BOOTSTRAP');
    expect(releaseGate).toContain('require_secret_length "APPLICATION_CONNECTOR_SIGNING_SECRET" "${APPLICATION_CONNECTOR_SIGNING_SECRET:-}" 32');
    expect(releaseGate).toContain('require_secret_length "HOST_APP_CONNECTOR_KEY" "${host_connector_key}" 32');
    expect(releaseGate).toContain('require_secret_length "BACKUP_ENCRYPTION_PASSPHRASE" "${BACKUP_ENCRYPTION_PASSPHRASE:-}" 24');
    expect(releaseGate).toContain('HOST_APP_ID still contains the generic template identity');
    expect(releaseGate).toContain('EquiProfile production must enable NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=true');
    expect(releaseGate).toContain('NEXT_PUBLIC_MARKETING_HOST_RETURN_URL must remain on HOST_APP_URL');
    expect(releaseGate).not.toContain('use the same EquiProfile connector secret');
  });

  test('conversion and snapshot routes enforce the sensitive-data boundary', () => {
    const route = read('apps/api/src/routes/application-connectors.ts');

    expect(route).toContain("assertConnectorPayloadSafe(req.body?.properties || {}, 'conversion.properties')");
    expect(route).toContain("assertConnectorPayloadSafe(req.body, 'business_snapshot')");
  });

  test('SSO keeps all session credentials HttpOnly-only and the browser handoff is host-neutral', () => {
    const route = read('apps/api/src/routes/application-connectors.ts');
    const page = read('apps/web/app/connector/sso/page.tsx');

    expect(route).toContain("res.cookie('accessToken', session.accessToken");
    expect(route).toContain("res.cookie('refreshToken', session.refreshToken");
    expect(route).not.toContain('accessToken: session.accessToken');
    expect(route).not.toContain('refreshToken: session.refreshToken');
    expect(page).toContain('Secure application connection');
    expect(page).toContain('Return to previous application');
    expect(page).not.toContain('accessToken');
    expect(page).not.toContain('EquiProfile');
    expect(page).not.toContain('equiprofile.online');
  });

  test('server-side SDK refuses remote plaintext transport, embedded credentials, weak keys and invalid app IDs', () => {
    const sdk = read('packages/application-connector-sdk/src/index.ts');

    expect(sdk).toContain("parsed.protocol === 'http:' && loopback");
    expect(sdk).toContain('CONNECTOR_URL_CREDENTIALS');
    expect(sdk).toContain('CONNECTOR_KEY_WEAK');
    expect(sdk).toContain('APPLICATION_ID_INVALID');
    expect(sdk).toContain("/^[a-z0-9][a-z0-9_-]{0,99}$/");
    expect(sdk).toContain('ProductScopeKey = string');
  });
});
