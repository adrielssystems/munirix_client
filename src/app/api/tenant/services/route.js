import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const res = await query(
    `SELECT * FROM services WHERE tenant_id = $1 ORDER BY is_active DESC, name ASC`,
    [ctx.tenantId]
  );
  return NextResponse.json({ services: res.rows });
}

export async function POST(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await req.json();
    const keywords = Array.isArray(body.triage_keywords)
      ? body.triage_keywords
      : String(body.triage_keywords || '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

    const res = await query(
      `INSERT INTO services (
         tenant_id, name, code, description, duration_minutes, buffer_minutes,
         price, currency, color, preparation_notes, triage_keywords, follow_up_days, is_active
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
       RETURNING *`,
      [
        ctx.tenantId,
        String(body.name || '').trim(),
        body.code || null,
        body.description || null,
        Number(body.duration_minutes || 30),
        Number(body.buffer_minutes || 0),
        body.price !== '' && body.price !== undefined && body.price !== null ? Number(body.price) : null,
        body.currency || 'USD',
        body.color || '#6366F1',
        body.preparation_notes || null,
        keywords,
        body.follow_up_days ? Number(body.follow_up_days) : null,
      ]
    );
    return NextResponse.json({ service: res.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta id del servicio.' }, { status: 400 });

  await query(`DELETE FROM services WHERE id = $1 AND tenant_id = $2`, [id, ctx.tenantId]);
  return NextResponse.json({ deleted: true });
}

