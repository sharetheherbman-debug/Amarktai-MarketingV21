import { NextRequest, NextResponse } from 'next/server';

const OWNER_ONLY_REDIRECT_PREFIXES = [
  '/',
  '/register',
  '/pricing',
  '/features',
  '/about',
  '/ai-agents',
  '/blog',
  '/contact',
  '/docs',
  '/compare',
  '/use-cases',
  '/integrations',
];

const EMBEDDED_AUTH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/mfa',
];

function booleanFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function embeddedHostReturnUrl(): URL {
  const fallback = new URL('https://amarktai.co.za');
  const candidate = String(process.env.NEXT_PUBLIC_MARKETING_HOST_RETURN_URL || '').trim();
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isLegacyPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return OWNER_ONLY_REDIRECT_PREFIXES
    .filter((prefix) => prefix !== '/')
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const embeddedSsoOnly = booleanFlag(process.env.NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY);
  const pathname = request.nextUrl.pathname;

  if (embeddedSsoOnly && (isLegacyPublicMarketingPath(pathname) || matchesPrefix(pathname, EMBEDDED_AUTH_PREFIXES))) {
    return NextResponse.redirect(embeddedHostReturnUrl());
  }

  if (!embeddedSsoOnly && isLegacyPublicMarketingPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.svg|og-image.png).*)'],
};
