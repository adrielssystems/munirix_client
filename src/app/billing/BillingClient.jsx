'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SoftAurora from '@/components/ui/SoftAurora';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import LogoutButton from '@/components/ui/LogoutButton';
import styles from './billing.module.css';

const METHODS = [
  { id: 'paypal', label: 'PayPal' },
  { id: 'binance', label: 'Binance Pay' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'pago_movil', label: 'Pago Móvil' },
];

export default function BillingClient({ initialPlan, tenantName, userEmail }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [latestPayment, setLatestPayment] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(initialPlan || 'negocio');
  const [method, setMethod] = useState('paypal');
  const [referenceCode, setReferenceCode] = useState('');
  const [payerDetails, setPayerDetails] = useState({
    holderName: '',
    payerEmail: userEmail || '',
    bank: '',
    phone: '',
  });
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadBilling = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        if (data.tenantStatus === 'active') {
          router.push('/onboarding');
          router.refresh();
          return;
        }
        setPlans(data.plans || []);
        setAccounts(data.accounts || null);
        setLatestPayment(data.latestPayment || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBilling();
  }, []);

  const copyText = (val, key) => {
    if (!val) return;
    navigator.clipboard?.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };

  const activePlan = plans.find((p) => p.code === selectedPlan) || {
    code: 'negocio',
    name: 'Negocio',
    priceUsd: 70,
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: selectedPlan,
          paymentMethod: method,
          referenceCode,
          payerDetails,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No se pudo enviar el comprobante.');
        return;
      }
      setLatestPayment(json.payment);
      setReferenceCode('');
      setSuccessMsg('¡Pago reportado! Estamos certificando tu transferencia para activar tu espacio.');
    } catch {
      setError('Error de conexión al reportar tu pago.');
    } finally {
      setSubmitting(false);
    }
  };

  const waSupportNumber = accounts?.whatsapp_support || '584222476127';
  const waLink = `https://wa.me/${waSupportNumber.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
    `Hola Adriel's Systems, acabo de reportar mi pago en Munirix para ${tenantName} (${userEmail}) - Plan ${activePlan.name} ($${activePlan.priceUsd}).`
  )}`;

  const methodCfg = accounts?.[method] || {};

  return (
    <div className={styles.container}>
      <div className={styles.auroraBg} aria-hidden="true">
        <SoftAurora
          color1="#7B6BF2"
          color2="#38C6EC"
          speed={0.36}
          scale={1.4}
          brightness={0.9}
          bandHeight={0.46}
          bandSpread={1.12}
          opacity={0.76}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.topRow}>
          <div className={styles.brandRow}>
            <img src="/brand/Logo_Munirix_sin_fondo.png" alt="Munirix" className={styles.logo} />
            <div>
              <h1>Activa tu espacio en Munirix</h1>
              <p>{tenantName} · {userEmail}</p>
            </div>
          </div>
          <LogoutButton className={styles.logoutBtn} />
        </div>

        {loading ? (
          <div className={styles.loadingBox}>Cargando pasarela de pago...</div>
        ) : (
          <>
            {latestPayment?.status === 'pending' && (
              <div className={styles.pendingBanner}>
                <Clock size={18} color="#fbbf24" />
                <div style={{ flex: 1 }}>
                  <strong>Pago en proceso de certificación</strong>
                  <p>
                    Reportaste <strong>${latestPayment.amount_usd} USD</strong> por{' '}
                    <strong>{latestPayment.payment_method.toUpperCase()}</strong> (Ref:{' '}
                    <code>{latestPayment.reference_code}</code>). En cuanto certifiquemos el ingreso, tu espacio se activará automáticamente.
                  </p>
                </div>
                <div className={styles.bannerActions}>
                  <button type="button" className={styles.refreshBtn} onClick={loadBilling}>
                    <RefreshCw size={14} />
                    <span>Verificar activación</span>
                  </button>
                  <a href={waLink} target="_blank" rel="noreferrer" className={styles.waBtn}>
                    <MessageCircle size={14} />
                    <span>Notificar por WhatsApp</span>
                  </a>
                </div>
              </div>
            )}

            {latestPayment?.status === 'rejected' && (
              <div className={styles.errorBox}>
                <AlertCircle size={17} />
                <div>
                  <strong>Tu reporte anterior fue rechazado:</strong>{' '}
                  {latestPayment.admin_notes || 'Verifica la referencia e intenta nuevamente.'}
                </div>
              </div>
            )}

            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className={styles.successBox}>
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* 1. SELECCIÓN DE PLAN */}
            <div className={styles.sectionTitle}>1. Elige tu plan mensual</div>
            <div className={styles.planGrid}>
              {plans.map((p) => {
                const active = selectedPlan === p.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    className={`${styles.planCard} ${active ? styles.planCardActive : ''}`}
                    onClick={() => setSelectedPlan(p.code)}
                  >
                    <div className={styles.planHead}>
                      <strong>{p.name}</strong>
                      <span className={styles.planPrice}>${p.priceUsd}/mes</span>
                    </div>
                    <p>{p.tagline}</p>
                  </button>
                );
              })}
            </div>

            {/* 2. MÉTODO DE PAGO */}
            <div className={styles.sectionTitle}>2. Selecciona tu método de pago</div>
            <div className={styles.methodTabs}>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.methodTab} ${method === m.id ? styles.methodTabActive : ''}`}
                  onClick={() => setMethod(m.id)}
                >
                  <CreditCard size={14} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {/* DATOS DE LA CUENTA RECEPTORA */}
            <div className={styles.accountBox}>
              <div className={styles.accountHeader}>
                <strong>Datos para transferir (${activePlan.priceUsd} USD)</strong>
                <span className={styles.secureTag}>
                  <ShieldCheck size={14} /> Certificación directa Adriel&apos;s Systems
                </span>
              </div>
              <p className={styles.accountNote}>{methodCfg.instructions}</p>

              <div className={styles.accountDetails}>
                {method === 'paypal' && (
                  <>
                    <div className={styles.detailRow}>
                      <span>Cuenta PayPal:</span>
                      <code>{methodCfg.email}</code>
                      <button type="button" onClick={() => copyText(methodCfg.email, 'pp_mail')}>
                        {copied === 'pp_mail' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    {methodCfg.checkout_url && (
                      <a
                        href={`${methodCfg.checkout_url}/${activePlan.priceUsd}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.paypalLink}
                      >
                        <span>Pagar ${activePlan.priceUsd} USD en PayPal</span>
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </>
                )}

                {method === 'binance' && (
                  <>
                    <div className={styles.detailRow}>
                      <span>Binance Pay ID:</span>
                      <code>{methodCfg.binance_id}</code>
                      <button type="button" onClick={() => copyText(methodCfg.binance_id, 'bn_id')}>
                        {copied === 'bn_id' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Correo Binance:</span>
                      <code>{methodCfg.email}</code>
                      <button type="button" onClick={() => copyText(methodCfg.email, 'bn_mail')}>
                        {copied === 'bn_mail' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </>
                )}

                {method === 'zelle' && (
                  <>
                    <div className={styles.detailRow}>
                      <span>Correo / Teléfono Zelle:</span>
                      <code>{methodCfg.email}</code>
                      <button type="button" onClick={() => copyText(methodCfg.email, 'zl_mail')}>
                        {copied === 'zl_mail' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Titular:</span>
                      <code>{methodCfg.holder}</code>
                    </div>
                  </>
                )}

                {method === 'pago_movil' && (
                  <>
                    <div className={styles.detailRow}>
                      <span>Banco:</span>
                      <code>{methodCfg.bank}</code>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Cédula / RIF:</span>
                      <code>{methodCfg.document}</code>
                      <button type="button" onClick={() => copyText(methodCfg.document, 'pm_doc')}>
                        {copied === 'pm_doc' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <div className={styles.detailRow}>
                      <span>Teléfono:</span>
                      <code>{methodCfg.phone}</code>
                      <button type="button" onClick={() => copyText(methodCfg.phone, 'pm_ph')}>
                        {copied === 'pm_ph' ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    {methodCfg.rate_note && <p className={styles.rateHint}>{methodCfg.rate_note}</p>}
                  </>
                )}
              </div>
            </div>

            {/* 3. REPORTE DE COMPROBANTE */}
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.sectionTitle}>3. Reporta tu comprobante para certificar el pago</div>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label>Número de Referencia / ID de Transacción *</label>
                  <input
                    required
                    placeholder="Ej. 849201 o PayPal/Binance TxID"
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label>Nombre del titular que paga</label>
                  <input
                    placeholder="Nombre completo"
                    value={payerDetails.holderName}
                    onChange={(e) => setPayerDetails({ ...payerDetails, holderName: e.target.value })}
                  />
                </div>
                {method === 'pago_movil' && (
                  <>
                    <div className={styles.field}>
                      <label>Banco emisor</label>
                      <input
                        placeholder="Ej. Banesco, Mercantil, BDV"
                        value={payerDetails.bank}
                        onChange={(e) => setPayerDetails({ ...payerDetails, bank: e.target.value })}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Teléfono emisor</label>
                      <input
                        placeholder="0414-0000000"
                        value={payerDetails.phone}
                        onChange={(e) => setPayerDetails({ ...payerDetails, phone: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>

              <button type="submit" className={styles.submitBtn} disabled={submitting}>
                {submitting
                  ? 'Enviando comprobante...'
                  : `Reportar Pago ($${activePlan.priceUsd} USD) y Solicitar Activación`}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
