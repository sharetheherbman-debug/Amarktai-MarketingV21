import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';

function getEnv(key: string, defaultValue = ''): string {
  return process.env[key] ?? defaultValue;
}

function getRequiredProductionValue(key: string, developmentDefault: string): string {
  const value = process.env[key];
  if (isProduction) {
    if (!value || value === developmentDefault || value.startsWith('change-me') || value.startsWith('replace-with')) {
      throw new Error(`Missing or insecure production environment variable: ${key}`);
    }
    return value;
  }
  return value || developmentDefault;
}

function getRequiredProductionSecret(
  key: string,
  developmentDefault: string,
  minimumLength: number,
  pattern?: RegExp
): string {
  const value = getRequiredProductionValue(key, developmentDefault);
  if (isProduction && value.length < minimumLength) {
    throw new Error(`Production environment variable ${key} must be at least ${minimumLength} characters`);
  }
  if (isProduction && pattern && !pattern.test(value)) {
    throw new Error(`Production environment variable ${key} has an invalid format`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  const parsed = value ? parseInt(value, 10) : defaultValue;
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric environment variable: ${key}`);
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

const appUrl = getEnv('APP_URL', 'http://localhost:3000');

export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getEnvNumber('PORT', 4000),
  APP_URL: appUrl,
  API_URL: getEnv('API_URL', 'http://localhost:4000'),
  CORS_ORIGIN: getEnv('CORS_ORIGIN', appUrl),
  TRUST_PROXY_HOPS: getEnvNumber('TRUST_PROXY_HOPS', 1),

  DATABASE_URL: getRequiredProductionValue('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/amarktai'),
  POSTGRES_USER: getEnv('POSTGRES_USER', 'postgres'),
  POSTGRES_PASSWORD: isProduction ? getRequiredProductionValue('POSTGRES_PASSWORD', 'postgres') : getEnv('POSTGRES_PASSWORD', 'postgres'),
  POSTGRES_DB: getEnv('POSTGRES_DB', 'amarktai'),

  REDIS_URL: getRequiredProductionValue('REDIS_URL', 'redis://localhost:6379'),

  JWT_SECRET: getRequiredProductionSecret('JWT_SECRET', 'dev-jwt-secret-change-in-production', 32),
  JWT_REFRESH_SECRET: getRequiredProductionSecret('JWT_REFRESH_SECRET', 'dev-jwt-refresh-secret-change-in-production', 32),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),

  ENCRYPTION_KEY: getRequiredProductionSecret(
    'ENCRYPTION_KEY',
    'dev-encryption-key-32-chars-long!!',
    64,
    /^[a-fA-F0-9]{64}$/
  ),

  GENX_API_KEY: isProduction ? getRequiredProductionValue('GENX_API_KEY', 'change-me-genx-key') : getEnv('GENX_API_KEY'),
  GENX_BASE_URL: getEnv('GENX_BASE_URL', 'https://query.genx.sh'),
  GENX_WEBHOOK_SECRET: getEnv('GENX_WEBHOOK_SECRET'),
  GENX_WEBHOOK_URL: getEnv('GENX_WEBHOOK_URL'),

  TOGETHER_API_KEY: getEnv('TOGETHER_API_KEY'),
  TOGETHER_BASE_URL: getEnv('TOGETHER_BASE_URL', 'https://api.together.xyz/v1'),

  DEEPINFRA_API_KEY: getEnv('DEEPINFRA_API_KEY'),
  DEEPINFRA_BASE_URL: getEnv('DEEPINFRA_BASE_URL', 'https://api.deepinfra.com/v1'),

  STRIPE_SECRET_KEY: getEnv('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: getEnv('STRIPE_WEBHOOK_SECRET'),

  SMTP_HOST: getEnv('SMTP_HOST', 'smtp.gmail.com'),
  SMTP_PORT: getEnvNumber('SMTP_PORT', 587),
  SMTP_USER: getEnv('SMTP_USER'),
  SMTP_PASS: getEnv('SMTP_PASS'),
  SMTP_FROM: getEnv('SMTP_FROM', 'noreply@amarktai.co.za'),

  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000),
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),

  HEALTHCHECK_TIMEOUT_MS: getEnvNumber('HEALTHCHECK_TIMEOUT_MS', 3000),

  FIRST_RUN: getEnvBoolean('FIRST_RUN', true),
} as const;
