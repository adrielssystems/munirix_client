import { NextResponse } from 'next/server';
import { getActiveTenantContext } from '@/lib/auth';
import { getAvailableSlots } from '@/lib/scheduling/slots';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const ctx = await getActiveTenantContext('appointments');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const serviceId = searchParams.get('serviceId') || null;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Parámetro date requerido (YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const data = await getAvailableSlots({
      tenantId: ctx.tenantId,
      dateStr: date,
      serviceId,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

