import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('production deployment contract', () => {
  test('Compose is project-isolated and has no EquiProfile production defaults', () => {
    const compose = read('docker/docker-compose.yml');
    const production = read('docker/docker-compose.production.yml');

    expect(compose).toContain('name: ${COMPOSE_PROJECT_NAME:-amarktai-marketing}');
    expect(compose).not.toContain('container_name:');
    expect(production).not.toContain('container_name:');

    expect(compose).not.toContain('marketing.equiprofile.online');
    expect(compose).not.toContain('noreply@equiprofile.online');
    expect(compose).not.toContain('HOST_APP_ID: ${HOST_APP_ID:-equiprofile}');
    expect(compose).not.toContain('EQUIPROFILE_CONNECTOR_KEY: ${EQUIPROFILE_CONNECTOR_KEY:?');
    expect(compose).toContain('FIRST_RUN: ${FIRST_RUN:-false}');
  });

  test('reverse proxies resolve Compose service names rather than fixed container names', () => {
    const nginx = read('docker/nginx/nginx.conf');
    const caddy = read('docker/caddy/Caddyfile');

    expect(nginx).toContain('server web:3000;');
    expect(nginx).toContain('server api:4000;');
    expect(nginx).not.toContain('amarktai-web:3000');
    expect(nginx).not.toContain('amarktai-api:4000');
    expect(caddy).toContain('ask http://api:4000/api/v1/white-label/domains/authorize');
    expect(caddy).toContain('reverse_proxy nginx:80');
    expect(caddy).not.toContain('amarktai-api:4000');
    expect(caddy).not.toContain('amarktai-nginx:80');
  });

  test('white-label browser variables are passed into the production Next.js build', () => {
    const compose = read('docker/docker-compose.yml');
    const dockerfile = read('apps/web/Dockerfile');

    for (const variable of [
      'NEXT_PUBLIC_MARKETING_BRAND_NAME',
      'NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION',
      'NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL',
      'NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY',
      'NEXT_PUBLIC_MARKETING_HOST_RETURN_URL',
      'NEXT_PUBLIC_AMARKTAI_NETWORK_URL',
    ]) {
      expect(compose).toContain(variable);
      expect(dockerfile).toContain(`ARG ${variable}`);
      expect(dockerfile).toContain(`ENV ${variable}=\${${variable}}`);
    }
  });

  test('web-only deployment cannot run migrations or recreate stateful/application services', () => {
    const deploy = read('scripts/vps-deploy.sh');
    const webStageStart = deploy.indexOf('if [[ "${stage}" == "web" ]]');
    const coreStageStart = deploy.indexOf('if [[ "${stage}" == "core" || "${stage}" == "full" ]]');
    expect(webStageStart).toBeGreaterThan(-1);
    expect(coreStageStart).toBeGreaterThan(webStageStart);
    const webStage = deploy.slice(webStageStart, coreStageStart);

    expect(webStage).toContain('compose build --pull web');
    expect(webStage).toContain('compose up -d --no-deps web');
    expect(webStage).toContain('compose exec -T nginx nginx -s reload');
    expect(webStage).not.toContain('compose run --rm migrate');
    expect(webStage).not.toContain('compose up -d postgres');
    expect(webStage).not.toContain('compose up -d api');
    expect(webStage).not.toContain('generation-worker');
    expect(webStage).not.toContain('render-worker');
  });

  test('E2E web server can use an isolated port instead of colliding with a live host application', () => {
    const playwright = read('playwright.config.ts');
    expect(playwright).toContain("const webUrl = process.env.E2E_WEB_URL || 'http://127.0.0.1:3000'");
    expect(playwright).toContain('const webPort =');
    expect(playwright).toContain('`npm start --workspace=@amarktai/web -- -p ${webPort}`');
    expect(playwright).toContain('url: `${webUrl}/login`');
    expect(playwright).not.toContain("command: 'npm start --workspace=@amarktai/web -- -p 3000'");
  });

  test('all application images use supported Node 22 LTS and the repo rejects Node 20', () => {
    const web = read('apps/web/Dockerfile');
    const api = read('apps/api/Dockerfile');
    const render = read('apps/api/Dockerfile.render');
    const rootPackage = read('package.json');

    for (const source of [web, api, render]) {
      expect(source).toContain('FROM node:22-alpine');
      expect(source).not.toContain('FROM node:20');
    }
    expect(rootPackage).toContain('"node": ">=22.0.0"');
  });

  test('CI validates the generic production contract without legacy host defaults', () => {
    const workflow = read('.github/workflows/ci.yml');

    expect(workflow).toContain('actions/checkout@v5');
    expect(workflow).toContain('actions/setup-node@v5');
    expect(workflow).toContain('HOST_APP_CONNECTOR_KEY:');
    expect(workflow).toContain('HOST_APP_ID: ci-host');
    expect(workflow).toContain('HOST_APP_URL: https://app.example.com');
    expect(workflow).toContain('SMTP_FROM: CI Marketing <noreply@example.com>');
    expect(workflow).not.toContain('EQUIPROFILE_CONNECTOR_KEY: docker-');
    expect(workflow).toContain('--add-host web:127.0.0.1');
    expect(workflow).toContain('--add-host api:127.0.0.1');
  });

  test('release gate pins exact SHA and requires generic host connector configuration', () => {
    const gate = read('scripts/vps-release-gate.sh');

    expect(gate).toContain('DEPLOY_SHA');
    expect(gate).toContain('git rev-parse HEAD');
    expect(gate).toContain('HOST_APP_CONNECTOR_KEY');
    expect(gate).toContain('HOST_APP_ID HOST_APP_NAME HOST_APP_URL');
    expect(gate).toContain('HOST_APP_URL must use HTTPS in production');
    expect(gate).toContain('ALLOW_FIRST_RUN_BOOTSTRAP');
    expect(gate).toContain('EquiProfile production must enable NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=true');
  });
});
