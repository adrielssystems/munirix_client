import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  await query(
    `UPDATE tenant_google_integrations
     SET status = 'disconnected',
         access_token_encrypted = NULL,
         refresh_token_encrypted = NULL,
         updated_at = NOW()
     WHERE tenant_id = $1`,
    [ctx.tenantId]
  );

  return NextResponse.json({ disconnected: true });
}

