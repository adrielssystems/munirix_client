import { query } from './db.js';

/**
 * Obtiene la configuración de Meta para un canal e identificador específico (Page ID o Phone Number ID).
 */
export async function getTenantByMetaIdentifier(channel, identifier) {
  let sql = '';
  let params = [];

  if (channel === 'whatsapp') {
    sql = `
      SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug, c.*
      FROM tenant_meta_configs c
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.channel = 'whatsapp'
        AND c.phone_number_id = $1
        AND c.is_active = true
        AND t.status = 'active'
      LIMIT 1
    `;
    params = [identifier];
  } else if (channel === 'instagram' || channel === 'facebook') {
    sql = `
      SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug, c.*
      FROM tenant_meta_configs c
      JOIN tenants t ON t.id = c.tenant_id
      WHERE (c.channel = $1)
        AND (c.page_id = $2 OR c.instagram_account_id = $2)
        AND c.is_active = true
        AND t.status = 'active'
      LIMIT 1
    `;
    params = [channel, identifier];
  }

  if (!sql) return null;

  const res = await query(sql, params);
  return res.rows[0] || null;
}

/**
 * Obtiene un Tenant activo a partir del nombre de instancia de Evolution API.
 */
export async function getTenantByEvolutionInstance(instanceName) {
  if (!instanceName) return null;
  const res = await query(
    `SELECT t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug, c.*
     FROM tenant_meta_configs c
     JOIN tenants t ON t.id = c.tenant_id
     WHERE c.channel = 'whatsapp'
       AND c.evolution_instance = $1
       AND c.is_active = true
       AND t.status = 'active'
     LIMIT 1`,
    [String(instanceName).trim()]
  );
  return res.rows[0] || null;
}

export async function getTenantBySlug(slug) {
  const res = await query(
    `SELECT * FROM tenants WHERE slug = $1 AND status = 'active' LIMIT 1`,
    [slug]
  );
  return res.rows[0] || null;
}

export async function getTenantById(tenantId) {
  const res = await query(
    `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  return res.rows[0] || null;
}

