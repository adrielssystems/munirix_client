import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { query } from '../db.js';
import { decryptSecret } from '../crypto.js';

export const LLM_PROVIDER_CATALOG = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    envKey: 'GEMINI_API_KEY',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    envKey: 'DEEPSEEK_API_KEY',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'],
    envKey: 'OPENAI_API_KEY',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-haiku-latest',
    models: ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest', 'claude-sonnet-4-20250514'],
    envKey: 'ANTHROPIC_API_KEY',
  },
};

function instantiateModel(provider, modelName, apiKey) {
  const catalog = LLM_PROVIDER_CATALOG[provider];
  if (!catalog) {
    throw new Error(`Proveedor LLM no soportado: ${provider}`);
  }
  const resolvedModel = modelName || catalog.defaultModel;
  const resolvedKey = apiKey || process.env[catalog.envKey];

  if (!resolvedKey) {
    throw new Error(
      `No hay API key configurada para ${catalog.label} (${catalog.envKey}). Configura la clave del tenant o la variable de entorno.`
    );
  }

  switch (provider) {
    case 'gemini': {
      const google = createGoogleGenerativeAI({ apiKey: resolvedKey });
      return google(resolvedModel);
    }
    case 'deepseek': {
      const deepseek = createDeepSeek({ apiKey: resolvedKey });
      return deepseek(resolvedModel);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey: resolvedKey });
      return openai(resolvedModel);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: resolvedKey });
      return anthropic(resolvedModel);
    }
    default:
      throw new Error(`Proveedor LLM no soportado: ${provider}`);
  }
}

/**
 * Resuelve la configuración y el modelo LLM ejecutable para un Tenant específico.
 * Soporta clave propia cifrada (BYOK) o fallback a las claves de plataforma (Gemini / DeepSeek).
 */
export async function resolveTenantLLM(tenantId) {
  const [aiRes, platformRes] = await Promise.all([
    query(`SELECT * FROM tenant_ai_configs WHERE tenant_id = $1 LIMIT 1`, [tenantId]),
    query(`SELECT value FROM platform_settings WHERE key = 'ai_defaults' LIMIT 1`),
  ]);

  const platformDefaults = platformRes.rows[0]?.value || {
    admin_provider: 'gemini',
    admin_model: 'gemini-2.5-flash',
    fallback_provider: 'deepseek',
    fallback_model: 'deepseek-chat',
  };

  const cfg = aiRes.rows[0] || {
    enabled: true,
    provider: platformDefaults.admin_provider || 'gemini',
    model: platformDefaults.admin_model || 'gemini-2.5-flash',
    use_platform_key: true,
    temperature: 0.3,
    system_prompt: '',
    knowledge_base: '',
    triage_enabled: true,
    triage_prompt: '',
    handoff_keywords: ['humano', 'asesor', 'emergencia'],
    memory_window: 16,
  };

  const vault = cfg.provider_keys_encrypted || {};
  const provider = cfg.provider || 'gemini';
  const modelName = cfg.model || LLM_PROVIDER_CATALOG[provider]?.defaultModel;

  const tenantVaultKey = vault[provider] ? decryptSecret(vault[provider]) : null;
  const tenantLegacyKey = cfg.api_key_encrypted ? decryptSecret(cfg.api_key_encrypted) : null;
  const tenantKey = !cfg.use_platform_key ? tenantVaultKey || tenantLegacyKey : null;

  // Intentar proveedor seleccionado del tenant; si usa clave de plataforma y falta, intentar fallback (Gemini <-> DeepSeek)
  try {
    const model = instantiateModel(provider, modelName, tenantKey);
    return { model, provider, modelName, config: cfg };
  } catch (primaryErr) {
    if (cfg.use_platform_key && platformDefaults.fallback_provider && platformDefaults.fallback_provider !== provider) {
      const fbProvider = platformDefaults.fallback_provider;
      const fbModel = platformDefaults.fallback_model;
      const fbKey = process.env[LLM_PROVIDER_CATALOG[fbProvider]?.envKey];
      if (fbKey) {
        const model = instantiateModel(fbProvider, fbModel, fbKey);
        return { model, provider: fbProvider, modelName: fbModel, config: cfg, usedFallback: true };
      }
    }
    throw primaryErr;
  }
}

/**
 * Resuelve el modelo LLM para el Panel Admin y tareas internas del Backend (Gemini / DeepSeek).
 */
export async function resolveAdminLLM() {
  const platformRes = await query(`SELECT value FROM platform_settings WHERE key = 'ai_defaults' LIMIT 1`);
  const defaults = platformRes.rows[0]?.value || {
    admin_provider: 'gemini',
    admin_model: 'gemini-2.5-flash',
    fallback_provider: 'deepseek',
    fallback_model: 'deepseek-chat',
  };

  try {
    const model = instantiateModel(defaults.admin_provider, defaults.admin_model);
    return { model, provider: defaults.admin_provider, modelName: defaults.admin_model };
  } catch {
    const model = instantiateModel(defaults.fallback_provider, defaults.fallback_model);
    return { model, provider: defaults.fallback_provider, modelName: defaults.fallback_model, usedFallback: true };
  }
}

/**
 * Fallback en tiempo de ejecución cuando el proveedor principal falla (ej. cuota 429 en Gemini Free Tier).
 */
export function resolveFallbackLLM(failedProvider = 'gemini') {
  const fbProvider = failedProvider === 'deepseek' ? 'gemini' : 'deepseek';
  const catalog = LLM_PROVIDER_CATALOG[fbProvider];
  const fbKey = process.env[catalog?.envKey];
  if (!catalog || !fbKey) return null;
  const model = instantiateModel(fbProvider, catalog.defaultModel, fbKey);
  return { model, provider: fbProvider, modelName: catalog.defaultModel };
}

