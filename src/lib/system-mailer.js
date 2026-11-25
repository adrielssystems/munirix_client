import { google } from 'googleapis';

function encodeMimeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(String(subject || ''), 'utf8').toString('base64')}?=`;
}

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function isSystemMailerConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN_SYSTEM
  );
}

function createSystemGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN_SYSTEM,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Envía un correo transaccional del sistema usando la cuenta oficial de Munirix (adriels.systems@gmail.com).
 */
export async function sendSystemEmail({ to, subject, html, text }) {
  if (!isSystemMailerConfigured()) {
    return { skipped: true, reason: 'system_mailer_not_configured' };
  }
  if (!to || !subject) {
    throw new Error('Se requieren destinatario (to) y asunto (subject).');
  }

  const fromEmail = process.env.SYSTEM_GMAIL_FROM || 'adriels.systems@gmail.com';
  const fromHeader = fromEmail.includes('<') ? fromEmail : `Munirix <${fromEmail}>`;
  const boundary = `munirix_${Date.now().toString(36)}`;

  const plainBody = text || String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const htmlBody = html || `<p>${plainBody}</p>`;

  const rawMessage = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${encodeMimeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainBody, 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody, 'utf8').toString('base64'),
    '',
    `--${boundary}--`,
  ].join('\r\n');

  const gmail = createSystemGmailClient();
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: toBase64Url(rawMessage),
    },
  });

  return { ok: true, id: res.data?.id || null };
}

/**
 * Envía el correo de bienvenida a un nuevo cliente/tenant al crear su cuenta en Munirix.
 */
export async function sendWelcomeEmail({ to, name, workspaceName }) {
  const clientUrl = process.env.NEXT_PUBLIC_CLIENT_URL || 'https://client.munirix.net';
  const safeName = String(name || 'Hola').replace(/[<>&"]/g, '');
  const safeWorkspace = String(workspaceName || 'tu espacio en Munirix').replace(/[<>&"]/g, '');

  const subject = `Bienvenido a Munirix, ${safeName}`;
  const text = [
    `Hola ${safeName},`,
    '',
    `Tu espacio "${safeWorkspace}" en Munirix ya está listo.`,
    'Desde tu workspace podrás conectar WhatsApp, Google Calendar, Gmail, Drive y el modelo de IA que prefieras (Gemini, DeepSeek, OpenAI o Claude).',
    '',
    `Ingresar a tu workspace: ${clientUrl}/dashboard`,
    '',
    '— Equipo de Munirix (munirix.net)',
  ].join('\n');

  const html = `
    <div style="background:#07090e;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f2f6fc;">
      <div style="max-width:540px;margin:0 auto;background:#0d121b;border:1px solid rgba(154,176,201,0.18);border-radius:16px;padding:32px;">
        <div style="font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#38c6ec;font-weight:600;margin-bottom:12px;">
          Munirix · munirix.net
        </div>
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#f2f6fc;">
          Tu espacio en Munirix ya está listo, ${safeName}
        </h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#9ab0c9;">
          Creamos <strong style="color:#f2f6fc;">${safeWorkspace}</strong> con tu entorno aislado listo para conectar WhatsApp, Google Calendar, Gmail, Drive y el motor de IA que prefieras.
        </p>
        <div style="margin:24px 0;">
          <a href="${clientUrl}/dashboard" style="display:inline-block;background:#f2f6fc;color:#07090e;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:9999px;">
            Abrir mi Workspace →
          </a>
        </div>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#64768d;border-top:1px solid rgba(154,176,201,0.12);padding-top:16px;">
          Enviado automáticamente desde adriels.systems@gmail.com · Munirix by Adriel's Systems
        </p>
      </div>
    </div>
  `;

  return sendSystemEmail({ to, subject, html, text });
}
