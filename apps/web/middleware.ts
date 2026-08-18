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

function isLegacyPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return LEGACY_PUBLIC_PATHS.has(pathname);
}

export function middleware(request: NextRequest) {
  if (isLegacyPublicMarketingPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|apple-touch-icon.png|og-image.png).*)'],
};
