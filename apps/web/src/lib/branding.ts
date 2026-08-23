function trimmed(value: string | undefined): string {
  return String(value || '').trim();
}

export const MARKETING_BRAND_NAME = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_NAME) || 'Marketing Workspace';
export const MARKETING_BRAND_DESCRIPTION = trimmed(process.env.NEXT_PUBLIC_MARKETING_BRAND_DESCRIPTION)
  || 'AI-powered marketing automation, analytics, campaign management and growth operations.';

export const MARKETING_SUPPORT_EMAIL = trimmed(process.env.NEXT_PUBLIC_MARKETING_SUPPORT_EMAIL);
