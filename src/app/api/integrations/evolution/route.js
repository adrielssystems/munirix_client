import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';
import { decryptSecret } from '@/lib/crypto';
import {
  getEvolutionConnectionState,
  createEvolutionInstance,
  connectEvolutionInstance,
  setEvolutionWebhook,
} from '@/lib/meta/evolution';

export const dynamic = 'force-dynamic';

async function getTenantEvolutionCreds(tenantId) {
  const res = await query(
    `SELECT evolution_api_url, evolution_instance, evolution_api_key_encrypted
     FROM tenant_meta_configs
     WHERE tenant_id = $1 AND channel = 'whatsapp'
     LIMIT 1`,
    [tenantId]
  );
  const row = res.rows[0];
  const apiUrl = row?.evolution_api_url || process.env.EVOLUTION_API_URL || '';
  const apiKey = decryptSecret(row?.evolution_api_key_encrypted) || process.env.EVOLUTION_API_KEY || '';
  const instance = row?.evolution_instance || '';
  return { apiUrl, apiKey, instance };
}

/**
 * GET /api/integrations/evolution — Consulta el estado de conexión de la instancia del tenant.
 */
export async function GET() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const creds = await getTenantEvolutionCreds(ctx.tenantId);
  if (!creds.apiUrl || !creds.instance || !creds.apiKey) {
    return NextResponse.json({
      configured: false,
      state: 'unconfigured',
      message: 'Guarda primero la URL de Evolution API, el nombre de instancia y la API Key.',
    });
  }

  try {
    const data = await getEvolutionConnectionState(creds);
    const state = data?.instance?.state || data?.state || 'unknown';
    return NextResponse.json({ configured: true, state, raw: data });
  } catch (error) {
    return NextResponse.json({ configured: true, state: 'error', error: error.message });
  }
}

/**
 * POST /api/integrations/evolution — Acciones: "connect" (crea/obtiene QR) | "webhook" (configura webhook automático)
 */
export async function POST(req) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const body = await req.json();
    const action = body.action || 'connect';
    const creds = await getTenantEvolutionCreds(ctx.tenantId);

    if (!creds.apiUrl || !creds.instance || !creds.apiKey) {
      return NextResponse.json(
        { error: 'Configura y guarda primero la URL, Instancia y API Key de Evolution API.' },
        { status: 400 }
      );
    }

    const { origin } = new URL(req.url);
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.munirix.net'}/api/webhooks/evolution?instance=${encodeURIComponent(
      creds.instance
    )}`;

    if (action === 'webhook') {
      const result = await setEvolutionWebhook({ ...creds, webhookUrl });
      return NextResponse.json({ ok: true, webhookUrl, result });
    }

    // Acción "connect": intentar obtener QR directo; si la instancia no existe, crearla con webhook incluido
    let connectData;
    try {
      connectData = await connectEvolutionInstance(creds);
    } catch {
      connectData = await createEvolutionInstance({ ...creds, webhookUrl });
    }

    const qrBase64 =
      connectData?.base64 ||
      connectData?.qrcode?.base64 ||
      connectData?.code ||
      null;
    const pairingCode = connectData?.pairingCode || connectData?.qrcode?.pairingCode || null;

    return NextResponse.json({
      ok: true,
      qrBase64,
      pairingCode,
      webhookUrl,
      raw: connectData,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


