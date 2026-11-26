import { NextResponse } from 'next/server';
import { getActiveTenantContext } from '@/lib/auth';
import { runTenantAIAgent } from '@/lib/ai/agent';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  if (ctx.tenant.status === 'pending_payment' && ctx.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Tu prueba gratuita expiró. Activa un plan para continuar.' }, { status: 402 });
  }

  const rl = checkRateLimit(`sim:${ctx.tenantId}`, { limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Límite de simulaciones alcanzado. Espera unos minutos.' }, { status: 429 });
  }

  try {
    const body = await req.json();
    const message = String(body.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'Escribe un mensaje para simular.' }, { status: 400 });
    }

    const result = await runTenantAIAgent({
      tenantId: ctx.tenantId,
      userMessage: message,
      channel: 'whatsapp',
      simulate: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

