import { query } from '../db.js';
import { getGoogleBusyIntervals, syncAppointmentToGoogle, deleteAppointmentFromGoogle } from '../google/calendar.js';

/**
 * Convierte una fecha YYYY-MM-DD + HH:mm en una zona horaria IANA a objeto Date UTC exacto.
 */
export function zonedDateTimeToUtc(dateStr, timeStr, timeZone = 'America/Caracas') {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value])
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const offsetMs = asIfUtc - utcGuess;
  return new Date(utcGuess - offsetMs);
}

/**
 * Formatea una fecha UTC a la zona horaria del tenant.
 */
export function formatInTimezone(date, timeZone = 'America/Caracas') {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Calcula los horarios disponibles para un tenant y servicio en una fecha YYYY-MM-DD,
 * cruzando availability_rules + availability_blocks + appointments + Google Calendar FreeBusy.
 */
export async function getAvailableSlots({ tenantId, dateStr, serviceId = null, durationMinutes = null }) {
  const tenantRes = await query(`SELECT timezone FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]);
  const timezone = tenantRes.rows[0]?.timezone || 'America/Caracas';

  let duration = durationMinutes || 30;
  let buffer = 0;
  let service = null;

  if (serviceId) {
    const srvRes = await query(
      `SELECT * FROM services WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [serviceId, tenantId]
    );
    service = srvRes.rows[0] || null;
    if (service) {
      duration = service.duration_minutes;
      buffer = service.buffer_minutes || 0;
    }
  }

  const dayStartUtc = zonedDateTimeToUtc(dateStr, '00:00', timezone);
  const dayEndUtc = zonedDateTimeToUtc(dateStr, '23:59', timezone);

  // Determinar día de la semana en la zona horaria del tenant (0=Dom..6=Sab)
  const dayMidUtc = zonedDateTimeToUtc(dateStr, '12:00', timezone);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wkShort = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(dayMidUtc);
  const dayOfWeek = weekdayMap[wkShort] ?? dayMidUtc.getUTCDay();

  const [rulesRes, aptsRes, blocksRes, googleBusy] = await Promise.all([
    query(
      `SELECT start_time, end_time FROM availability_rules
       WHERE tenant_id = $1 AND day_of_week = $2 AND is_active = true
       ORDER BY start_time ASC`,
      [tenantId, dayOfWeek]
    ),
    query(
      `SELECT start_at, end_at FROM appointments
       WHERE tenant_id = $1 AND status IN ('scheduled', 'confirmed')
         AND start_at < $3 AND end_at > $2`,
      [tenantId, dayStartUtc.toISOString(), dayEndUtc.toISOString()]
    ),
    query(
      `SELECT start_at, end_at FROM availability_blocks
       WHERE tenant_id = $1 AND start_at < $3 AND end_at > $2`,
      [tenantId, dayStartUtc.toISOString(), dayEndUtc.toISOString()]
    ),
    getGoogleBusyIntervals(tenantId, dayStartUtc.toISOString(), dayEndUtc.toISOString(), timezone),
  ]);

  const busy = [
    ...aptsRes.rows.map((a) => ({ start: new Date(a.start_at), end: new Date(a.end_at) })),
    ...blocksRes.rows.map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) })),
    ...googleBusy,
  ];

  const totalBlockMs = (duration + buffer) * 60 * 1000;
  const serviceMs = duration * 60 * 1000;
  const stepMs = Math.min(30, duration) * 60 * 1000;
  const minBookableTime = new Date(Date.now() + 15 * 60 * 1000);

  const slots = [];

  for (const rule of rulesRes.rows) {
    const startHM = String(rule.start_time).slice(0, 5);
    const endHM = String(rule.end_time).slice(0, 5);
    let cursor = zonedDateTimeToUtc(dateStr, startHM, timezone);
    const windowEnd = zonedDateTimeToUtc(dateStr, endHM, timezone);

    while (cursor.getTime() + serviceMs <= windowEnd.getTime()) {
      const slotStart = new Date(cursor.getTime());
      const slotEnd = new Date(cursor.getTime() + serviceMs);
      const slotEndWithBuffer = new Date(cursor.getTime() + totalBlockMs);

      const inFuture = slotStart >= minBookableTime;
      const isBusy = busy.some((b) => overlaps(slotStart, slotEndWithBuffer, b.start, b.end));

      if (inFuture && !isBusy) {
        const localTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(slotStart);

        slots.push({
          startAt: slotStart.toISOString(),
          endAt: slotEnd.toISOString(),
          localTime,
          label: formatInTimezone(slotStart, timezone),
        });
      }
      cursor = new Date(cursor.getTime() + stepMs);
    }
  }

  return { date: dateStr, timezone, durationMinutes: duration, service, slots };
}

