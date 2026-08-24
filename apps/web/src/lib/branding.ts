function trimmed(value: string | undefined): string {
  return String(value || '').trim();
}

function colour(value: string | undefined, fallback: string): string {
  const candidate = trimmed(value);
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

export const MARKETING_BRAND_NAME = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_NAME) || 'Marketing Workspace';
export const MARKETING_BRAND_DESCRIPTION = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION)
  || 'AI-powered marketing automation, analytics, campaign management and growth operations.';

export const MARKETING_SUPPORT_EMAIL = trimmed(process.env.NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL);
export const MARKETING_BRAND_LOGO_URL = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_LOGO_URL) || '/logo.svg';
export const MARKETING_HOST_APPLICATION_NAME = trimmed(process.env.NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME) || 'Host application';
export const MARKETING_BRAND_PRIMARY_COLOR = colour(process.env.NEXT_PUBLIC_MARKETING_BRAND_PRIMARY_COLOR, '#052b57');
export const MARKETING_BRAND_ACCENT_COLOR = colour(process.env.NEXT_PUBLIC_MARKETING_BRAND_ACCENT_COLOR, '#167cc1');
