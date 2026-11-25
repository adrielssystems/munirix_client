import { query } from '../db.js';
import { decryptSecret } from '../crypto.js';
import { sendEvolutionText } from './evolution.js';

const GRAPH_VERSION = 'v21.0';

/**
 * Obtiene la configuración activa de WhatsApp del tenant (soporta Evolution API o Meta Cloud API).
 */
export async function getTenantWhatsAppTransport(tenantId) {
  const res = await query(
    `SELECT whatsapp_provider,
            phone_number_id, access_token, waba_id, templates_config,
            evolution_api_url, evolution_instance, evolution_api_key_encrypted
     FROM tenant_meta_configs
     WHERE tenant_id = $1 AND channel = 'whatsapp' AND is_active = true
     LIMIT 1`,
    [tenantId]
  );
  const row = res.rows[0];
  if (!row) return null;

  const provider = row.whatsapp_provider || (row.evolution_instance ? 'evolution' : 'meta');

  if (provider === 'evolution') {
    const apiUrl = row.evolution_api_url || process.env.EVOLUTION_API_URL || '';
    const apiKey = decryptSecret(row.evolution_api_key_encrypted) || process.env.EVOLUTION_API_KEY || '';
    if (!apiUrl || !row.evolution_instance || !apiKey) return null;
    return {
      provider: 'evolution',
      apiUrl,
      instance: row.evolution_instance,
      apiKey,
    };
  }

  if (!row.phone_number_id || !row.access_token) return null;
  return {
    provider: 'meta',
    phoneNumberId: row.phone_number_id,
    accessToken: decryptSecret(row.access_token),
    wabaId: row.waba_id,
    templatesConfig: row.templates_config || {},
  };
}

async function callWhatsAppGraph(creds, payload) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.message || `Meta Graph API error ${res.status}`;
    throw new Error(errMsg);
  }
  return {
    messageId: data?.messages?.[0]?.id || null,
    raw: data,
  };
}

async function persistOutboundMessage({
  tenantId,
  conversationId,
  senderType = 'bot',
  senderId = null,
  content,
  messageType = 'text',
  externalMessageId = null,
  deliveryStatus = 'sent',
  payload = {},
}) {
  if (!conversationId) return;
  await query(
    `INSERT INTO messages (tenant_id, conversation_id, sender_type, sender_id, content, message_type, external_message_id, delivery_status, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (tenant_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING`,
    [
      tenantId,
      conversationId,
      senderType,
      senderId,
      content,
      messageType,
      externalMessageId,
      deliveryStatus,
      JSON.stringify(payload),
    ]
  );

  await query(
    `UPDATE conversations
     SET last_message_preview = $1, last_message_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3`,
    [content.slice(0, 180), conversationId, tenantId]
  );
}

/**
 * Envía un mensaje de texto usando el transporte activo del tenant (Evolution API o Meta Cloud API).
 */
export async function sendWhatsAppText({
  tenantId,
  toPhone,
  text,
  conversationId = null,
  senderType = 'bot',
  senderId = null,
}) {
  const transport = await getTenantWhatsAppTransport(tenantId);
  let externalId = null;
  let deliveryStatus = 'simulated_no_whatsapp_config';

  if (transport?.provider === 'evolution') {
    const sent = await sendEvolutionText({
      apiUrl: transport.apiUrl,
      apiKey: transport.apiKey,
      instance: transport.instance,
      toPhone,
      text,
    });
    externalId = sent.messageId;
    deliveryStatus = 'sent_evolution';
  } else if (transport?.provider === 'meta') {
    const sent = await callWhatsAppGraph(transport, {
      to: toPhone,
      type: 'text',
      text: { preview_url: false, body: text },
    });
    externalId = sent.messageId;
    deliveryStatus = 'sent_meta';
  }

  await persistOutboundMessage({
    tenantId,
    conversationId,
    senderType,
    senderId,
    content: text,
    messageType: 'text',
    externalMessageId: externalId,
    deliveryStatus,
    payload: { provider: transport?.provider || 'none' },
  });

  return {
    sent: Boolean(transport),
    provider: transport?.provider || null,
    messageId: externalId,
    deliveryStatus,
  };
}

/**
 * Envía mensaje interactivo con botones (en Meta usa botones nativos; en Evolution envía opciones claras).
 */
export async function sendWhatsAppButtons({
  tenantId,
  toPhone,
  bodyText,
  buttons = [],
  conversationId = null,
}) {
  const transport = await getTenantWhatsAppTransport(tenantId);
  let externalId = null;
  let deliveryStatus = 'simulated_no_whatsapp_config';

  if (transport?.provider === 'evolution') {
    const optionsText = buttons.map((b, i) => `${i + 1}. *${b.title}*`).join('\n');
    const composed = `${bodyText}\n\nResponde con:\n${optionsText}`;
    const sent = await sendEvolutionText({
      apiUrl: transport.apiUrl,
      apiKey: transport.apiKey,
      instance: transport.instance,
      toPhone,
      text: composed,
    });
    externalId = sent.messageId;
    deliveryStatus = 'sent_evolution';
  } else if (transport?.provider === 'meta') {
    const sent = await callWhatsAppGraph(transport, {
      to: toPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
    externalId = sent.messageId;
    deliveryStatus = 'sent_meta';
  }

  await persistOutboundMessage({
    tenantId,
    conversationId,
    senderType: 'bot',
    content: bodyText,
    messageType: 'interactive',
    externalMessageId: externalId,
    deliveryStatus,
    payload: { buttons, provider: transport?.provider || 'none' },
  });

  return { sent: Boolean(transport), provider: transport?.provider || null, messageId: externalId, deliveryStatus };
}

/**
 * Envía plantilla aprobada en Meta Cloud API, o texto directo en Evolution API.
 */
export async function sendWhatsAppTemplate({
  tenantId,
  toPhone,
  templateName,
  languageCode = 'es',
  bodyParams = [],
  fallbackText = '',
  conversationId = null,
}) {
  const transport = await getTenantWhatsAppTransport(tenantId);

  if (transport?.provider === 'evolution') {
    return sendWhatsAppText({
      tenantId,
      toPhone,
      text: fallbackText || `[Notificación: ${templateName}]`,
      conversationId,
    });
  }

  let externalId = null;
  let deliveryStatus = 'simulated_no_whatsapp_config';

  if (transport?.provider === 'meta') {
    if (templateName) {
      const components =
        bodyParams.length > 0
          ? [{ type: 'body', parameters: bodyParams.map((p) => ({ type: 'text', text: String(p) })) }]
          : [];
      const sent = await callWhatsAppGraph(transport, {
        to: toPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      });
      externalId = sent.messageId;
      deliveryStatus = 'sent_meta';
    } else if (fallbackText) {
      return sendWhatsAppText({ tenantId, toPhone, text: fallbackText, conversationId });
    }
  }

  await persistOutboundMessage({
    tenantId,
    conversationId,
    senderType: 'bot',
    content: fallbackText || `[Plantilla: ${templateName}]`,
    messageType: 'template',
    externalMessageId: externalId,
    deliveryStatus,
    payload: { templateName, bodyParams, provider: transport?.provider || 'none' },
  });

  return { sent: Boolean(transport), messageId: externalId, deliveryStatus };
}

