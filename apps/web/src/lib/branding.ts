function trimmed(value: string | undefined): string {
  return String(value || '').trim();
}

function colour(value: string | undefined, fallback: string): string {
  const candidate = trimmed(value);
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function booleanFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(trimmed(value).toLowerCase());
}

function safeHttpsUrl(value: string | undefined, fallback: string): string {
  const candidate = trimmed(value);
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

export const MARKETING_BRAND_NAME = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_NAME) || 'Marketing Workspace';
export const MARKETING_BRAND_DESCRIPTION = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION)
  || 'AI-powered marketing automation, analytics, campaign management and growth operations.';

export const MARKETING_SUPPORT_EMAIL = trimmed(process.env.NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL);
export const MARKETING_BRAND_LOGO_URL = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_LOGO_URL) || '/logo.svg';
export const MARKETING_HOST_APPLICATION_NAME = trimmed(process.env.NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME) || 'Host application';
export const MARKETING_BRAND_PRIMARY_COLOR = colour(process.env.NEXT_PUBLIC_MARKETING_BRAND_PRIMARY_COLOR, '#052b57');
export const MARKETING_BRAND_ACCENT_COLOR = colour(process.env.NEXT_PUBLIC_MARKETING_BRAND_ACCENT_COLOR, '#167cc1');

/**
 * Embedded/connected deployments such as EquiProfile use the host application
 * as the only interactive sign-in surface. Standalone AmarktAI/white-label
 * deployments keep the local Marketing login unless this flag is enabled.
 */
export const MARKETING_EMBEDDED_SSO_ONLY = booleanFlag(process.env.NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY);
export const MARKETING_HOST_RETURN_URL = safeHttpsUrl(
  process.env.NEXT_PUBLIC_MARKETING_HOST_RETURN_URL,
  'https://equiprofile.online/admin',
);

/** Canonical parent-network attribution. White-label deployments may override it. */
export const AMARKTAI_NETWORK_URL = safeHttpsUrl(
  process.env.NEXT_PUBLIC_AMARKTAI_NETWORK_URL,
  'https://amarktai.co.za',
);
