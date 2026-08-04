import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getEnvNumber('PORT', 4000),
  APP_URL: getEnv('APP_URL', 'http://localhost:3000'),
  API_URL: getEnv('API_URL', 'http://localhost:4000'),

  DATABASE_URL: getEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/amarktai'),
  POSTGRES_USER: getEnv('POSTGRES_USER', 'postgres'),
  POSTGRES_PASSWORD: getEnv('POSTGRES_PASSWORD', 'postgres'),
  POSTGRES_DB: getEnv('POSTGRES_DB', 'amarktai'),

  REDIS_URL: getEnv('REDIS_URL', 'redis://localhost:6379'),

  JWT_SECRET: getEnv('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
  JWT_REFRESH_SECRET: getEnv('JWT_REFRESH_SECRET', 'dev-jwt-refresh-secret-change-in-production'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),

  ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY', 'dev-encryption-key-32-chars-long!!'),

  GENX_API_KEY: getEnv('GENX_API_KEY', ''),
  GENX_BASE_URL: getEnv('GENX_BASE_URL', 'https://api.genxrouter.com/v1'),

  TOGETHER_API_KEY: getEnv('TOGETHER_API_KEY', ''),
  TOGETHER_BASE_URL: getEnv('TOGETHER_BASE_URL', 'https://api.together.xyz/v1'),

  DEEPINFRA_API_KEY: getEnv('DEEPINFRA_API_KEY', ''),
  DEEPINFRA_BASE_URL: getEnv('DEEPINFRA_BASE_URL', 'https://api.deepinfra.com/v1'),

  SMTP_HOST: getEnv('SMTP_HOST', 'smtp.gmail.com'),
  SMTP_PORT: getEnvNumber('SMTP_PORT', 587),
  SMTP_USER: getEnv('SMTP_USER', ''),
  SMTP_PASS: getEnv('SMTP_PASS', ''),
  SMTP_FROM: getEnv('SMTP_FROM', 'noreply@amarktai.com'),

  RATE_LIMIT_WINDOW_MS: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000),
  RATE_LIMIT_MAX_REQUESTS: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),

  FIRST_RUN: getEnvBoolean('FIRST_RUN', true),
} as const;
