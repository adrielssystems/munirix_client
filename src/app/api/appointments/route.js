import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';
import { createAppointment } from '@/lib/scheduling/slots';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const ctx = await getActiveTenantContext('appointments');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const params = [ctx.tenantId];
  let whereRange = '';
  if (from && to) {
    params.push(from, to);
    whereRange = ' AND a.start_at >= $2 AND a.start_at <= $3';
  }

  const [aptsRes, servicesRes, contactsRes] = await Promise.all([
    query(
      `SELECT a.*, c.name AS contact_name, c.phone AS contact_phone,
              s.name AS service_name, s.color AS service_color, s.duration_minutes
       FROM appointments a
       JOIN contacts c ON c.id = a.contact_id
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.tenant_id = $1 ${whereRange}
       ORDER BY a.start_at ASC
       LIMIT 200`,
      params
    ),
    query(`SELECT id, name, duration_minutes, price, currency, color FROM services WHERE tenant_id = $1 AND is_active = true ORDER BY name ASC`, [ctx.tenantId]),
    query(`SELECT id, name, phone, email FROM contacts WHERE tenant_id = $1 ORDER BY last_interaction_at DESC LIMIT 100`, [ctx.tenantId]),
  ]);

  return NextResponse.json({
    appointments: aptsRes.rows,
    services: servicesRes.rows,
    contacts: contactsRes.rows,
    timezone: ctx.tenant.timezone,
  });
}

export async function POST(req) {
  const ctx = await getActiveTenantContext('appointments');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await req.json();
    let contactId = body.contactId;

    // Permitir crear contacto rápido al agendar cita manual
    if (!contactId && body.newContactName && body.newContactPhone) {
      const cleanPhone = String(body.newContactPhone).replace(/[^\d+]/g, '');
      const cRes = await query(
        `INSERT INTO contacts (tenant_id, name, phone, external_id, channel)
         VALUES ($1, $2, $3, $3, 'whatsapp')
         ON CONFLICT (tenant_id, channel, external_id)
         DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id`,
        [ctx.tenantId, String(body.newContactName).trim(), cleanPhone]
      );
      contactId = cRes.rows[0].id;
    }

    if (!contactId || !body.startAtIso) {
      return NextResponse.json({ error: 'Paciente/contacto y fecha de inicio son obligatorios.' }, { status: 400 });
    }

    const result = await createAppointment({
      tenantId: ctx.tenantId,
      contactId,
      serviceId: body.serviceId || null,
      startAtIso: body.startAtIso,
      triageReason: body.triageReason || null,
      notes: body.notes || null,
      source: 'manual',
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

