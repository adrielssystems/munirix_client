import { NextResponse } from 'next/server';
import { getActiveTenantContext } from '@/lib/auth';
import { updateAppointmentState } from '@/lib/scheduling/slots';

export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  const ctx = await getActiveTenantContext('appointments');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const { id } = await params;
    const body = await req.json();
    const result = await updateAppointmentState({
      tenantId: ctx.tenantId,
      appointmentId: id,
      status: body.status || null,
      newStartAtIso: body.newStartAtIso || null,
      cancellationReason: body.cancellationReason || null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
