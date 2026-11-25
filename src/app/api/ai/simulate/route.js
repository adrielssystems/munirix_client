import { NextResponse } from 'next/server';
import { getActiveTenantContext } from '@/lib/auth';
import { runTenantAIAgent } from '@/lib/ai/agent';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
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

