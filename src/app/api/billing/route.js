import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveTenantContext } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureBillingSchema, getBillingAccounts, PLANS_CATALOG } from '@/lib/billing';

export const dynamic = 'force-dynamic';

const submitSchema = z.object({
  planCode: z.enum(['profesional', 'negocio', 'empresa']),
  paymentMethod: z.enum(['paypal', 'binance', 'zelle', 'pago_movil']),
  referenceCode: z.string().trim().min(4, 'Ingresa el número de referencia o ID de transacción.').max(140),
  payerDetails: z
    .object({
      holderName: z.string().trim().max(120).optional(),
      payerEmail: z.string().trim().max(160).optional(),
      bank: z.string().trim().max(80).optional(),
      phone: z.string().trim().max(40).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .optional(),
});

export async function GET() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  await ensureBillingSchema();
  const [accounts, latestRes] = await Promise.all([
    getBillingAccounts(),
    query(
      `SELECT id, plan_code, amount_usd, payment_method, reference_code, payer_details, status, admin_notes, created_at
       FROM payment_requests
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [ctx.tenantId]
    ),
  ]);

  return NextResponse.json({
    tenantStatus: ctx.tenant.status,
    planCode: ctx.tenant.plan_code || 'negocio',
    plans: Object.values(PLANS_CATALOG),
    accounts,
    latestPayment: latestRes.rows[0] || null,
  });
}

export async function POST(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    await ensureBillingSchema();
    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message || 'Datos de pago inválidos.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { planCode, paymentMethod, referenceCode, payerDetails } = parsed.data;
    const plan = PLANS_CATALOG[planCode];

    const existingPending = await query(
      `SELECT id FROM payment_requests WHERE tenant_id = $1 AND status = 'pending' LIMIT 1`,
      [ctx.tenantId]
    );
    if (existingPending.rowCount > 0) {
      return NextResponse.json(
        { error: 'Ya tienes un comprobante en proceso de certificación. Espera a que sea verificado.' },
        { status: 409 }
      );
    }

    const inserted = await query(
      `INSERT INTO payment_requests (tenant_id, user_id, plan_code, amount_usd, payment_method, reference_code, payer_details, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending')
       RETURNING id, plan_code, amount_usd, payment_method, reference_code, payer_details, status, created_at`,
      [
        ctx.tenantId,
        ctx.user.id,
        plan.code,
        plan.priceUsd,
        paymentMethod,
        referenceCode,
        JSON.stringify(payerDetails || {}),
      ]
    );

    await query(`UPDATE tenants SET plan_code = $1, updated_at = NOW() WHERE id = $2`, [
      plan.code,
      ctx.tenantId,
    ]);

    return NextResponse.json({ ok: true, payment: inserted.rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[BILLING] Error registrando pago:', err);
    return NextResponse.json({ error: 'No se pudo registrar el comprobante de pago.' }, { status: 500 });
  }
}
