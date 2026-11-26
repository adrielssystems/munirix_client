import { NextResponse } from 'next/server';
import { getActiveTenantContext } from '@/lib/auth';
import { buildGoogleAuthUrl } from '@/lib/google/auth';

export const dynamic = 'force-dynamic';

function resolvePublicOrigin(req) {
  if (process.env.NEXT_PUBLIC_CLIENT_URL) return process.env.NEXT_PUBLIC_CLIENT_URL.replace(/\/+$/, '');
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/+$/, '');
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (fwdHost && !fwdHost.startsWith('0.0.0.0')) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${fwdHost}`;
  }
  return new URL(req.url).origin;
}

export async function GET(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { searchParams } = new URL(req.url);
  const origin = resolvePublicOrigin(req);
  const productsParam = searchParams.get('products') || 'calendar';
  const products = productsParam
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  try {
    const { url } = await buildGoogleAuthUrl({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      products,
      origin,
    });
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.redirect(
      `${origin}/dashboard/settings?tab=google&google_error=${encodeURIComponent(error.message)}`
    );
  }
}

