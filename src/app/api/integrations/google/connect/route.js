import { NextResponse } from 'next/server';
import { getActiveTenantContext } from '@/lib/auth';
import { buildGoogleAuthUrl } from '@/lib/google/auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { searchParams, origin } = new URL(req.url);
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