/**
 * Encola los jobs automáticos de ciclo de vida del paciente para una cita.
 */
export async function scheduleAppointmentAutomations(tenantId, appointment, contactId) {
  const startMs = new Date(appointment.start_at).getTime();
  const nowMs = Date.now();

  // Cancelar jobs previos pendientes si se reprogramó
  await query(
    `UPDATE automation_jobs
     SET status = 'cancelled', updated_at = NOW()
     WHERE tenant_id = $1 AND appointment_id = $2 AND status = 'pending'`,
    [tenantId, appointment.id]
  );

  const jobs = [];
  // 1. Confirmación inmediata
  jobs.push({
    type: 'confirm_instant',
    runAt: new Date(nowMs + 2000).toISOString(),
  });

  // 2. Recordatorio 24h antes (si falta más de 24h)
  const rem24 = startMs - 24 * 60 * 60 * 1000;
  if (rem24 > nowMs + 60 * 1000) {
    jobs.push({ type: 'reminder_24h', runAt: new Date(rem24).toISOString() });
  }

  // 3. Recordatorio 2h antes (si falta más de 2h)
  const rem2 = startMs - 2 * 60 * 60 * 1000;
  if (rem2 > nowMs + 60 * 1000) {
    jobs.push({ type: 'reminder_2h', runAt: new Date(rem2).toISOString() });
  }

  for (const job of jobs) {
    await query(
      `INSERT INTO automation_jobs (tenant_id, appointment_id, contact_id, job_type, channel, run_at, status, payload)
       VALUES ($1, $2, $3, $4, 'whatsapp', $5, 'pending', $6::jsonb)`,
      [
        tenantId,
        appointment.id,
        contactId,
        job.type,
        job.runAt,
        JSON.stringify({ title: appointment.title, start_at: appointment.start_at }),
      ]
    );
  }
}

/**
 * Encola seguimiento post-consulta (15 o 30 días) al completar una cita.
 */
export async function schedulePostVisitFollowUp(tenantId, appointment) {
  let days = 30;
  if (appointment.service_id) {
    const srv = await query(`SELECT follow_up_days FROM services WHERE id = $1 AND tenant_id = $2`, [
      appointment.service_id,
      tenantId,
    ]);
    if (srv.rows[0]?.follow_up_days) {
      days = Number(srv.rows[0].follow_up_days);
    }
  }

  const runAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await query(
    `INSERT INTO automation_jobs (tenant_id, appointment_id, contact_id, job_type, channel, run_at, status, payload)
     VALUES ($1, $2, $3, 'followup_post_visit', 'whatsapp', $4, 'pending', $5::jsonb)`,
    [
      tenantId,
      appointment.id,
      appointment.contact_id,
      runAt,
      JSON.stringify({ follow_up_days: days, title: appointment.title }),
    ]
  );
}

/**
 * Crea una cita atómicamente (protegida por EXCLUDE USING gist en Postgres),
 * la sincroniza con Google Calendar y encola los recordatorios.
 */
