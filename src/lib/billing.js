import { query } from './db.js';

export const PLANS_CATALOG = {
  profesional: {
    code: 'profesional',
    name: 'Profesional',
    priceUsd: 40,
    tagline: '1 WhatsApp QR · Agente IA 24/7 · Google Calendar + Meet',
  },
  negocio: {
    code: 'negocio',
    name: 'Negocio',
    priceUsd: 70,
    tagline: 'Múltiples asesores · Google Workspace completo · Seguimiento',
  },
  empresa: {
    code: 'empresa',
    name: 'Empresa',
    priceUsd: 150,
    tagline: 'Meta Cloud API Oficial · Múltiples números · Soporte prioritario',
  },
};

export const DEFAULT_BILLING_ACCOUNTS = {
  paypal: {
    enabled: true,
    email: 'pagos@adrielssystems.com',
    checkout_url: 'https://paypal.me/adrielssystems',
    instructions: 'Envía el monto exacto en USD a nuestra cuenta PayPal y reporta el ID de transacción.',
  },
  binance: {
    enabled: true,
    binance_id: 'Configurar en Partner Admin',
    email: 'pagos@adrielssystems.com',
    network: 'Binance Pay (USDT / USDC)',
    instructions: 'Transfiere vía Binance Pay sin comisiones y pega tu Order ID / TxID.',
  },
  zelle: {
    enabled: true,
    email: 'pagos@adrielssystems.com',
    holder: "Adriel's Systems",
    instructions: 'Envía el monto en USD por Zelle e indica el titular y número de confirmación.',
  },
  pago_movil: {
    enabled: true,
    bank: 'Configurar Banco',
    document: 'V-00000000',
    phone: '0414-0000000',
    rate_note: 'Consultar tasa BCV del día antes de transferir.',
    instructions: 'Realiza el Pago Móvil y reporta los últimos 6 dígitos de referencia y banco emisor.',
  },
  whatsapp_support: '584222476127',
};

let schemaEnsured = false;

export async function ensureBillingSchema() {
  if (schemaEnsured) return;
  await query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS plan_code VARCHAR(40) DEFAULT 'profesional',
      ADD COLUMN IF NOT EXISTS trial_starts_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS payment_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      plan_code VARCHAR(40) NOT NULL,
      amount_usd NUMERIC(10, 2) NOT NULL,
      payment_method VARCHAR(30) NOT NULL,
      reference_code VARCHAR(150) NOT NULL,
      payer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      certified_by UUID REFERENCES users(id) ON DELETE SET NULL,
      certified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(
    `INSERT INTO platform_settings (key, value) VALUES ('billing_accounts', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DEFAULT_BILLING_ACCOUNTS)]
  );
  schemaEnsured = true;
}

export async function getBillingAccounts() {
  await ensureBillingSchema();
  const res = await query(`SELECT value FROM platform_settings WHERE key = 'billing_accounts' LIMIT 1`);
  return { ...DEFAULT_BILLING_ACCOUNTS, ...(res.rows[0]?.value || {}) };
}
