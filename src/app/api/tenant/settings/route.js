import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';
import { encryptSecret, maskSecret } from '@/lib/crypto';
import { LLM_PROVIDER_CATALOG } from '@/lib/ai/provider';
import { isPlatformGoogleOAuthConfigured, GOOGLE_CONSOLE_GUIDE, GOOGLE_PRODUCT_SCOPES } from '@/lib/google/auth';
import { listTenantGoogleCalendars } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { tenantId, tenant } = ctx;

  const [aiRes, metaRes, googleRes, servicesRes, rulesRes] = await Promise.all([
    query(`SELECT * FROM tenant_ai_configs WHERE tenant_id = $1 LIMIT 1`, [tenantId]),
    query(`SELECT * FROM tenant_meta_configs WHERE tenant_id = $1`, [tenantId]),
    query(`SELECT * FROM tenant_google_integrations WHERE tenant_id = $1 LIMIT 1`, [tenantId]),
    query(`SELECT * FROM services WHERE tenant_id = $1 ORDER BY is_active DESC, name ASC`, [tenantId]),
    query(`SELECT * FROM availability_rules WHERE tenant_id = $1 ORDER BY day_of_week ASC, start_time ASC`, [tenantId]),
  ]);

  const aiRow = aiRes.rows[0] || {
    enabled: true,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    use_platform_key: true,
    temperature: 0.3,
    system_prompt: '',
    knowledge_base: '',
    triage_enabled: true,
    triage_prompt: '',
    handoff_keywords: ['humano', 'asesor', 'emergencia'],
    memory_window: 16,
    provider_keys_encrypted: {},
  };

  const vault = aiRow.provider_keys_encrypted || {};
  const maskedProviderKeys = {};
  for (const provId of Object.keys(LLM_PROVIDER_CATALOG)) {
    const enc = vault[provId] || (aiRow.provider === provId ? aiRow.api_key_encrypted : null);
    maskedProviderKeys[provId] = {
      configured: Boolean(enc),
      masked: enc ? maskSecret(enc) : '',
    };
  }

  const whatsappCfg = metaRes.rows.find((r) => r.channel === 'whatsapp') || null;
  const googleRow = googleRes.rows[0] || null;
  let googleCalendars = [];
  if (googleRow?.status === 'connected') {
    googleCalendars = await listTenantGoogleCalendars(tenantId).catch(() => []);
  }

  return NextResponse.json({
    tenant,
    aiConfig: {
      enabled: aiRow.enabled,
      provider: aiRow.provider,
      model: aiRow.model,
      use_platform_key: aiRow.use_platform_key,
      masked_provider_keys: maskedProviderKeys,
      temperature: Number(aiRow.temperature ?? 0.3),
      system_prompt: aiRow.system_prompt || '',
      knowledge_base: aiRow.knowledge_base || '',
      triage_enabled: aiRow.triage_enabled ?? true,
      triage_prompt: aiRow.triage_prompt || '',
      handoff_keywords: aiRow.handoff_keywords || [],
      memory_window: aiRow.memory_window || 16,
    },
    whatsappConfig: whatsappCfg
      ? {
          whatsapp_provider: whatsappCfg.whatsapp_provider || 'evolution',
          evolution_api_url: whatsappCfg.evolution_api_url || process.env.EVOLUTION_API_URL || '',
          evolution_instance: whatsappCfg.evolution_instance || tenant.slug || '',
          has_evolution_api_key: Boolean(whatsappCfg.evolution_api_key_encrypted),
          masked_evolution_api_key: maskSecret(whatsappCfg.evolution_api_key_encrypted),
          phone_number_id: whatsappCfg.phone_number_id || '',
          waba_id: whatsappCfg.waba_id || '',
          verify_token: whatsappCfg.verify_token || '',
          bot_enabled: whatsappCfg.bot_enabled ?? true,
          is_active: whatsappCfg.is_active ?? true,
          has_access_token: Boolean(whatsappCfg.access_token),
          masked_access_token: maskSecret(whatsappCfg.access_token),
          templates_config: whatsappCfg.templates_config || {},
        }
      : {
          whatsapp_provider: 'evolution',
          evolution_api_url: process.env.EVOLUTION_API_URL || '',
          evolution_instance: tenant.slug || '',
          has_evolution_api_key: false,
          masked_evolution_api_key: '',
          phone_number_id: '',
          waba_id: '',
          verify_token: '',
          bot_enabled: true,
          is_active: true,
          has_access_token: false,
          masked_access_token: '',
          templates_config: {},
        },
    googleIntegration: googleRow
      ? {
          status: googleRow.status,
          google_email: googleRow.google_email,
          calendar_id: googleRow.calendar_id || 'primary',
          calendar_sync_enabled: googleRow.calendar_sync_enabled ?? true,
          create_meet_links: googleRow.create_meet_links ?? false,
          enabled_products: googleRow.enabled_products || ['calendar'],
          custom_client_id: googleRow.custom_client_id || '',
          has_custom_secret: Boolean(googleRow.custom_client_secret_encrypted),
          masked_custom_secret: maskSecret(googleRow.custom_client_secret_encrypted),
          last_synced_at: googleRow.last_synced_at,
          last_error: googleRow.last_error,
        }
      : {
          status: 'disconnected',
          google_email: null,
          calendar_id: 'primary',
          calendar_sync_enabled: true,
          create_meet_links: false,
          enabled_products: ['calendar'],
          custom_client_id: '',
          has_custom_secret: false,
          masked_custom_secret: '',
        },
    googleOAuthReady:
      isPlatformGoogleOAuthConfigured() ||
      Boolean(googleRow?.custom_client_id && googleRow?.custom_client_secret_encrypted),
    platformGoogleOAuthReady: isPlatformGoogleOAuthConfigured(),
    googleConsoleGuide: GOOGLE_CONSOLE_GUIDE,
    googleProductScopes: GOOGLE_PRODUCT_SCOPES,
    googleCalendars,
    providersCatalog: LLM_PROVIDER_CATALOG,
    services: servicesRes.rows,
    availabilityRules: rulesRes.rows,
  });
}

