import { google } from 'googleapis';
import { query } from '../db.js';
import { encryptSecret, decryptSecret, signState, verifyState } from '../crypto.js';

export const GOOGLE_PRODUCT_SCOPES = {
  calendar: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  gmail: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
  drive: ['https://www.googleapis.com/auth/drive.file'],
  contacts: ['https://www.googleapis.com/auth/contacts.readonly'],
};

export const GOOGLE_CONSOLE_GUIDE = {
  createProjectUrl: 'https://console.cloud.google.com/projectcreate',
  consentScreenUrl: 'https://console.cloud.google.com/apis/credentials/consent',
  credentialsUrl: 'https://console.cloud.google.com/apis/credentials',
  apis: [
    {
      id: 'calendar',
      name: 'Google Calendar API',
      description: 'Sincronización bidireccional de citas, disponibilidad FreeBusy y Google Meet.',
      enableUrl: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    },
    {
      id: 'gmail',
      name: 'Gmail API',
      description: 'Envío de confirmaciones, indicaciones previas y récipes desde el correo de la clínica.',
      enableUrl: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
    },
    {
      id: 'sheets',
      name: 'Google Sheets API',
      description: 'Exportación automática de agenda, leads, métricas y reportes financieros.',
      enableUrl: 'https://console.cloud.google.com/apis/library/sheets.googleapis.com',
    },
    {
      id: 'drive',
      name: 'Google Drive API',
      description: 'Carpetas por paciente para respaldar récipes PDF, consentimientos y fotos.',
      enableUrl: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
    },
    {
      id: 'contacts',
      name: 'Google People / Contacts API',
      description: 'Importación y sincronización de contactos de Google con el CRM.',
      enableUrl: 'https://console.cloud.google.com/apis/library/people.googleapis.com',
    },
  ],
};

const BASE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function isPlatformGoogleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Resuelve Client ID y Client Secret de Google para un tenant:
 * prioriza credenciales propias del tenant (creadas en console.cloud.google.com)
 * y hace fallback a las credenciales globales de la plataforma.
 */
export async function resolveGoogleOAuthApp(tenantId) {
  const res = await query(
    `SELECT custom_client_id, custom_client_secret_encrypted
     FROM tenant_google_integrations
     WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const row = res.rows[0];
  if (row?.custom_client_id && row?.custom_client_secret_encrypted) {
    return {
      clientId: row.custom_client_id.trim(),
      clientSecret: decryptSecret(row.custom_client_secret_encrypted),
      source: 'tenant_custom',
    };
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      source: 'platform',
    };
  }
  return null;
}

export function createOAuth2Client({ clientId, clientSecret, redirectUri }) {
  const fallbackUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXTAUTH_URL || 'https://client.munirix.net'}/api/integrations/google/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri || fallbackUri);
}

export async function buildGoogleAuthUrl({ tenantId, userId, products = ['calendar'], origin }) {
  const appCreds = await resolveGoogleOAuthApp(tenantId);
  if (!appCreds) {
    throw new Error(
      'Faltan credenciales OAuth de Google. Sigue el asistente de Google Cloud Console para ingresar tu Client ID y Client Secret.'
    );
  }

  const validProducts = products.filter((p) => Boolean(GOOGLE_PRODUCT_SCOPES[p]));
  const selected = validProducts.length > 0 ? validProducts : ['calendar'];
  const scopes = Array.from(
    new Set([...BASE_SCOPES, ...selected.flatMap((p) => GOOGLE_PRODUCT_SCOPES[p])])
  );

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${origin || 'https://client.munirix.net'}/api/integrations/google/callback`;
  const oauth2Client = createOAuth2Client({ ...appCreds, redirectUri });

  const state = signState({
    tenantId,
    userId,
    products: selected,
    iat: Date.now(),
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: scopes,
    state,
  });

  return { url, state, scopes, source: appCreds.source };
}

export function parseGoogleState(state) {
  return verifyState(state, 20 * 60 * 1000);
}

/**
 * Obtiene un cliente OAuth2 autenticado para un tenant, refrescando y re-cifrando tokens si expiraron.
 */
export async function getAuthorizedGoogleClient(tenantId) {
  const [appCreds, res] = await Promise.all([
    resolveGoogleOAuthApp(tenantId),
    query(
      `SELECT * FROM tenant_google_integrations WHERE tenant_id = $1 AND status = 'connected' LIMIT 1`,
      [tenantId]
    ),
  ]);

  const integration = res.rows[0];
  if (!appCreds || !integration || !integration.refresh_token_encrypted) return null;

  const oauth2Client = createOAuth2Client(appCreds);
  const accessToken = decryptSecret(integration.access_token_encrypted);
  const refreshToken = decryptSecret(integration.refresh_token_encrypted);

  oauth2Client.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken,
    expiry_date: integration.token_expires_at
      ? new Date(integration.token_expires_at).getTime()
      : undefined,
  });

  oauth2Client.on('tokens', async (tokens) => {
    try {
      const updates = [];
      const vals = [];
      let idx = 1;

      if (tokens.access_token) {
        updates.push(`access_token_encrypted = $${idx++}`);
        vals.push(encryptSecret(tokens.access_token));
      }
      if (tokens.refresh_token) {
        updates.push(`refresh_token_encrypted = $${idx++}`);
        vals.push(encryptSecret(tokens.refresh_token));
      }
      if (tokens.expiry_date) {
        updates.push(`token_expires_at = $${idx++}`);
        vals.push(new Date(tokens.expiry_date).toISOString());
      }
      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        vals.push(tenantId);
        await query(
          `UPDATE tenant_google_integrations SET ${updates.join(', ')} WHERE tenant_id = $${idx}`,
          vals
        );
      }
    } catch (err) {
      console.error('[GOOGLE AUTH] Error guardando tokens refrescados:', err.message);
    }
  });

  return { auth: oauth2Client, integration };
}

