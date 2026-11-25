import { google } from 'googleapis';
import { query } from '../db.js';
import { getAuthorizedGoogleClient } from './auth.js';

/**
 * Consulta intervalos ocupados en Google Calendar (FreeBusy) para un rango de fechas.
 */
export async function getGoogleBusyIntervals(tenantId, timeMinIso, timeMaxIso, timezone = 'America/Caracas') {
  try {
    const client = await getAuthorizedGoogleClient(tenantId);
    if (!client || !client.integration.calendar_sync_enabled) {
      return [];
    }

    const calendar = google.calendar({ version: 'v3', auth: client.auth });
    const calendarId = client.integration.calendar_id || 'primary';

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        timeZone: timezone,
        items: [{ id: calendarId }],
      },
    });

    const busy = res.data.calendars?.[calendarId]?.busy || [];
    return busy.map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
      source: 'google_calendar',
    }));
  } catch (err) {
    console.warn(`[GOOGLE CALENDAR] FreeBusy falló para tenant ${tenantId}:`, err.message);
    return [];
  }
}

/**
 * Lista los calendarios accesibles por la cuenta de Google del tenant.
 */
export async function listTenantGoogleCalendars(tenantId) {
  const client = await getAuthorizedGoogleClient(tenantId);
  if (!client) return [];

  const calendar = google.calendar({ version: 'v3', auth: client.auth });
  const res = await calendar.calendarList.list({ minAccessRole: 'writer' });
  return (res.data.items || []).map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: Boolean(c.primary),
    timeZone: c.timeZone,
  }));
}

/**
 * Crea un evento en Google Calendar y guarda google_event_id + meet_link en appointments.
 */
export async function syncAppointmentToGoogle(tenantId, appointment, contact, timezone = 'America/Caracas') {
  try {
    const client = await getAuthorizedGoogleClient(tenantId);
    if (!client || !client.integration.calendar_sync_enabled) {
      return { synced: false, reason: 'google_not_connected' };
    }

    const calendar = google.calendar({ version: 'v3', auth: client.auth });
    const calendarId = client.integration.calendar_id || 'primary';

    const descriptionLines = [
      `Paciente / Cliente: ${contact?.name || 'Sin nombre'}`,
      contact?.phone ? `Teléfono: ${contact.phone}` : null,
      appointment.triage_reason ? `Motivo / Triaje: ${appointment.triage_reason}` : null,
      appointment.notes ? `Notas: ${appointment.notes}` : null,
      `Origen: ${appointment.source || 'Munirix'}`,
    ].filter(Boolean);

    const eventBody = {
      summary: `${appointment.title} — ${contact?.name || 'Paciente'}`,
      description: descriptionLines.join('\n'),
      start: {
        dateTime: new Date(appointment.start_at).toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: new Date(appointment.end_at).toISOString(),
        timeZone: timezone,
      },
      attendees: contact?.email ? [{ email: contact.email, displayName: contact.name }] : undefined,
    };

    if (client.integration.create_meet_links) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `hc-${appointment.id}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    let response;
    if (appointment.google_event_id) {
      response = await calendar.events.patch({
        calendarId,
        eventId: appointment.google_event_id,
        requestBody: eventBody,
      });
    } else {
      response = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: client.integration.create_meet_links ? 1 : 0,
        requestBody: eventBody,
      });
    }

    const googleEventId = response.data.id || null;
    const meetLink = response.data.hangoutLink || null;

    if (googleEventId) {
      await query(
        `UPDATE appointments SET google_event_id = $1, meet_link = COALESCE($2, meet_link), updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [googleEventId, meetLink, appointment.id, tenantId]
      );
      await query(
        `UPDATE tenant_google_integrations SET last_synced_at = NOW(), last_error = NULL WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    return { synced: true, googleEventId, meetLink };
  } catch (err) {
    console.error(`[GOOGLE CALENDAR] Error sincronizando cita ${appointment.id}:`, err.message);
    await query(
      `UPDATE tenant_google_integrations SET last_error = $1, updated_at = NOW() WHERE tenant_id = $2`,
      [err.message, tenantId]
    ).catch(() => {});
    return { synced: false, error: err.message };
  }
}

/**
 * Cancela/elimina un evento de Google Calendar cuando se cancela una cita.
 */
export async function deleteAppointmentFromGoogle(tenantId, googleEventId) {
  if (!googleEventId) return { deleted: false };
  try {
    const client = await getAuthorizedGoogleClient(tenantId);
    if (!client) return { deleted: false };

    const calendar = google.calendar({ version: 'v3', auth: client.auth });
    const calendarId = client.integration.calendar_id || 'primary';
    await calendar.events.delete({ calendarId, eventId: googleEventId });
    return { deleted: true };
  } catch (err) {
    console.warn(`[GOOGLE CALENDAR] No se pudo eliminar evento ${googleEventId}:`, err.message);
    return { deleted: false, error: err.message };
  }
}

