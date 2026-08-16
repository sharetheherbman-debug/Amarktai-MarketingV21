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

function isLegacyPublicMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return OWNER_ONLY_REDIRECT_PREFIXES
    .filter((prefix) => prefix !== '/')
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  if (isLegacyPublicMarketingPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.svg|og-image.png).*)'],
};
