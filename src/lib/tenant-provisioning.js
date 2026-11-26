import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { google } from 'googleapis';
import { query, withTransaction } from './db.js';
import { normalizeModules } from './modules.js';
import { sendWelcomeEmail } from './system-mailer.js';

const DEFAULT_MODULES = ['inbox', 'appointments', 'contacts'];

export function slugifyTenantName(input = '') {
  const base = String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return base || 'espacio-munirix';
}

async function generateUniqueSlug(client, baseName) {
  const baseSlug = slugifyTenantName(baseName);
  const existing = await client.query(`SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1`, [baseSlug]);
  if (existing.rowCount === 0) return baseSlug;

  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = crypto.randomBytes(2).toString('hex');
    const candidate = `${baseSlug}-${suffix}`;
    const check = await client.query(`SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1`, [candidate]);
    if (check.rowCount === 0) return candidate;
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
}

function buildDefaultWorkspaceName(name, email) {
  const cleanName = String(name || '').trim();
  if (cleanName) {
    const firstName = cleanName.split(/\s+/)[0];
    return `Espacio de ${firstName}`;
  }
  const emailPrefix = String(email || '').split('@')[0] || 'Munirix';
  return `Espacio de ${emailPrefix}`;
}

export function mapUserRowToSessionPayload(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.avatar_url || null,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    authProvider: row.auth_provider || 'credentials',
    tenantId: row.tenant_id,
    tenantName: row.tenant_name || 'Munirix Platform',
    tenantSlug: row.tenant_slug || null,
    tenantIndustry: row.tenant_industry || 'general',
    tenantTimezone: row.tenant_timezone || 'America/Caracas',
    enabledModules: normalizeModules(row.tenant_modules),
    tenantBranding: row.tenant_branding || {},
    onboardingCompleted: row.role === 'superadmin' ? true : Boolean(row.onboarding_completed),
  };
}

async function selectUserWithTenant(whereSql, params, dbClient = null) {
  const exec = dbClient ? dbClient.query.bind(dbClient) : query;
  const res = await exec(
    `SELECT u.id,
            u.tenant_id,
            u.name,
            u.email,
            u.password_hash,
            u.role,
            u.avatar_url,
            u.auth_provider,
            u.google_sub,
            u.email_verified_at,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            t.status AS tenant_status,
            t.industry AS tenant_industry,
            t.timezone AS tenant_timezone,
            t.enabled_modules AS tenant_modules,
            t.branding AS tenant_branding,
            t.onboarding_completed AS onboarding_completed
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE ${whereSql}
     LIMIT 1`,
    params
  );
  return res.rows[0] || null;
}

