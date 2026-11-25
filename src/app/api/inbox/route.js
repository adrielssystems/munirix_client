import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveTenantContext('inbox');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const res = await query(
    `SELECT cv.*, c.name AS contact_name, c.phone AS contact_phone, c.lead_status, c.tags
     FROM conversations cv
     JOIN contacts c ON c.id = cv.contact_id
     WHERE cv.tenant_id = $1
     ORDER BY cv.last_message_at DESC
     LIMIT 80`,
    [ctx.tenantId]
  );

  return NextResponse.json({ conversations: res.rows });
}