export async function PATCH(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const body = await req.json();
    const { tenantId } = ctx;

    // 1. Datos generales del Tenant
    if (body.tenant) {
      await query(
        `UPDATE tenants
         SET name = COALESCE($1, name),
             timezone = COALESCE($2, timezone),
             branding = COALESCE($3::jsonb, branding),
             updated_at = NOW()
         WHERE id = $4`,
        [
          body.tenant.name || null,
          body.tenant.timezone || null,
          body.tenant.branding ? JSON.stringify(body.tenant.branding) : null,
          tenantId,
        ]
      );
    }

    // 2. Configuración Multi-LLM + Bóveda de API Keys por proveedor
    if (body.aiConfig) {
      const ai = body.aiConfig;
      const existingAi = await query(
        `SELECT provider_keys_encrypted FROM tenant_ai_configs WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      const mergedVault = { ...(existingAi.rows[0]?.provider_keys_encrypted || {}) };

      if (ai.provider_keys_input && typeof ai.provider_keys_input === 'object') {
        for (const [prov, rawKey] of Object.entries(ai.provider_keys_input)) {
          if (typeof rawKey === 'string' && rawKey.trim()) {
            mergedVault[prov] = encryptSecret(rawKey.trim());
          }
        }
      }
      if (ai.new_api_key && ai.new_api_key.trim()) {
        mergedVault[ai.provider || 'gemini'] = encryptSecret(ai.new_api_key.trim());
      }

      const activeKeyEnc = mergedVault[ai.provider || 'gemini'] || null;

      await query(
        `INSERT INTO tenant_ai_configs (
           tenant_id, enabled, provider, model, use_platform_key, api_key_encrypted,
           provider_keys_encrypted, temperature, system_prompt, knowledge_base,
           triage_enabled, triage_prompt, handoff_keywords, memory_window, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (tenant_id)
         DO UPDATE SET
           enabled = EXCLUDED.enabled,
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           use_platform_key = EXCLUDED.use_platform_key,
           api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, tenant_ai_configs.api_key_encrypted),
           provider_keys_encrypted = EXCLUDED.provider_keys_encrypted,
           temperature = EXCLUDED.temperature,
           system_prompt = EXCLUDED.system_prompt,
           knowledge_base = EXCLUDED.knowledge_base,
           triage_enabled = EXCLUDED.triage_enabled,
           triage_prompt = EXCLUDED.triage_prompt,
           handoff_keywords = EXCLUDED.handoff_keywords,
           memory_window = EXCLUDED.memory_window,
           updated_at = NOW()`,
        [
          tenantId,
          Boolean(ai.enabled ?? true),
          String(ai.provider || 'gemini'),
          String(ai.model || 'gemini-2.5-flash'),
          Boolean(ai.use_platform_key ?? true),
          activeKeyEnc,
          JSON.stringify(mergedVault),
          Number(ai.temperature ?? 0.3),
          String(ai.system_prompt || ''),
          String(ai.knowledge_base || ''),
          Boolean(ai.triage_enabled ?? true),
          String(ai.triage_prompt || ''),
          Array.isArray(ai.handoff_keywords) ? ai.handoff_keywords : ['humano', 'asesor', 'emergencia'],
          Number(ai.memory_window || 16),
        ]
      );
    }

    // 3. WhatsApp Dual-Provider (Evolution API o Meta Cloud API)
    if (body.whatsappConfig) {
      const wa = body.whatsappConfig;
      const encryptedMetaToken = wa.new_access_token ? encryptSecret(wa.new_access_token.trim()) : null;
      const encryptedEvoKey = wa.new_evolution_api_key ? encryptSecret(wa.new_evolution_api_key.trim()) : null;

      await query(
        `INSERT INTO tenant_meta_configs (
           tenant_id, channel, whatsapp_provider,
           evolution_api_url, evolution_instance, evolution_api_key_encrypted,
           phone_number_id, waba_id, access_token, verify_token,
           bot_enabled, is_active, templates_config, updated_at
         )
         VALUES ($1, 'whatsapp', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
         ON CONFLICT (tenant_id, channel)
         DO UPDATE SET
           whatsapp_provider = EXCLUDED.whatsapp_provider,
           evolution_api_url = EXCLUDED.evolution_api_url,
           evolution_instance = EXCLUDED.evolution_instance,
           evolution_api_key_encrypted = COALESCE(EXCLUDED.evolution_api_key_encrypted, tenant_meta_configs.evolution_api_key_encrypted),
           phone_number_id = EXCLUDED.phone_number_id,
           waba_id = EXCLUDED.waba_id,
           access_token = COALESCE(EXCLUDED.access_token, tenant_meta_configs.access_token),
           verify_token = EXCLUDED.verify_token,
           bot_enabled = EXCLUDED.bot_enabled,
           is_active = EXCLUDED.is_active,
           templates_config = EXCLUDED.templates_config,
           updated_at = NOW()`,
        [
          tenantId,
          wa.whatsapp_provider === 'meta' ? 'meta' : 'evolution',
          wa.evolution_api_url ? String(wa.evolution_api_url).trim() : null,
          wa.evolution_instance ? String(wa.evolution_instance).trim() : null,
          encryptedEvoKey,
          wa.phone_number_id || null,
          wa.waba_id || null,
          encryptedMetaToken,
          wa.verify_token || null,
          Boolean(wa.bot_enabled ?? true),
          Boolean(wa.is_active ?? true),
          JSON.stringify(wa.templates_config || {}),
        ]
      );
    }

    // 4. Google Cloud BYO OAuth + Preferencias de sincronización
    if (body.googleIntegration) {
      const g = body.googleIntegration;
      const encryptedSecret = g.new_custom_client_secret
        ? encryptSecret(g.new_custom_client_secret.trim())
        : null;

      await query(
        `INSERT INTO tenant_google_integrations (
           tenant_id, custom_client_id, custom_client_secret_encrypted,
           calendar_id, calendar_sync_enabled, create_meet_links, enabled_products, updated_at
         )
         VALUES ($1, $2, $3, COALESCE($4, 'primary'), COALESCE($5, true), COALESCE($6, false), COALESCE($7::jsonb, '["calendar"]'::jsonb), NOW())
         ON CONFLICT (tenant_id)
         DO UPDATE SET
           custom_client_id = COALESCE(EXCLUDED.custom_client_id, tenant_google_integrations.custom_client_id),
           custom_client_secret_encrypted = COALESCE(EXCLUDED.custom_client_secret_encrypted, tenant_google_integrations.custom_client_secret_encrypted),
           calendar_id = COALESCE($4, tenant_google_integrations.calendar_id),
           calendar_sync_enabled = COALESCE($5, tenant_google_integrations.calendar_sync_enabled),
           create_meet_links = COALESCE($6, tenant_google_integrations.create_meet_links),
           enabled_products = COALESCE($7::jsonb, tenant_google_integrations.enabled_products),
           updated_at = NOW()`,
        [
          tenantId,
          g.custom_client_id !== undefined ? String(g.custom_client_id).trim() || null : null,
          encryptedSecret,
          g.calendar_id || null,
          g.calendar_sync_enabled !== undefined ? Boolean(g.calendar_sync_enabled) : null,
          g.create_meet_links !== undefined ? Boolean(g.create_meet_links) : null,
          Array.isArray(g.enabled_products) ? JSON.stringify(g.enabled_products) : null,
        ]
      );
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

