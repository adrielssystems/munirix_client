import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveTenantContext('patients');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const res = await query(
    `SELECT c.id AS contact_id, c.name, c.phone, c.email, c.tags, c.created_at,
            p.id AS profile_id, p.document_id, p.birth_date, p.gender, p.insurance_provider,
            p.allergies, p.medical_history, p.skin_type, p.current_routine,
            (SELECT COUNT(*)::int FROM appointments a WHERE a.contact_id = c.id) AS visits_count,
            (SELECT MAX(a.start_at) FROM appointments a WHERE a.contact_id = c.id) AS last_visit_at
     FROM contacts c
     LEFT JOIN patient_profiles p ON p.contact_id = c.id AND p.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
     ORDER BY c.last_interaction_at DESC
     LIMIT 200`,
    [ctx.tenantId]
  );

  return NextResponse.json({ patients: res.rows });
}

export async function POST(req) {
  const ctx = await getActiveTenantContext('patients');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await req.json();
    let contactId = body.contact_id;

    if (!contactId) {
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').replace(/[^\d+]/g, '');
      if (!name || !phone) {
        return NextResponse.json({ error: 'Nombre y teléfono del paciente son obligatorios.' }, { status: 400 });
      }
      const cRes = await query(
        `INSERT INTO contacts (tenant_id, name, phone, email, external_id, channel, tags)
         VALUES ($1, $2, $3, $4, $3, 'whatsapp', ARRAY['paciente'])
         ON CONFLICT (tenant_id, channel, external_id)
         DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, contacts.email), updated_at = NOW()
         RETURNING id`,
        [ctx.tenantId, name, phone, body.email || null]
      );
      contactId = cRes.rows[0].id;
    }

    const pRes = await query(
      `INSERT INTO patient_profiles (
         tenant_id, contact_id, document_id, birth_date, gender,
         insurance_provider, allergies, medical_history, skin_type, current_routine, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (contact_id)
       DO UPDATE SET
         document_id = EXCLUDED.document_id,
         birth_date = EXCLUDED.birth_date,
         gender = EXCLUDED.gender,
         insurance_provider = EXCLUDED.insurance_provider,
         allergies = EXCLUDED.allergies,
         medical_history = EXCLUDED.medical_history,
         skin_type = EXCLUDED.skin_type,
         current_routine = EXCLUDED.current_routine,
         updated_at = NOW()
       RETURNING *`,
      [
        ctx.tenantId,
        contactId,
        body.document_id || null,
        body.birth_date || null,
        body.gender || null,
        body.insurance_provider || null,
        body.allergies || null,
        body.medical_history || null,
        body.skin_type || null,
        body.current_routine || null,
      ]
    );

    return NextResponse.json({ profile: pRes.rows[0], contact_id: contactId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

