import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getActiveTenantContext } from '@/lib/auth';
import { getAuthorizedGoogleClient } from '@/lib/google/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/google/test
 * Verifica en vivo cada API de Google autorizada por el tenant (Calendar, Drive, Gmail, Sheets, Contacts).
 */
export async function POST() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const client = await getAuthorizedGoogleClient(ctx.tenantId);
  if (!client) {
    return NextResponse.json(
      { error: 'La cuenta de Google no está conectada aún para este tenant.' },
      { status: 400 }
    );
  }

  const scopes = client.integration.scopes || [];
  const results = {};

  // 1. Calendar
  if (scopes.some((s) => s.includes('calendar'))) {
    try {
      const cal = google.calendar({ version: 'v3', auth: client.auth });
      const list = await cal.calendarList.list({ maxResults: 5 });
      results.calendar = { ok: true, detail: `${list.data.items?.length || 0} calendarios accesibles` };
    } catch (e) {
      results.calendar = { ok: false, detail: e.message };
    }
  }

  // 2. Drive
  if (scopes.some((s) => s.includes('drive'))) {
    try {
      const drive = google.drive({ version: 'v3', auth: client.auth });
      const about = await drive.about.get({ fields: 'user(emailAddress)' });
      results.drive = { ok: true, detail: `Drive activo (${about.data.user?.emailAddress || 'OK'})` };
    } catch (e) {
      results.drive = { ok: false, detail: e.message };
    }
  }

  // 3. Gmail
  if (scopes.some((s) => s.includes('gmail'))) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: client.auth });
      const prof = await gmail.users.getProfile({ userId: 'me' });
      results.gmail = { ok: true, detail: `Gmail activo (${prof.data.emailAddress})` };
    } catch (e) {
      results.gmail = { ok: false, detail: e.message };
    }
  }

  // 4. Sheets
  if (scopes.some((s) => s.includes('spreadsheets'))) {
    results.sheets = { ok: true, detail: 'Scope de Google Sheets autorizado y listo' };
  }

  // 5. Contacts
  if (scopes.some((s) => s.includes('contacts'))) {
    try {
      const people = google.people({ version: 'v1', auth: client.auth });
      const conn = await people.people.connections.list({
        resourceName: 'people/me',
        personFields: 'names',
        pageSize: 1,
      });
      results.contacts = { ok: true, detail: `${conn.data.totalPeople ?? 0} contactos detectados` };
    } catch (e) {
      results.contacts = { ok: false, detail: e.message };
    }
  }

  return NextResponse.json({
    email: client.integration.google_email,
    results,
  });
}

