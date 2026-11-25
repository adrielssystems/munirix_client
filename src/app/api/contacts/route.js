import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveTenantContext('contacts');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const res = await query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM appointments a WHERE a.contact_id = c.id) AS appointments_count
     FROM contacts c
     WHERE c.tenant_id = $1
     ORDER BY c.last_interaction_at DESC
     LIMIT 200`,
    [ctx.tenantId]
  );

  return NextResponse.json({ contacts: res.rows });
}

export async function POST(req) {
  const ctx = await getActiveTenantContext('contacts');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').replace(/[^\d+]/g, '');
    const email = body.email ? String(body.email).trim() : null;
    const tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

    if (!name || !phone) {
      return NextResponse.json({ error: 'Nombre y teléfono son obligatorios.' }, { status: 400 });
    }

    const res = await query(
      `INSERT INTO contacts (tenant_id, name, phone, email, external_id, channel, lead_status, tags)
       VALUES ($1, $2, $3, $4, $3, 'whatsapp', $5, $6)
       ON CONFLICT (tenant_id, channel, external_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         email = COALESCE(EXCLUDED.email, contacts.email),
         lead_status = EXCLUDED.lead_status,
         tags = EXCLUDED.tags,
         updated_at = NOW()
       RETURNING *`,
      [ctx.tenantId, name, phone, email, body.lead_status || 'new', tags]
    );

    return NextResponse.json({ contact: res.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

