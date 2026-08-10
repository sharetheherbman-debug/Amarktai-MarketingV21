import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const compose = fs.readFileSync(
  path.resolve(repositoryRoot, 'docker/docker-compose.yml'),
  'utf8'
);

describe('production compose runtime environment contract', () => {
  test('passes connector secrets required during API startup', () => {
    expect(compose).toContain(
      'APPLICATION_CONNECTOR_SIGNING_SECRET: ${APPLICATION_CONNECTOR_SIGNING_SECRET:?APPLICATION_CONNECTOR_SIGNING_SECRET required}'
    );
    expect(compose).toContain(
      'EQUIPROFILE_CONNECTOR_KEY: ${EQUIPROFILE_CONNECTOR_KEY:?EQUIPROFILE_CONNECTOR_KEY required}'
    );
    expect(compose).toContain('EQUIPROFILE_APP_ID: ${EQUIPROFILE_APP_ID:-equiprofile}');
    expect(compose).toContain('EQUIPROFILE_APP_URL: ${EQUIPROFILE_APP_URL:-https://equiprofile.online}');
    expect(compose).toContain(
      'APPLICATION_CONNECTOR_MAX_CLOCK_SKEW_SECONDS: ${APPLICATION_CONNECTOR_MAX_CLOCK_SKEW_SECONDS:-300}'
    );
    expect(compose).toContain(
      'APPLICATION_SSO_CODE_TTL_SECONDS: ${APPLICATION_SSO_CODE_TTL_SECONDS:-120}'
    );
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
