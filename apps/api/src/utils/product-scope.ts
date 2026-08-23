import { AppError } from '../middleware/errorHandler';

export function normalizeProductScopeKey(value: unknown): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : null;
}

export function normalizeProductScopes(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  if (values.length > 32) {
    throw new AppError(400, 'No more than 32 product/service scopes may be selected', 'PRODUCT_SCOPE_TOO_LARGE');
  }
  const normalized = values.map(normalizeProductScopeKey);
  if (normalized.some((item) => !item)) {
    throw new AppError(400, 'Product/service scopes must be lowercase slug keys', 'PRODUCT_SCOPE_INVALID');
  }
  return [...new Set(normalized as string[])];
}

export function legacyProductLine(scopes: string[]): string | null {
  return scopes.length === 1 ? scopes[0] : null;
}