export async function createAppointment({
  tenantId,
  contactId,
  serviceId = null,
  startAtIso,
  triageReason = null,
  notes = null,
  source = 'manual',
}) {
  const [tenantRes, contactRes, serviceRes] = await Promise.all([
    query(`SELECT timezone FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]),
    query(`SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [contactId, tenantId]),
    serviceId
      ? query(`SELECT * FROM services WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [serviceId, tenantId])
      : Promise.resolve({ rows: [] }),
  ]);

  const timezone = tenantRes.rows[0]?.timezone || 'America/Caracas';
  const contact = contactRes.rows[0];
  if (!contact) throw new Error('Contacto no encontrado en este tenant.');

  const service = serviceRes.rows[0] || null;
  const durationMinutes = service?.duration_minutes || 30;
  const startDate = new Date(startAtIso);
  if (Number.isNaN(startDate.getTime())) throw new Error('Fecha/hora de inicio inválida.');
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  const title = service?.name || 'Consulta';

  // Verificar conflicto en Google Calendar antes de insertar
  const googleBusy = await getGoogleBusyIntervals(
    tenantId,
    startDate.toISOString(),
    endDate.toISOString(),
    timezone
  );
  if (googleBusy.some((b) => overlaps(startDate, endDate, b.start, b.end))) {
    throw new Error('Ese horario está ocupado en el Google Calendar del consultorio.');
  }

  let appointment;
  try {
    const res = await query(
      `INSERT INTO appointments (
         tenant_id, contact_id, service_id, title, start_at, end_at,
         status, triage_reason, notes, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8, $9)
       RETURNING *`,
      [
        tenantId,
        contactId,
        service?.id || null,
        title,
        startDate.toISOString(),
        endDate.toISOString(),
        triageReason,
        notes,
        source,
      ]
    );
    appointment = res.rows[0];
  } catch (err) {
    if (err.code === '23P01') {
      throw new Error('Ya existe otra cita reservada en ese bloque horario.');
    }
    throw err;
  }

  // Sincronización Google Calendar + Recordatorios automáticos
  const [gSync] = await Promise.all([
    syncAppointmentToGoogle(tenantId, appointment, contact, timezone),
    scheduleAppointmentAutomations(tenantId, appointment, contactId),
  ]);

  return {
    appointment: {
      ...appointment,
      google_event_id: gSync.googleEventId || appointment.google_event_id,
      meet_link: gSync.meetLink || appointment.meet_link,
    },
    service,
    googleSync: gSync,
    formattedStart: formatInTimezone(appointment.start_at, timezone),
  };
}

/**
 * Reprograma, confirma, completa o cancela una cita manteniendo Google Calendar y Jobs sincronizados.
 */
export async function updateAppointmentState({
  tenantId,
  appointmentId,
  status = null,
  newStartAtIso = null,
  cancellationReason = null,
}) {
  const existingRes = await query(
    `SELECT a.*, c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email,
            s.duration_minutes, t.timezone
     FROM appointments a
     JOIN contacts c ON c.id = a.contact_id
     JOIN tenants t ON t.id = a.tenant_id
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.id = $1 AND a.tenant_id = $2
     LIMIT 1`,
    [appointmentId, tenantId]
  );

  const existing = existingRes.rows[0];
  if (!existing) throw new Error('Cita no encontrada.');

  const timezone = existing.timezone || 'America/Caracas';
  const contact = {
    name: existing.contact_name,
    phone: existing.contact_phone,
    email: existing.contact_email,
  };

  let startAt = existing.start_at;
  let endAt = existing.end_at;
  let nextStatus = status || existing.status;

  if (newStartAtIso) {
    const dur = existing.duration_minutes || Math.round((new Date(existing.end_at) - new Date(existing.start_at)) / 60000) || 30;
    const sDate = new Date(newStartAtIso);
    if (Number.isNaN(sDate.getTime())) throw new Error('Nueva fecha/hora inválida.');
    startAt = sDate.toISOString();
    endAt = new Date(sDate.getTime() + dur * 60 * 1000).toISOString();
    if (!status) nextStatus = 'scheduled';
  }

  let updated;
  try {
    const res = await query(
      `UPDATE appointments
       SET start_at = $1,
           end_at = $2,
           status = $3,
           confirmed_at = CASE WHEN $3 = 'confirmed' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
           cancelled_at = CASE WHEN $3 = 'cancelled' THEN NOW() ELSE cancelled_at END,
           cancellation_reason = COALESCE($4, cancellation_reason),
           updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [startAt, endAt, nextStatus, cancellationReason, appointmentId, tenantId]
    );
    updated = res.rows[0];
  } catch (err) {
    if (err.code === '23P01') {
      throw new Error('El nuevo horario se solapa con otra cita existente.');
    }
    throw err;
  }

  if (nextStatus === 'cancelled') {
    await Promise.all([
      deleteAppointmentFromGoogle(tenantId, existing.google_event_id),
      query(
        `UPDATE automation_jobs SET status = 'cancelled', updated_at = NOW()
         WHERE tenant_id = $1 AND appointment_id = $2 AND status = 'pending'`,
        [tenantId, appointmentId]
      ),
    ]);
  } else if (newStartAtIso) {
    await Promise.all([
      syncAppointmentToGoogle(tenantId, updated, contact, timezone),
      scheduleAppointmentAutomations(tenantId, updated, updated.contact_id),
    ]);
  } else if (nextStatus === 'completed') {
    await schedulePostVisitFollowUp(tenantId, updated);
  }

  return {
    appointment: updated,
    formattedStart: formatInTimezone(updated.start_at, timezone),
  };
}

