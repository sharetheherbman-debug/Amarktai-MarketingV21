import { NextRequest, NextResponse } from 'next/server';

const ownerOnlyRedirects = new Set([
  '/', '/register', '/pricing', '/features', '/about', '/ai-agents', '/blog', '/contact', '/docs',
]);

export function middleware(request: NextRequest) {
  if (ownerOnlyRedirects.has(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.svg|og-image.png).*)'],
};
