import { NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const [rules, blocks] = await Promise.all([
    query(`SELECT * FROM availability_rules WHERE tenant_id = $1 ORDER BY day_of_week ASC, start_time ASC`, [ctx.tenantId]),
    query(`SELECT * FROM availability_blocks WHERE tenant_id = $1 AND end_at >= NOW() ORDER BY start_at ASC`, [ctx.tenantId]),
  ]);

  return NextResponse.json({ rules: rules.rows, blocks: blocks.rows });
}

export async function PUT(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await req.json();
    const rules = Array.isArray(body.rules) ? body.rules : [];

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM availability_rules WHERE tenant_id = $1`, [ctx.tenantId]);
      for (const r of rules) {
        if (!r.is_active) continue;
        await client.query(
          `INSERT INTO availability_rules (tenant_id, day_of_week, start_time, end_time, is_active)
           VALUES ($1, $2, $3::time, $4::time, true)`,
          [ctx.tenantId, Number(r.day_of_week), r.start_time, r.end_time]
        );
      }
    });

    const updated = await query(
      `SELECT * FROM availability_rules WHERE tenant_id = $1 ORDER BY day_of_week ASC`,
      [ctx.tenantId]
    );
    return NextResponse.json({ rules: updated.rows });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

