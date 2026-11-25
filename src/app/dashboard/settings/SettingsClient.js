'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  Calendar,
  MessageSquare,
  Clock,
  Sparkles,
  Save,
  Plus,
  Trash2,
  Send,
  Link2,
  Unlink,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  QrCode,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Webhook,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';
import SquishSwitch from '@/components/ui/SquishSwitch';

const DAYS = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' },
];

const PROVIDER_DOCS = {
  gemini: { url: 'https://aistudio.google.com/apikey', hint: 'Google AI Studio' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys', hint: 'DeepSeek Platform' },
  openai: { url: 'https://platform.openai.com/api-keys', hint: 'OpenAI Platform' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', hint: 'Anthropic Console' },
};

export default function SettingsClient() {
  const [tab, setTab] = useState('ai');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [origin, setOrigin] = useState('https://client.munirix.net');
  const [data, setData] = useState(null);

  const [aiForm, setAiForm] = useState(null);
  const [providerKeyInputs, setProviderKeyInputs] = useState({
    gemini: '',
    deepseek: '',
    openai: '',
    anthropic: '',
  });
  const [waForm, setWaForm] = useState(null);

  // Evolution API live controls
  const [evoStatus, setEvoStatus] = useState(null);
  const [evoQr, setEvoQr] = useState(null);
  const [evoLoading, setEvoLoading] = useState(false);

  // Google Cloud Wizard & BYO OAuth
  const [googleProducts, setGoogleProducts] = useState(['calendar']);
  const [googleOAuthForm, setGoogleOAuthForm] = useState({
    custom_client_id: '',
    new_custom_client_secret: '',
  });
  const [googleTestResult, setGoogleTestResult] = useState(null);
  const [testingGoogle, setTestingGoogle] = useState(false);

  // Horarios & Servicios
  const [rules, setRules] = useState([]);
  const [newService, setNewService] = useState({
    name: '',
    duration_minutes: 30,
    buffer_minutes: 10,
    price: '',
    preparation_notes: '',
    triage_keywords: '',
    follow_up_days: 30,
    color: '#6366F1',
  });

  // Simulador IA
  const [simInput, setSimInput] = useState('Hola, quiero agendar una cita para revisar acné esta semana');
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState(null);

  const copyText = (value, label) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(''), 1800);
  };

  const loadSettings = async () => {
    setLoading(true);
    const res = await fetch('/api/tenant/settings', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setAiForm(json.aiConfig);
      setWaForm({
        ...json.whatsappConfig,
        new_access_token: '',
        new_evolution_api_key: '',
      });
      setGoogleProducts(json.googleIntegration?.enabled_products || ['calendar']);
      setGoogleOAuthForm({
        custom_client_id: json.googleIntegration?.custom_client_id || '',
        new_custom_client_secret: '',
      });

      const ruleByDay = new Map((json.availabilityRules || []).map((r) => [Number(r.day_of_week), r]));
      setRules(
        DAYS.map((d) => {
          const existing = ruleByDay.get(d.id);
          return {
            day_of_week: d.id,
            label: d.label,
            is_active: Boolean(existing?.is_active),
            start_time: existing ? String(existing.start_time).slice(0, 5) : '08:30',
            end_time: existing ? String(existing.end_time).slice(0, 5) : '17:30',
          };
        })
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab')) setTab(params.get('tab'));
    if (params.get('google_connected')) setNotice('Cuenta de Google Workspace conectada exitosamente.');
    if (params.get('google_error')) setNotice(`Error en OAuth Google: ${params.get('google_error')}`);
    loadSettings();
  }, []);

  const saveSection = async (payload, message) => {
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/tenant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error || 'Error guardando configuración.');
      } else {
        setNotice(message);
        setProviderKeyInputs({ gemini: '', deepseek: '', openai: '', anthropic: '' });
        await loadSettings();
      }
    } finally {
      setSaving(false);
    }
  };

  // Acciones Evolution API
  const handleCheckEvolution = async () => {
    setEvoLoading(true);
    try {
      const res = await fetch('/api/integrations/evolution', { cache: 'no-store' });
      const json = await res.json();
      setEvoStatus(json);
    } finally {
      setEvoLoading(false);
    }
  };

  const handleConnectEvolutionQR = async () => {
    setEvoLoading(true);
    setEvoQr(null);
    setNotice('');
    try {
      const res = await fetch('/api/integrations/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(`Evolution API: ${json.error || 'No se pudo obtener QR.'}`);
      } else {
        setEvoQr(json);
        setNotice('QR generado. Escanea desde WhatsApp > Dispositivos vinculados.');
      }
    } finally {
      setEvoLoading(false);
    }
  };

  const handleSetEvolutionWebhook = async () => {
    setEvoLoading(true);
    try {
      const res = await fetch('/api/integrations/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'webhook' }),
      });
      const json = await res.json();
      if (res.ok) {
        setNotice(`Webhook de Evolution configurado en ${json.webhookUrl}`);
      } else {
        setNotice(`Error configurando webhook Evolution: ${json.error}`);
      }
    } finally {
      setEvoLoading(false);
    }
  };

  // Pruebas en vivo Google Workspace
  const handleTestGoogleServices = async () => {
    setTestingGoogle(true);
    setGoogleTestResult(null);
    try {
      const res = await fetch('/api/integrations/google/test', { method: 'POST' });
      const json = await res.json();
      setGoogleTestResult(json);
    } finally {
      setTestingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    await fetch('/api/integrations/google/disconnect', { method: 'POST' });
    setGoogleTestResult(null);
    setNotice('Cuenta de Google desconectada.');
    await loadSettings();
  };

  const handleSaveRules = async () => {
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/tenant/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (res.ok) setNotice('Horarios de atención actualizados.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/tenant/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newService),
      });
      if (res.ok) {
        setNewService({
          name: '',
          duration_minutes: 30,
          buffer_minutes: 10,
          price: '',
          preparation_notes: '',
          triage_keywords: '',
          follow_up_days: 30,
          color: '#6366F1',
        });
        setNotice('Servicio agregado al catálogo del Agente IA.');
        await loadSettings();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteService = async (id) => {
    await fetch(`/api/tenant/services?id=${id}`, { method: 'DELETE' });
    await loadSettings();
  };

  const handleSimulateAI = async (e) => {
    e.preventDefault();
    if (!simInput.trim()) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/ai/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: simInput }),
      });
      const json = await res.json();
      setSimResult(json);
    } finally {
      setSimRunning(false);
    }
  };

  if (loading || !data || !aiForm || !waForm) {
    return <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>Cargando configuración del workspace...</div>;
  }

  const providerCatalog = data.providersCatalog || {};
  const activeModels = providerCatalog[aiForm.provider]?.models || ['gemini-2.5-flash'];
  const googleGuide = data.googleConsoleGuide || { apis: [] };
  const googleRedirectUri = `${origin}/api/integrations/google/callback`;
  const webhookBase = process.env.NEXT_PUBLIC_APP_URL || "https://app.munirix.net"; const evolutionWebhookUrl = `${webhookBase}/api/webhooks/evolution?instance=${encodeURIComponent(
    waForm.evolution_instance || data.tenant.slug
  )}`;
  const metaWebhookUrl = `${webhookBase}/api/webhooks/whatsapp`;

  const selectedScopesList = Array.from(
    new Set(
      googleProducts.flatMap((p) => data.googleProductScopes?.[p] || [])
    )
  );

  const tabs = [
    { id: 'ai', label: 'Agente IA & API Keys', icon: Bot },
    { id: 'whatsapp', label: 'WhatsApp (Evolution / Meta)', icon: MessageSquare },
    { id: 'google', label: 'Google Cloud & Workspace', icon: Calendar },
    { id: 'services', label: 'Servicios & Triaje', icon: Sparkles },
    { id: 'hours', label: 'Horarios', icon: Clock },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      <div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>Configuración de {data.tenant.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
          Gestiona tu proveedor IA y API keys, conecta WhatsApp con Evolution API (o migra a Meta Oficial), y activa tus servicios en Google Cloud Console.
        </p>
      </div>

      {notice && (
        <div
          style={{
            padding: '0.8rem 1rem',
            borderRadius: '12px',
            background: 'rgba(34, 211, 238, 0.12)',
            border: '1px solid rgba(34, 211, 238, 0.35)',
            color: '#a5f3fc',
            fontSize: '0.86rem',
          }}
        >
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`hc-btn ${active ? 'hc-btn-primary' : ''}`}
              style={{ borderRadius: '9999px' }}
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: AGENTE IA & BÓVEDA DE API KEYS POR PROVEEDOR                 */}
      {/* =================================================================== */}
      {tab === 'ai' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.25rem' }}>
          <SpotlightCard
            spotlightColor="#6366F1"
            intensity={0.14}
            borderGlow={0.55}
            style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Tipo de IA & Bóveda de API Keys</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                  Elige el motor activo y guarda tus claves cifradas con AES-256-GCM.
                </p>
              </div>
              <SquishSwitch
                checked={aiForm.enabled}
                onChange={(v) => setAiForm({ ...aiForm, enabled: v })}
                width={50}
                height={27}
                radius={14}
                trackColor="#232836"
                trackOnColor="#10B981"
                thumbColor="#94a3b8"
                thumbOnColor="#07080a"
                label={aiForm.enabled ? 'Activa' : 'Pausada'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Selector visual de proveedor LLM */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
                {Object.values(providerCatalog).map((prov) => {
                  const selected = aiForm.provider === prov.id;
                  const keyInfo = aiForm.masked_provider_keys?.[prov.id];
                  return (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() =>
                        setAiForm({
                          ...aiForm,
                          provider: prov.id,
                          model: prov.defaultModel,
                        })
                      }
                      style={{
                        textAlign: 'left',
                        padding: '0.8rem 0.9rem',
                        borderRadius: '12px',
                        border: selected
                          ? '1px solid rgba(99,102,241,0.7)'
                          : '1px solid var(--border-hairline)',
                        background: selected ? 'rgba(99,102,241,0.16)' : 'rgba(7,8,10,0.65)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.88rem' }}>{prov.label}</strong>
                        {keyInfo?.configured && (
                          <span className="hc-pill hc-pill-emerald" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>
                            Key OK
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {prov.defaultModel}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Modelo Activo ({providerCatalog[aiForm.provider]?.label})
                  </label>
                  <select
                    className="hc-select"
                    value={aiForm.model}
                    onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                  >
                    {activeModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Temperatura
                  </label>
                  <input
                    className="hc-input tabular"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={aiForm.temperature}
                    onChange={(e) => setAiForm({ ...aiForm, temperature: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  background: 'rgba(7,8,10,0.68)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.84rem' }}>Usar mis propias API Keys (BYOK)</strong>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Actívalo para facturar el consumo LLM directo a tu cuenta; desactívalo para usar las claves gestionadas de plataforma.
                  </p>
                </div>
                <SquishSwitch
                  checked={!aiForm.use_platform_key}
                  onChange={(byok) => setAiForm({ ...aiForm, use_platform_key: !byok })}
                  width={48}
                  height={26}
                  radius={13}
                  trackColor="#232836"
                  trackOnColor="#22D3EE"
                  thumbColor="#94a3b8"
                  thumbOnColor="#07080a"
                />
              </div>

              {/* Campos siempre accesibles para guardar API Key de cada proveedor */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  background: 'rgba(7,8,10,0.6)',
                  border: '1px solid var(--border-hairline)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  <KeyRound size={15} color="#22d3ee" />
                  <span>API Keys por Proveedor (cifradas en base de datos)</span>
                </div>

                {Object.values(providerCatalog).map((prov) => {
                  const keyInfo = aiForm.masked_provider_keys?.[prov.id];
                  const doc = PROVIDER_DOCS[prov.id];
                  return (
                    <div key={prov.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', fontSize: '0.77rem' }}>
                        <span style={{ color: aiForm.provider === prov.id ? '#a5b4fc' : 'var(--text-secondary)', fontWeight: aiForm.provider === prov.id ? 600 : 400 }}>
                          {prov.label} {keyInfo?.configured ? `· Guardada (${keyInfo.masked})` : '· Sin clave propia'}
                        </span>
                        {doc && (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#22d3ee', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <span>Obtener en {doc.hint}</span>
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      <input
                        className="hc-input"
                        type="password"
                        placeholder={
                          keyInfo?.configured
                            ? `Escribe una nueva clave para reemplazar (${keyInfo.masked})`
                            : `Pega tu API Key de ${prov.label}...`
                        }
                        value={providerKeyInputs[prov.id] || ''}
                        onChange={(e) =>
                          setProviderKeyInputs((prev) => ({ ...prev, [prov.id]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  System Prompt del Agente
                </label>
                <textarea
                  className="hc-textarea"
                  rows={3}
                  value={aiForm.system_prompt}
                  onChange={(e) => setAiForm({ ...aiForm, system_prompt: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Base de Conocimiento (ubicación, seguros, precios, políticas)
                </label>
                <textarea
                  className="hc-textarea"
                  rows={3}
                  value={aiForm.knowledge_base}
                  onChange={(e) => setAiForm({ ...aiForm, knowledge_base: e.target.value })}
                />
              </div>

              <button
                type="button"
                className="hc-btn hc-btn-primary"
                disabled={saving}
                onClick={() =>
                  saveSection(
                    {
                      aiConfig: {
                        ...aiForm,
                        provider_keys_input: providerKeyInputs,
                      },
                    },
                    'Configuración de IA y API Keys cifradas guardadas correctamente.'
                  )
                }
              >
                <Save size={16} />
                <span>{saving ? 'Guardando...' : 'Guardar IA y API Keys'}</span>
              </button>
            </div>
          </SpotlightCard>

          <SpotlightCard
            spotlightColor="#22D3EE"
            intensity={0.14}
            borderGlow={0.55}
            style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Simulador en Vivo (Tool Calling + Agenda)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', marginBottom: '1.1rem' }}>
              Prueba el motor activo (<strong>{aiForm.provider} / {aiForm.model}</strong>) consultando disponibilidad real y triaje dermatológico sin escribir a pacientes.
            </p>

            <form onSubmit={handleSimulateAI} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <textarea
                className="hc-textarea"
                rows={4}
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder="Ej. Hola, quiero agendar para revisión de lunares mañana en la mañana"
              />
              <button type="submit" className="hc-btn hc-btn-emerald" disabled={simRunning}>
                <Send size={15} />
                <span>{simRunning ? 'Consultando modelo y agenda...' : 'Probar Agente IA'}</span>
              </button>
            </form>

            {simResult && (
              <div
                style={{
                  marginTop: '1.15rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  background: 'rgba(7,8,10,0.75)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '0.86rem',
                  lineHeight: 1.55,
                }}
              >
                {simResult.error ? (
                  <div style={{ color: '#fda4af' }}>
                    <strong>Error:</strong> {simResult.error}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
                      <span className="hc-pill hc-pill-indigo">
                        {simResult.provider} / {simResult.modelName}
                      </span>
                      {(simResult.toolCalls || []).map((tc, i) => (
                        <span key={i} className="hc-pill hc-pill-cyan">
                          Tool: {tc}
                        </span>
                      ))}
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{simResult.reply}</p>
                  </>
                )}
              </div>
            )}
          </SpotlightCard>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: WHATSAPP DUAL-PROVIDER (EVOLUTION API + META CLOUD API)      */}
      {/* =================================================================== */}
      {tab === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SpotlightCard
            spotlightColor="#10B981"
            intensity={0.14}
            borderGlow={0.55}
            style={{ padding: '1.65rem', borderRadius: '16px', backgroundColor: '#111520' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Motor de WhatsApp (Dual-Provider)</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                  Empieza con <strong>Evolution API</strong> para clientes de bajo consumo y migra a <strong>Meta Cloud API Oficial</strong> con un clic cuando escalen, sin perder chats ni citas.
                </p>
              </div>
              <SquishSwitch
                checked={waForm.bot_enabled}
                onChange={(v) => setWaForm({ ...waForm, bot_enabled: v })}
                width={50}
                height={27}
                radius={14}
                trackColor="#232836"
                trackOnColor="#10B981"
                thumbColor="#94a3b8"
                thumbOnColor="#07080a"
                label="Bot IA en WhatsApp"
              />
            </div>

            {/* Selector Evolution API vs Meta Oficial */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem', marginBottom: '1.4rem' }}>
              <button
                type="button"
                onClick={() => setWaForm({ ...waForm, whatsapp_provider: 'evolution' })}
                style={{
                  textAlign: 'left',
                  padding: '1rem 1.1rem',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  background:
                    waForm.whatsapp_provider === 'evolution'
                      ? 'rgba(16,185,129,0.14)'
                      : 'rgba(7,8,10,0.6)',
                  border:
                    waForm.whatsapp_provider === 'evolution'
                      ? '1px solid rgba(16,185,129,0.65)'
                      : '1px solid var(--border-hairline)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.96rem' }}>Evolution API (Escaneo QR)</strong>
                  <span className="hc-pill hc-pill-emerald">Bajo consumo</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                  Ideal para consultorios arrancando: conecta el WhatsApp actual escaneando QR sin costo por conversación ni aprobación previa de plantillas.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setWaForm({ ...waForm, whatsapp_provider: 'meta' })}
                style={{
                  textAlign: 'left',
                  padding: '1rem 1.1rem',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  background:
                    waForm.whatsapp_provider === 'meta'
                      ? 'rgba(99,102,241,0.16)'
                      : 'rgba(7,8,10,0.6)',
                  border:
                    waForm.whatsapp_provider === 'meta'
                      ? '1px solid rgba(99,102,241,0.65)'
                      : '1px solid var(--border-hairline)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.96rem' }}>Meta Cloud API Oficial</strong>
                  <span className="hc-pill hc-pill-indigo">Alto volumen</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                  API oficial de Meta Business con botones interactivos nativos, plantillas verificadas, alta concurrencia y cero riesgo de bloqueo.
                </p>
              </button>
            </div>

            {waForm.whatsapp_provider === 'evolution' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.9rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      URL del servidor Evolution API
                    </label>
                    <input
                      className="hc-input"
                      placeholder="https://evolution.munirix.net o http://evolution-api:8080"
                      value={waForm.evolution_api_url}
                      onChange={(e) => setWaForm({ ...waForm, evolution_api_url: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Nombre de Instancia del Tenant
                    </label>
                    <input
                      className="hc-input"
                      placeholder={data.tenant.slug}
                      value={waForm.evolution_instance}
                      onChange={(e) => setWaForm({ ...waForm, evolution_instance: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Evolution API Key {waForm.has_evolution_api_key ? `(${waForm.masked_evolution_api_key})` : ''}
                    </label>
                    <input
                      className="hc-input"
                      type="password"
                      placeholder="Pega la API Key de Evolution"
                      value={waForm.new_evolution_api_key}
                      onChange={(e) => setWaForm({ ...waForm, new_evolution_api_key: e.target.value })}
                    />
                  </div>
                </div>

                {/* Webhook URL listo para copiar */}
                <div style={{ padding: '0.8rem 1rem', borderRadius: '10px', background: 'rgba(7,8,10,0.68)', border: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Webhook Evolution para esta instancia: </span>
                    <code style={{ color: '#6ee7b7' }}>{evolutionWebhookUrl}</code>
                  </div>
                  <button type="button" className="hc-btn" style={{ padding: '0.35rem 0.7rem', fontSize: '0.76rem' }} onClick={() => copyText(evolutionWebhookUrl, 'evo_wh')}>
                    {copiedKey === 'evo_wh' ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedKey === 'evo_wh' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="hc-btn hc-btn-primary"
                    disabled={saving}
                    onClick={() =>
                      saveSection({ whatsappConfig: waForm }, 'Configuración de Evolution API guardada y cifrada.')
                    }
                  >
                    <Save size={15} />
                    <span>Guardar Evolution API</span>
                  </button>
                  <button type="button" className="hc-btn hc-btn-emerald" disabled={evoLoading} onClick={handleConnectEvolutionQR}>
                    <QrCode size={15} />
                    <span>{evoLoading ? 'Conectando...' : 'Generar QR / Vincular WhatsApp'}</span>
                  </button>
                  <button type="button" className="hc-btn" disabled={evoLoading} onClick={handleCheckEvolution}>
                    <RefreshCw size={15} />
                    <span>Verificar Estado</span>
                  </button>
                  <button type="button" className="hc-btn" disabled={evoLoading} onClick={handleSetEvolutionWebhook}>
                    <Webhook size={15} />
                    <span>Configurar Webhook Automático</span>
                  </button>
                </div>

                {evoStatus && (
                  <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', background: 'rgba(7,8,10,0.72)', border: '1px solid var(--border-strong)', fontSize: '0.84rem' }}>
                    <strong>Estado de Instancia:</strong>{' '}
                    <span className={`hc-pill ${evoStatus.state === 'open' ? 'hc-pill-emerald' : 'hc-pill-amber'}`}>
                      {evoStatus.state}
                    </span>
                    {evoStatus.error && <span style={{ marginLeft: '0.6rem', color: '#fda4af' }}>{evoStatus.error}</span>}
                    {evoStatus.message && <span style={{ marginLeft: '0.6rem', color: 'var(--text-secondary)' }}>{evoStatus.message}</span>}
                  </div>
                )}

                {evoQr && (
                  <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'rgba(7,8,10,0.8)', border: '1px solid rgba(16,185,129,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <strong>Escanea con WhatsApp &gt; Dispositivos vinculados</strong>
                    {evoQr.qrBase64 && evoQr.qrBase64.startsWith('data:image') ? (
                      <img src={evoQr.qrBase64} alt="QR Evolution API" style={{ width: 220, height: 220, borderRadius: '12px', background: '#fff', padding: '8px' }} />
                    ) : evoQr.qrBase64 ? (
                      <img src={`data:image/png;base64,${evoQr.qrBase64}`} alt="QR Evolution API" style={{ width: 220, height: 220, borderRadius: '12px', background: '#fff', padding: '8px' }} />
                    ) : (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                        Instancia lista o ya conectada. Verifica el estado arriba.
                      </p>
                    )}
                    {evoQr.pairingCode && (
                      <div className="hc-pill hc-pill-cyan">Código de emparejamiento: {evoQr.pairingCode}</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Phone Number ID (Meta Developers)
                    </label>
                    <input
                      className="hc-input"
                      placeholder="Ej. 102938475612345"
                      value={waForm.phone_number_id}
                      onChange={(e) => setWaForm({ ...waForm, phone_number_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      WhatsApp Business Account ID (WABA)
                    </label>
                    <input
                      className="hc-input"
                      placeholder="Para gestión de plantillas aprobadas"
                      value={waForm.waba_id}
                      onChange={(e) => setWaForm({ ...waForm, waba_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Verify Token (Meta Webhook)
                    </label>
                    <input
                      className="hc-input"
                      placeholder="munirix_verify_token_2026"
                      value={waForm.verify_token}
                      onChange={(e) => setWaForm({ ...waForm, verify_token: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Permanent Access Token {waForm.has_access_token ? `(${waForm.masked_access_token})` : ''}
                    </label>
                    <input
                      className="hc-input"
                      type="password"
                      placeholder="Token permanente de Meta Graph API"
                      value={waForm.new_access_token}
                      onChange={(e) => setWaForm({ ...waForm, new_access_token: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ padding: '0.8rem 1rem', borderRadius: '10px', background: 'rgba(7,8,10,0.68)', border: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Callback URL para Meta Developers: </span>
                    <code style={{ color: '#a5b4fc' }}>{metaWebhookUrl}</code>
                  </div>
                  <button type="button" className="hc-btn" style={{ padding: '0.35rem 0.7rem', fontSize: '0.76rem' }} onClick={() => copyText(metaWebhookUrl, 'meta_wh')}>
                    {copiedKey === 'meta_wh' ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedKey === 'meta_wh' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="hc-btn hc-btn-primary"
                    disabled={saving}
                    onClick={() =>
                      saveSection({ whatsappConfig: waForm }, 'Credenciales de Meta Cloud API guardadas y cifradas.')
                    }
                  >
                    <Save size={15} />
                    <span>Guardar Meta Cloud API</span>
                  </button>
                </div>
              </div>
            )}
          </SpotlightCard>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: ASISTENTE GOOGLE CLOUD CONSOLE + WORKSPACE POR TENANT        */}
      {/* =================================================================== */}
      {tab === 'google' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Estado actual y botones de conexión / prueba */}
          <SpotlightCard
            spotlightColor="#22D3EE"
            intensity={0.14}
            borderGlow={0.55}
            style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.15rem' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Google Workspace por Tenant (Agenda, Gmail, Sheets, Drive y Contactos)</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                  Activa tus servicios directamente en <strong>console.cloud.google.com</strong> con nuestra guía paso a paso y conecta tu cuenta.
                </p>
              </div>
              <span className={`hc-pill ${data.googleIntegration.status === 'connected' ? 'hc-pill-emerald' : 'hc-pill-amber'}`}>
                {data.googleIntegration.status === 'connected' ? (
                  <>
                    <CheckCircle2 size={14} /> Conectado: {data.googleIntegration.google_email}
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} /> Pendiente de conexión
                  </>
                )}
              </span>
            </div>

            {/* Selector de servicios Google + botón directo para habilitar cada API en Google Cloud Console */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
              {(googleGuide.apis || []).map((api) => {
                const checked = googleProducts.includes(api.id);
                return (
                  <div
                    key={api.id}
                    style={{
                      padding: '0.95rem 1rem',
                      borderRadius: '12px',
                      background: 'rgba(7,8,10,0.68)',
                      border: checked ? '1px solid rgba(34,211,238,0.45)' : '1px solid var(--border-hairline)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.7rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <div>
                        <strong style={{ fontSize: '0.88rem' }}>{api.name}</strong>
                        <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                          {api.description}
                        </p>
                      </div>
                      <SquishSwitch
                        checked={checked}
                        onChange={(next) =>
                          setGoogleProducts((prev) =>
                            next ? Array.from(new Set([...prev, api.id])) : prev.filter((p) => p !== api.id)
                          )
                        }
                        width={44}
                        height={24}
                        radius={12}
                        trackColor="#232836"
                        trackOnColor="#22D3EE"
                        thumbColor="#94a3b8"
                        thumbOnColor="#07080a"
                      />
                    </div>
                    <a
                      href={api.enableUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '0.75rem', color: '#22d3ee', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                    >
                      <span>Habilitar en Google Cloud Console</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                );
              })}
            </div>

            {data.googleIntegration.status === 'connected' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.9rem', marginBottom: '1.15rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    Calendario Destino
                  </label>
                  <select
                    className="hc-select"
                    defaultValue={data.googleIntegration.calendar_id}
                    onChange={(e) =>
                      saveSection(
                        { googleIntegration: { calendar_id: e.target.value } },
                        'Calendario de Google actualizado.'
                      )
                    }
                  >
                    <option value="primary">Calendario Principal (primary)</option>
                    {(data.googleCalendars || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(7,8,10,0.68)', border: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: '0.84rem' }}>Crear enlace de Google Meet automático</span>
                  <SquishSwitch
                    checked={data.googleIntegration.create_meet_links}
                    onChange={(v) =>
                      saveSection(
                        { googleIntegration: { create_meet_links: v } },
                        'Preferencia de Google Meet guardada.'
                      )
                    }
                    width={46}
                    height={25}
                    radius={13}
                    trackColor="#232836"
                    trackOnColor="#10B981"
                    thumbColor="#94a3b8"
                    thumbOnColor="#07080a"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
              <a
                href={`/api/integrations/google/connect?products=${encodeURIComponent(googleProducts.join(','))}`}
                className="hc-btn hc-btn-primary"
              >
                <Link2 size={16} />
                <span>
                  {data.googleIntegration.status === 'connected'
                    ? 'Reconectar / Autorizar nuevos servicios Google'
                    : 'Autorizar y Conectar Cuenta Google'}
                </span>
              </a>

              {data.googleIntegration.status === 'connected' && (
                <>
                  <button type="button" className="hc-btn hc-btn-emerald" disabled={testingGoogle} onClick={handleTestGoogleServices}>
                    <FlaskConical size={15} />
                    <span>{testingGoogle ? 'Verificando APIs...' : 'Probar Servicios Google en Vivo'}</span>
                  </button>
                  <button type="button" className="hc-btn hc-btn-danger" onClick={handleDisconnectGoogle}>
                    <Unlink size={15} />
                    <span>Desconectar</span>
                  </button>
                </>
              )}
            </div>

            {googleTestResult && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(7,8,10,0.75)', border: '1px solid var(--border-strong)', fontSize: '0.84rem' }}>
                {googleTestResult.error ? (
                  <span style={{ color: '#fda4af' }}>{googleTestResult.error}</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <strong>Diagnóstico en vivo ({googleTestResult.email}):</strong>
                    {Object.entries(googleTestResult.results || {}).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`hc-pill ${v.ok ? 'hc-pill-emerald' : 'hc-pill-coral'}`}>
                          {k.toUpperCase()}
                        </span>
                        <span style={{ color: v.ok ? '#a7f3d0' : '#fda4af' }}>{v.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SpotlightCard>

          {/* ASISTENTE PASO A PASO EN CONSOLE.CLOUD.GOOGLE.COM */}
          <SpotlightCard
            spotlightColor="#6366F1"
            intensity={0.12}
            borderGlow={0.5}
            style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.4rem' }}>
              <ShieldCheck size={20} color="#22d3ee" />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
                Asistente Guiado: Activar Google Cloud Console (Paso a Paso)
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: '1.25rem' }}>
              Sigue estos 4 pasos para que tu organización configure su propio proyecto en <code>console.cloud.google.com</code> y pegue sus credenciales OAuth cifradas aquí mismo.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem', marginBottom: '1.3rem' }}>
              <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(7,8,10,0.65)', border: '1px solid var(--border-hairline)' }}>
                <span className="hc-pill hc-pill-indigo">Paso 1</span>
                <h3 style={{ fontSize: '0.95rem', margin: '0.55rem 0 0.35rem' }}>Crear Proyecto en Google Cloud</h3>
                <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.75rem' }}>
                  Crea un proyecto con el nombre de tu consultorio o empresa en Google Cloud Console.
                </p>
                <a href={googleGuide.createProjectUrl} target="_blank" rel="noreferrer" className="hc-btn" style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem' }}>
                  <span>Abrir Project Create</span>
                  <ExternalLink size={13} />
                </a>
              </div>

              <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(7,8,10,0.65)', border: '1px solid var(--border-hairline)' }}>
                <span className="hc-pill hc-pill-cyan">Paso 2</span>
                <h3 style={{ fontSize: '0.95rem', margin: '0.55rem 0 0.35rem' }}>Habilitar APIs Seleccionadas</h3>
                <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Usa los enlaces <em>&ldquo;Habilitar en Google Cloud Console&rdquo;</em> de las tarjetas de arriba para encender Calendar, Gmail, Sheets, Drive y Contactos.
                </p>
              </div>

              <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(7,8,10,0.65)', border: '1px solid var(--border-hairline)' }}>
                <span className="hc-pill hc-pill-emerald">Paso 3</span>
                <h3 style={{ fontSize: '0.95rem', margin: '0.55rem 0 0.35rem' }}>Pantalla de Consentimiento OAuth</h3>
                <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.65rem' }}>
                  Elige tipo <strong>Externo</strong>, agrega tu correo en <em>Usuarios de prueba</em> y habilita los scopes seleccionados ({selectedScopesList.length}).
                </p>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <a href={googleGuide.consentScreenUrl} target="_blank" rel="noreferrer" className="hc-btn" style={{ padding: '0.4rem 0.7rem', fontSize: '0.76rem' }}>
                    <span>Pantalla OAuth</span>
                    <ExternalLink size={12} />
                  </a>
                  <button type="button" className="hc-btn" style={{ padding: '0.4rem 0.7rem', fontSize: '0.76rem' }} onClick={() => copyText(selectedScopesList.join('\n'), 'g_scopes')}>
                    {copiedKey === 'g_scopes' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedKey === 'g_scopes' ? 'Scopes copiados' : 'Copiar Scopes'}</span>
                  </button>
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(7,8,10,0.65)', border: '1px solid var(--border-hairline)' }}>
                <span className="hc-pill hc-pill-amber">Paso 4</span>
                <h3 style={{ fontSize: '0.95rem', margin: '0.55rem 0 0.35rem' }}>Crear ID de Cliente OAuth Web</h3>
                <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: '0.65rem' }}>
                  Crea una credencial <strong>Aplicación Web</strong> y pega este <em>URI de redireccionamiento autorizado</em>:
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" className="hc-btn" style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }} onClick={() => copyText(googleRedirectUri, 'g_uri')}>
                    {copiedKey === 'g_uri' ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedKey === 'g_uri' ? 'URI copiado' : 'Copiar Redirect URI'}</span>
                  </button>
                  <a href={googleGuide.credentialsUrl} target="_blank" rel="noreferrer" className="hc-btn" style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}>
                    <span>Credenciales</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>

            {/* Redirect URI visible + formulario para guardar Client ID & Secret propios del tenant */}
            <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(7,8,10,0.72)', border: '1px solid var(--border-hairline)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>URI de redireccionamiento autorizado: </span>
              <code style={{ color: '#67e8f9' }}>{googleRedirectUri}</code>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Google OAuth Client ID (del Tenant)
                </label>
                <input
                  className="hc-input"
                  placeholder="123456789-xxxx.apps.googleusercontent.com"
                  value={googleOAuthForm.custom_client_id}
                  onChange={(e) => setGoogleOAuthForm({ ...googleOAuthForm, custom_client_id: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Google OAuth Client Secret {data.googleIntegration.has_custom_secret ? `(Guardado: ${data.googleIntegration.masked_custom_secret})` : ''}
                </label>
                <input
                  className="hc-input"
                  type="password"
                  placeholder="GOCSPX-..."
                  value={googleOAuthForm.new_custom_client_secret}
                  onChange={(e) => setGoogleOAuthForm({ ...googleOAuthForm, new_custom_client_secret: e.target.value })}
                />
              </div>

              <button
                type="button"
                className="hc-btn hc-btn-primary"
                disabled={saving}
                onClick={() =>
                  saveSection(
                    {
                      googleIntegration: {
                        custom_client_id: googleOAuthForm.custom_client_id,
                        new_custom_client_secret: googleOAuthForm.new_custom_client_secret,
                        enabled_products: googleProducts,
                      },
                    },
                    'Credenciales de Google Cloud guardadas y cifradas. Ahora puedes hacer clic en "Autorizar y Conectar Cuenta Google".'
                  )
                }
              >
                <Save size={15} />
                <span>Guardar Credenciales Google Cloud</span>
              </button>
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: SERVICIOS & TRIAJE DERMATOLÓGICO                             */}
      {/* =================================================================== */}
      {tab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <SpotlightCard
            spotlightColor="#EC4899"
            intensity={0.14}
            borderGlow={0.55}
            style={{ padding: '1.5rem', borderRadius: '16px', backgroundColor: '#111520' }}
          >
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem' }}>
              Nuevo Motivo de Consulta / Servicio
            </h2>
            <form onSubmit={handleAddService} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
              <input
                className="hc-input"
                required
                placeholder="Nombre (Ej. Láser CO2 / Acné)"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              />
              <input
                className="hc-input"
                type="number"
                min={10}
                max={240}
                placeholder="Duración (min)"
                value={newService.duration_minutes}
                onChange={(e) => setNewService({ ...newService, duration_minutes: Number(e.target.value) })}
              />
              <input
                className="hc-input"
                type="number"
                placeholder="Precio (USD)"
                value={newService.price}
                onChange={(e) => setNewService({ ...newService, price: e.target.value })}
              />
              <input
                className="hc-input"
                type="number"
                placeholder="Seguimiento post-consulta (días)"
                value={newService.follow_up_days}
                onChange={(e) => setNewService({ ...newService, follow_up_days: Number(e.target.value) })}
              />
              <input
                className="hc-input"
                placeholder="Keywords triaje (acne, manchas, piel)"
                value={newService.triage_keywords}
                onChange={(e) => setNewService({ ...newService, triage_keywords: e.target.value })}
              />
              <input
                className="hc-input"
                placeholder="Preparación previa al procedimiento"
                value={newService.preparation_notes}
                onChange={(e) => setNewService({ ...newService, preparation_notes: e.target.value })}
              />
              <button type="submit" className="hc-btn hc-btn-primary" disabled={saving}>
                <Plus size={16} />
                <span>Agregar Servicio</span>
              </button>
            </form>
          </SpotlightCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {(data.services || []).map((srv) => (
              <SpotlightCard
                key={srv.id}
                spotlightColor={srv.color || '#6366F1'}
                intensity={0.14}
                borderGlow={0.5}
                style={{ padding: '1.25rem', borderRadius: '15px', backgroundColor: '#111520' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.98rem' }}>{srv.name}</strong>
                  <button
                    type="button"
                    className="hc-btn hc-btn-danger"
                    style={{ padding: '0.35rem 0.5rem' }}
                    onClick={() => handleDeleteService(srv.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="tabular" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.65rem 0' }}>
                  <span className="hc-pill hc-pill-cyan">{srv.duration_minutes} min</span>
                  {srv.price && <span className="hc-pill hc-pill-emerald">${srv.price} {srv.currency}</span>}
                  {srv.follow_up_days && <span className="hc-pill hc-pill-indigo">Control {srv.follow_up_days}d</span>}
                </div>
                {srv.preparation_notes && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {srv.preparation_notes}
                  </p>
                )}
              </SpotlightCard>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: HORARIOS                                                     */}
      {/* =================================================================== */}
      {tab === 'hours' && (
        <SpotlightCard
          spotlightColor="#6366F1"
          intensity={0.14}
          borderGlow={0.5}
          style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Disponibilidad Semanal Base</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                El motor de citas y el Agente IA solo ofrecerán bloques dentro de estos horarios (zona: {data.tenant.timezone}).
              </p>
            </div>
            <button type="button" className="hc-btn hc-btn-primary" disabled={saving} onClick={handleSaveRules}>
              <Save size={16} />
              <span>Guardar Horarios</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {rules.map((r, idx) => (
              <div
                key={r.day_of_week}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 80px 1fr 1fr',
                  alignItems: 'center',
                  gap: '0.85rem',
                  padding: '0.7rem 0.9rem',
                  borderRadius: '10px',
                  background: 'rgba(7,8,10,0.68)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <strong>{r.label}</strong>
                <SquishSwitch
                  checked={r.is_active}
                  onChange={(v) =>
                    setRules((prev) => prev.map((item, i) => (i === idx ? { ...item, is_active: v } : item)))
                  }
                  width={46}
                  height={25}
                  radius={13}
                  trackColor="#232836"
                  trackOnColor="#10B981"
                  thumbColor="#94a3b8"
                  thumbOnColor="#07080a"
                />
                <input
                  className="hc-input"
                  type="time"
                  disabled={!r.is_active}
                  value={r.start_time}
                  onChange={(e) =>
                    setRules((prev) => prev.map((item, i) => (i === idx ? { ...item, start_time: e.target.value } : item)))
                  }
                />
                <input
                  className="hc-input"
                  type="time"
                  disabled={!r.is_active}
                  value={r.end_time}
                  onChange={(e) =>
                    setRules((prev) => prev.map((item, i) => (i === idx ? { ...item, end_time: e.target.value } : item)))
                  }
                />
              </div>
            ))}
          </div>
        </SpotlightCard>
      )}
    </div>
  );
}