async function seedNewTenantResources(client, tenantId) {
  await client.query(
    `INSERT INTO tenant_ai_configs (tenant_id, enabled, provider, model, use_platform_key)
     VALUES ($1, TRUE, 'gemini', 'gemini-2.5-flash', TRUE)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  // Horario laboral por defecto Lunes–Viernes 08:00–17:00
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    await client.query(
      `INSERT INTO availability_rules (tenant_id, day_of_week, start_time, end_time, is_active)
       VALUES ($1, $2, '08:00', '17:00', TRUE)`,
      [tenantId, dayOfWeek]
    );
  }
}

/**
 * Verifica criptográficamente un ID Token JWT emitido por Google One Tap / FedCM.
 */
export async function verifyGoogleIdToken(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID no está configurado en el servidor.');
  }
  if (!credential || typeof credential !== 'string') {
    throw new Error('Credencial de Google inválida.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId);
  const ticket = await oauth2Client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error('Google no devolvió un correo electrónico válido.');
  }
  if (payload.email_verified === false) {
    throw new Error('Tu cuenta de Google debe tener el correo verificado para continuar.');
  }

  return {
    googleSub: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.given_name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null,
  };
}

/**
 * Busca o crea automáticamente un usuario + tenant aislado cuando entra con Google (OAuth o One Tap).
 */
export async function findOrProvisionGoogleUser({ email, name, googleSub, avatarUrl }) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) {
    throw new Error('Se requiere un correo válido de Google.');
  }

  // 1. Buscar primero por google_sub o por correo existente
  let existing = null;
  if (googleSub) {
    existing = await selectUserWithTenant(`u.google_sub = $1`, [googleSub]);
  }
  if (!existing) {
    existing = await selectUserWithTenant(`LOWER(u.email) = $1`, [normalizedEmail]);
  }

  if (existing) {
    if (existing.role !== 'superadmin' && !['active', 'pending_payment'].includes(existing.tenant_status)) {
      throw new Error('El acceso para esta organización está suspendido.');
    }

    const nextProvider = existing.password_hash ? 'hybrid' : 'google';
    await query(
      `UPDATE users
       SET google_sub = COALESCE(google_sub, $1),
           avatar_url = COALESCE($2, avatar_url),
           auth_provider = $3,
           email_verified_at = COALESCE(email_verified_at, NOW()),
           updated_at = NOW()
       WHERE id = $4`,
      [googleSub || null, avatarUrl || null, nextProvider, existing.id]
    );

    const refreshed = await selectUserWithTenant(`u.id = $1`, [existing.id]);
    return mapUserRowToSessionPayload(refreshed);
  }

  // 2. Nuevo usuario -> aprovisionar tenant aislado + usuario admin + configuración inicial
  const displayName = String(name || normalizedEmail.split('@')[0]).trim();
  const workspaceName = buildDefaultWorkspaceName(displayName, normalizedEmail);

  const createdRow = await withTransaction(async (client) => {
    const slug = await generateUniqueSlug(client, workspaceName);

    const tenantRes = await client.query(
      `INSERT INTO tenants (name, slug, status, industry, timezone, enabled_modules, onboarding_completed, account_type)
       VALUES ($1, $2, 'pending_payment', 'general', 'America/Caracas', $3::jsonb, FALSE, 'business')
       RETURNING id`,
      [workspaceName, slug, JSON.stringify(DEFAULT_MODULES)]
    );
    const tenantId = tenantRes.rows[0].id;

    await seedNewTenantResources(client, tenantId);

    const userRes = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, avatar_url, auth_provider, google_sub, email_verified_at)
       VALUES ($1, $2, $3, NULL, 'admin', $4, 'google', $5, NOW())
       RETURNING id`,
      [tenantId, displayName, normalizedEmail, avatarUrl || null, googleSub || null]
    );

    return selectUserWithTenant(`u.id = $1`, [userRes.rows[0].id], client);
  });

  if (process.env.SKIP_WELCOME_EMAIL !== 'true') {
    sendWelcomeEmail({
      to: normalizedEmail,
      name: displayName,
      workspaceName,
    }).catch((err) => {
      console.error('[SYSTEM_MAILER] Error enviando correo de bienvenida (Google):', err.message);
    });
  }

  return mapUserRowToSessionPayload(createdRow);
}

/**
 * Registra un nuevo cliente/tenant mediante correo y contraseña.
 */
export async function registerEmailTenantUser({ name, email, password }) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const displayName = String(name || '').trim() || normalizedEmail.split('@')[0];

  const existing = await query(
    `SELECT id, auth_provider, password_hash FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalizedEmail]
  );

  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    if (!row.password_hash && row.auth_provider === 'google') {
      const err = new Error('Este correo ya está registrado con Google. Usa "Continuar con Google".');
      err.code = 'GOOGLE_ONLY_ACCOUNT';
      throw err;
    }
    const err = new Error('Ya existe una cuenta registrada con este correo. Inicia sesión para continuar.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const workspaceName = buildDefaultWorkspaceName(displayName, normalizedEmail);

  const createdRow = await withTransaction(async (client) => {
    const slug = await generateUniqueSlug(client, workspaceName);

    const tenantRes = await client.query(
      `INSERT INTO tenants (name, slug, status, industry, timezone, enabled_modules, onboarding_completed, account_type)
       VALUES ($1, $2, 'pending_payment', 'general', 'America/Caracas', $3::jsonb, FALSE, 'business')
       RETURNING id`,
      [workspaceName, slug, JSON.stringify(DEFAULT_MODULES)]
    );
    const tenantId = tenantRes.rows[0].id;

    await seedNewTenantResources(client, tenantId);

    const userRes = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role, auth_provider)
       VALUES ($1, $2, $3, $4, 'admin', 'credentials')
       RETURNING id`,
      [tenantId, displayName, normalizedEmail, passwordHash]
    );

    return selectUserWithTenant(`u.id = $1`, [userRes.rows[0].id], client);
  });

  if (process.env.SKIP_WELCOME_EMAIL !== 'true') {
    sendWelcomeEmail({
      to: normalizedEmail,
      name: displayName,
      workspaceName,
    }).catch((err) => {
      console.error('[SYSTEM_MAILER] Error enviando correo de bienvenida (Email):', err.message);
    });
  }

  return mapUserRowToSessionPayload(createdRow);
}
