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
    expect(service).toContain("parsedApplicationUrl.protocol !== 'https:'");
    expect(service).toContain('Host application ID must be a stable lowercase slug');
  });

  test('shared production environment has neutral deployment defaults', () => {
    const environment = read('apps/api/src/config/env.ts');

    expect(environment).toContain("APP_URL must use HTTPS in production");
    expect(environment).toContain("BILLING_CURRENCY must be GBP for this deployment");
    expect(environment).toContain("SMTP_FROM: isProduction ? getEnv('SMTP_FROM')");
    expect(environment).not.toContain('noreply@equiprofile.online');
    expect(environment).not.toContain('EquiProfile launch deployment');
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
});
