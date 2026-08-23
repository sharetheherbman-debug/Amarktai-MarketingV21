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

  test('white-label browser variables are passed into the production Next.js build', () => {
    const compose = read('docker/docker-compose.yml');
    const dockerfile = read('apps/web/Dockerfile');

    for (const variable of [
      'NEXT_PUBLIC_MARKETING_BRAND_NAME',
      'NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION',
      'NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL',
    ]) {
      expect(compose).toContain(variable);
      expect(dockerfile).toContain(`ARG ${variable}`);
      expect(dockerfile).toContain(`ENV ${variable}=\${${variable}}`);
    }
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

  test('release gate pins exact SHA and requires generic host connector configuration', () => {
    const gate = read('scripts/vps-release-gate.sh');

    expect(gate).toContain('DEPLOY_SHA');
    expect(gate).toContain('git rev-parse HEAD');
    expect(gate).toContain('HOST_APP_CONNECTOR_KEY');
    expect(gate).toContain('HOST_APP_ID HOST_APP_NAME HOST_APP_URL');
    expect(gate).toContain('HOST_APP_URL must use HTTPS in production');
    expect(gate).toContain('ALLOW_FIRST_RUN_BOOTSTRAP');
  });
});
