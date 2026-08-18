import { NextRequest, NextResponse } from 'next/server';

/**
 * Historical public product/marketing pages are not part of the owner-only
 * EquiProfile Marketing application. Keep those URLs closed without
 * classifying authenticated application routes (for example /integrations)
 * as public legacy pages.
 */
const LEGACY_PUBLIC_PATHS = new Set([
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
]);

/**
 * These routes must remain reachable before an application session exists.
 * In particular, /connector/sso redeems the one-time Management handoff and
 * only then receives the HTTP-only accessToken / refreshToken cookies.
 */
const PUBLIC_SESSION_PATHS = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invite',
  '/privacy',
  '/terms',
  '/cookies',
  '/status',
  '/maintenance',
]);

function isLegacyPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return LEGACY_PUBLIC_PATHS.has(pathname);
}

function isPublicSessionPath(pathname: string): boolean {
  if (PUBLIC_SESSION_PATHS.has(pathname)) return true;
  if (pathname === '/connector/sso' || pathname.startsWith('/connector/sso/')) return true;
  if (pathname === '/mfa' || pathname.startsWith('/mfa/')) return true;
  return false;
}

function hasApplicationSession(request: NextRequest): boolean {
  // The API sets both cookies as HTTP-only, Secure cookies in production.
  // Middleware only uses their presence as the navigation gate; the API
  // remains the authority that cryptographically validates every session and
  // protected data request.
  return Boolean(
    request.cookies.get('accessToken')?.value ||
    request.cookies.get('refreshToken')?.value
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isLegacyPublicMarketingPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isPublicSessionPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasApplicationSession(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Static brand assets must remain reachable before authentication because
  // the login/dashboard shells render them independently of application
  // session cookies. Protected application routes still pass through the
  // middleware and require an accessToken or refreshToken.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|apple-touch-icon.png|og-image.png|logo.png).*)'],
};
