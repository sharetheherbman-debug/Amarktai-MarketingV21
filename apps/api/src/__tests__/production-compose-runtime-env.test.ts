import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const compose = fs.readFileSync(
  path.resolve(repositoryRoot, 'docker/docker-compose.yml'),
  'utf8'
);
const webDockerfile = fs.readFileSync(
  path.resolve(repositoryRoot, 'apps/web/Dockerfile'),
  'utf8'
);

describe('production compose runtime environment contract', () => {
  test('passes generic connector runtime settings and keeps EquiProfile aliases optional', () => {
    expect(compose).toContain(
      'APPLICATION_CONNECTOR_SIGNING_SECRET: ${APPLICATION_CONNECTOR_SIGNING_SECRET:?APPLICATION_CONNECTOR_SIGNING_SECRET required}'
    );
    expect(compose).toContain('HOST_APP_CONNECTOR_KEY: ${HOST_APP_CONNECTOR_KEY:-}');
    expect(compose).toContain('HOST_APP_ID: ${HOST_APP_ID:-}');
    expect(compose).toContain('HOST_APP_NAME: ${HOST_APP_NAME:-}');
    expect(compose).toContain('HOST_APP_URL: ${HOST_APP_URL:-}');
    expect(compose).toContain('EQUIPROFILE_CONNECTOR_KEY: ${EQUIPROFILE_CONNECTOR_KEY:-}');
    expect(compose).toContain('EQUIPROFILE_APP_ID: ${EQUIPROFILE_APP_ID:-}');
    expect(compose).toContain('EQUIPROFILE_APP_NAME: ${EQUIPROFILE_APP_NAME:-}');
    expect(compose).toContain('EQUIPROFILE_APP_URL: ${EQUIPROFILE_APP_URL:-}');
    expect(compose).not.toContain('EQUIPROFILE_APP_ID: ${EQUIPROFILE_APP_ID:-equiprofile}');
    expect(compose).not.toContain('EQUIPROFILE_APP_URL: ${EQUIPROFILE_APP_URL:-https://equiprofile.online}');
    expect(compose).toContain(
      'APPLICATION_CONNECTOR_MAX_CLOCK_SKEW_SECONDS: ${APPLICATION_CONNECTOR_MAX_CLOCK_SKEW_SECONDS:-300}'
    );
    expect(compose).toContain(
      'APPLICATION_SSO_CODE_TTL_SECONDS: ${APPLICATION_SSO_CODE_TTL_SECONDS:-120}'
    );
  });

  test('propagates white-label browser identity and embedded SSO mode into both build and runtime', () => {
    for (const expected of [
      'NEXT_PUBLIC_MARKETING_PUBLIC_URL: ${NEXT_PUBLIC_MARKETING_PUBLIC_URL:-https://marketing.amarktai.co.za}',
      'NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME: ${NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME:-Host application}',
      'NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY: ${NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY:-false}',
      'NEXT_PUBLIC_MARKETING_HOST_RETURN_URL: ${NEXT_PUBLIC_MARKETING_HOST_RETURN_URL:-https://amarktai.co.za}',
      'NEXT_PUBLIC_AMARKTAI_NETWORK_URL: ${NEXT_PUBLIC_AMARKTAI_NETWORK_URL:-https://amarktai.co.za}',
    ]) {
      expect(compose).toContain(expected);
      expect(compose.indexOf(expected)).not.toBe(compose.lastIndexOf(expected));
    }

    for (const expected of [
      'ARG NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY="false"',
      'ARG NEXT_PUBLIC_MARKETING_HOST_RETURN_URL="https://amarktai.co.za"',
      'ARG NEXT_PUBLIC_AMARKTAI_NETWORK_URL="https://amarktai.co.za"',
      'ENV NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=${NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY}',
      'ENV NEXT_PUBLIC_MARKETING_HOST_RETURN_URL=${NEXT_PUBLIC_MARKETING_HOST_RETURN_URL}',
      'ENV NEXT_PUBLIC_AMARKTAI_NETWORK_URL=${NEXT_PUBLIC_AMARKTAI_NETWORK_URL}',
    ]) {
      expect(webDockerfile).toContain(expected);
    }
  });

  test('passes GBP Generation Credit and GenX pricing policy into runtime containers', () => {
    for (const expected of [
      'GENX_AGENT_TIER_ENABLED: ${GENX_AGENT_TIER_ENABLED:-true}',
      'GENX_TARGET_MARGIN_BPS: ${GENX_TARGET_MARGIN_BPS:-4000}',
      'GENX_RESERVATION_BUFFER_BPS: ${GENX_RESERVATION_BUFFER_BPS:-1500}',
      'GENX_PRICE_REFRESH_MINUTES: ${GENX_PRICE_REFRESH_MINUTES:-360}',
      'GENX_PRICE_MAX_AGE_MINUTES: ${GENX_PRICE_MAX_AGE_MINUTES:-720}',
      'GENX_PRICING_SOURCE_CURRENCY: ${GENX_PRICING_SOURCE_CURRENCY:-USD}',
      'GENX_FX_RATES_TO_GBP: ${GENX_FX_RATES_TO_GBP:?GENX_FX_RATES_TO_GBP required}',
      'GENERATION_RESERVATION_TTL_MINUTES: ${GENERATION_RESERVATION_TTL_MINUTES:-60}',
      'BILLING_CURRENCY: ${BILLING_CURRENCY:-GBP}',
      'GENERATION_CREDITS_PER_GBP: ${GENERATION_CREDITS_PER_GBP:-100}',
    ]) {
      expect(compose).toContain(expected);
    }
  });
});
