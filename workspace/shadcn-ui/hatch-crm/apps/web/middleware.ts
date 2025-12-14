import { NextResponse, type NextRequest } from 'next/server';

import { HATCH_AUTH_COOKIE } from './lib/auth/session';

const PUBLIC_PATHS = [
  '/login',
  '/auth',
  '/magic-link',
  '/api',
  '/_next',
  '/favicon',
  '/icon',
  '/favicon.png',
  '/Hatch Icon.jpg',
  '/manifest'
];
const PROTECTED_PATHS = [
  '/dashboard',
  '/payouts',
  '/commission-plans',
  '/deal-desk',
  '/contacts',
  '/messages',
  '/opportunities',
  '/portal',
  '/accounts',
  '/people',
  '/cases',
  '/agreements',
  '/routing',
  '/journeys',
  '/webhooks',
  '/re',
  '/tour-booker',
  '/admin',
  '/search'
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!isProtected) {
    return NextResponse.next();
  }

  const hasAuth = req.cookies.get(HATCH_AUTH_COOKIE);
  if (hasAuth) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
