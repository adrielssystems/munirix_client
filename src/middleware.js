import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || 'munirix_fallback_secret_set_NEXTAUTH_SECRET_in_env',
    cookieName: 'munirix-client.session-token',
  });

  const pathname = req.nextUrl.pathname;
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');

  if (isAuthPage) {
    // login/page.js y register/page.js validan la existencia real del tenant en BD antes de redirigir
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/billing/:path*', '/login', '/register'],
};
