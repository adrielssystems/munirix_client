/**
 * Cliente Evolution API v2 (WhatsApp por instancia para clientes de bajo/medio consumo).
 * Diseñado con la misma interfaz que Meta Cloud API para permitir migración sin fricción.
 */

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

async function evolutionFetch(baseUrl, apiKey, endpoint, options = {}) {
  const cleanUrl = normalizeBaseUrl(baseUrl);
  if (!cleanUrl) throw new Error('Evolution API URL no configurada.');
  if (!apiKey) throw new Error('Evolution API Key no configurada.');

  const res = await fetch(`${cleanUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.response?.message?.[0] ||
      data?.message ||
      data?.error ||
      `Evolution API HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export async function getEvolutionConnectionState({ apiUrl, apiKey, instance }) {
  return evolutionFetch(apiUrl, apiKey, `/instance/connectionState/${encodeURIComponent(instance)}`, {
    method: 'GET',
  });
}

export async function createEvolutionInstance({ apiUrl, apiKey, instance, webhookUrl }) {
  const body = {
    instanceName: instance,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  };
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    };
  }
  return evolutionFetch(apiUrl, apiKey, '/instance/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function connectEvolutionInstance({ apiUrl, apiKey, instance }) {
  return evolutionFetch(apiUrl, apiKey, `/instance/connect/${encodeURIComponent(instance)}`, {
    method: 'GET',
  });
}

export async function setEvolutionWebhook({ apiUrl, apiKey, instance, webhookUrl }) {
  return evolutionFetch(apiUrl, apiKey, `/webhook/set/${encodeURIComponent(instance)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    }),
  });
}

export async function sendEvolutionText({ apiUrl, apiKey, instance, toPhone, text }) {
  const cleanNumber = String(toPhone || '').replace(/[^\d]/g, '');
  if (!cleanNumber) throw new Error('Número de WhatsApp destino inválido.');

  const data = await evolutionFetch(
    apiUrl,
    apiKey,
    `/message/sendText/${encodeURIComponent(instance)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number: cleanNumber,
        text,
        delay: 600,
      }),
    }
  );

  return {
    messageId: data?.key?.id || null,
    raw: data,
  };
}

