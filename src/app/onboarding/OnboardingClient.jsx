'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, MotionConfig } from 'motion/react';
import SoftAurora from '@/components/ui/SoftAurora';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Briefcase,
  CheckCircle2,
  Clock,
  Globe,
  HeartPulse,
  Send,
  SlidersHorizontal,
  Sparkles,
  Store,
  User,
} from 'lucide-react';
import styles from './onboarding.module.css';

const EASE_OUT = [0.23, 1, 0.32, 1];

const USE_CASES = [
  {
    id: 'personal',
    accountType: 'personal',
    industry: 'personal',
    title: 'Agente Personal',
    detail: 'Agenda, WhatsApp, Gmail y tareas diarias para tu productividad.',
    icon: User,
  },
  {
    id: 'general',
    accountType: 'business',
    industry: 'general',
    title: 'Negocio & Servicios',
    detail: 'Citas, catálogo, atención 24/7 por WhatsApp y CRM para cualquier rubro.',
    icon: Store,
  },
  {
    id: 'dermatology',
    accountType: 'business',
    industry: 'health_general',
    title: 'Consultorio / Salud',
    detail: 'Citas sin solapamiento, recordatorios y fichas de pacientes.',
    icon: HeartPulse,
  },
  {
    id: 'realestate',
    accountType: 'business',
    industry: 'realestate',
    title: 'Ventas & Bienes Raíces',
    detail: 'Calificación de clientes, visitas y seguimiento comercial.',
    icon: Briefcase,
  },
];

const STARTER_PROMPTS = [
  'Tengo una barbería, hacemos corte ($15, 30 min) y barba ($10, 20 min) de martes a sábado de 9am a 7pm.',
  'Quiero un asistente personal para organizar mi agenda y responder mensajes cuando estoy ocupado.',
  'Tengo un consultorio médico, atiendo consultas de 40 min de lunes a viernes de 8am a 4pm.',
  'Vendo productos por WhatsApp y quiero que la IA responda precios, tome pedidos y agende entregas.',
];

const COMMON_TIMEZONES = [
  'America/Caracas',
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
];

export default function OnboardingClient({
  initialWorkspaceName,
  userName,
  userEmail,
  userAvatar,
}) {
  const router = useRouter();
  const { update } = useSession();

  const [mode, setMode] = useState('ai'); // 'ai' | 'manual'
  const [selectedUseCase, setSelectedUseCase] = useState('general');
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName || '');
  const [timezone, setTimezone] = useState('America/Caracas');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Pasarela guiada por IA
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy tu arquitecto de Munirix. Cuéntame en tus propias palabras a qué se dedica tu negocio (o si es para tu uso personal), qué servicios o productos ofreces y en qué horario atiendes. Yo armaré la configuración por ti.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [generatedConfig, setGeneratedConfig] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages, aiThinking]);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      // keep default
    }
  }, []);

  const currentUseCase = USE_CASES.find((u) => u.id === selectedUseCase) || USE_CASES[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName: workspaceName.trim(),
          accountType: currentUseCase.accountType,
          industry: currentUseCase.industry,
          timezone,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'No se pudo guardar tu espacio.');
        setIsSaving(false);
        return;
      }

      await update({
        tenantName: data.tenant?.name || workspaceName.trim(),
        tenantIndustry: data.tenant?.industry || currentUseCase.industry,
        tenantTimezone: data.tenant?.timezone || timezone,
        enabledModules: data.tenant?.enabled_modules,
        onboardingCompleted: true,
      });

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Error de conexión al guardar la configuración.');
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      });
      await update({ onboardingCompleted: true });
      router.push('/dashboard');
      router.refresh();
    } catch {
      setIsSaving(false);
    }
  };

  const handleSendChat = async (textOverride) => {
    const content = String(textOverride ?? chatInput).trim();
    if (!content || aiThinking) return;

    const nextMessages = [...chatMessages, { role: 'user', content }];
    setChatMessages(nextMessages);
    if (!textOverride) setChatInput('');
    setAiThinking(true);
    setError('');

    try {
      const res = await fetch('/api/onboarding/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          workspaceName,
          timezone,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No se pudo consultar al asistente.');
        return;
      }
      setChatMessages([...nextMessages, { role: 'assistant', content: json.reply }]);
      if (json.config) {
        setGeneratedConfig(json.config);
        if (json.config.workspaceName) setWorkspaceName(json.config.workspaceName);
      }
    } catch {
      setError('Error de conexión con el asistente IA.');
    } finally {
      setAiThinking(false);
    }
  };

  const handleApplyGenerated = async () => {
    if (!generatedConfig) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName: generatedConfig.workspaceName || workspaceName.trim(),
          accountType: generatedConfig.accountType || 'business',
          industry: generatedConfig.industry || 'general',
          timezone,
          needsAppointments: generatedConfig.needsAppointments,
          systemPrompt: generatedConfig.systemPrompt,
          services: generatedConfig.services,
          availability: generatedConfig.availability,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar tu espacio.');
        setIsSaving(false);
        return;
      }

      await update({
        tenantName: data.tenant?.name || workspaceName.trim(),
        tenantIndustry: data.tenant?.industry || generatedConfig.industry,
        tenantTimezone: data.tenant?.timezone || timezone,
        enabledModules: data.tenant?.enabled_modules,
        onboardingCompleted: true,
      });

      router.push('/dashboard/settings?tab=whatsapp');
      router.refresh();
    } catch {
      setError('Error de conexión al guardar la configuración.');
      setIsSaving(false);
    }
  };

  const timezoneOptions = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.container}>
        <div className={styles.auroraBg} aria-hidden="true">
          <SoftAurora
            color1="#7B6BF2"
            color2="#38C6EC"
            speed={0.38}
            scale={1.45}
            brightness={0.9}
            bandHeight={0.46}
            bandSpread={1.12}
            opacity={0.78}
          />
        </div>

        <motion.div
          className={styles.card}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: EASE_OUT }}
        >
          <div className={styles.header}>
            <img
              src="/brand/Logo_Munirix_sin_fondo.png"
              alt="Munirix"
              className={styles.logo}
            />
            <div className={styles.userPill}>
              {userAvatar && (
                <img
                  src={userAvatar}
                  alt={userName}
                  className={styles.avatar}
                  referrerPolicy="no-referrer"
                />
              )}
              <span>{userEmail}</span>
            </div>
            <h1>Prepara tu espacio en Munirix</h1>
            <p>
              Cuéntale a la IA cómo trabajas y configuraremos tu agente y tu agenda en segundos, sin ajustes técnicos.
            </p>
          </div>

          <div className={styles.modeSwitch} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'ai'}
              className={`${styles.modeBtn} ${mode === 'ai' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('ai')}
            >
              <Sparkles size={15} />
              <span>Asistente IA (Recomendado)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'manual'}
              className={`${styles.modeBtn} ${mode === 'manual' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('manual')}
            >
              <SlidersHorizontal size={15} />
              <span>Selección Manual Rápida</span>
            </button>
          </div>

          {error && (
            <div className={styles.errorBox} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {mode === 'ai' ? (
            <div className={styles.aiWizard}>
              <div className={styles.chatBox}>
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={msg.role === 'user' ? styles.chatMsgUser : styles.chatMsgAi}
                  >
                    {msg.role === 'assistant' && (
                      <span className={styles.chatAiTag}>
                        <Bot size={13} />
                        <span>Munirix IA</span>
                      </span>
                    )}
                    <p>{String(msg.content || '').replace(/\*\*/g, '')}</p>
                  </div>
                ))}
                {aiThinking && (
                  <div className={styles.chatMsgAi}>
                    <span className={styles.chatAiTag}>
                      <Bot size={13} />
                      <span>Munirix IA</span>
                    </span>
                    <p style={{ opacity: 0.7 }}>Analizando tu negocio y preparando la configuración...</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {chatMessages.length === 1 && (
                <div className={styles.starterChips}>
                  {STARTER_PROMPTS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className={styles.starterChip}
                      onClick={() => handleSendChat(example)}
                      disabled={aiThinking}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.chatInputRow}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder="Ej. Tengo una estética, hacemos manicure y pedicure de lunes a sábado..."
                  disabled={aiThinking || isSaving}
                />
                <button
                  type="button"
                  className={styles.sendChatBtn}
                  onClick={() => handleSendChat()}
                  disabled={aiThinking || isSaving || !chatInput.trim()}
                >
                  <Send size={16} />
                </button>
              </div>

              {generatedConfig && (
                <div className={styles.previewBox}>
                  <div className={styles.previewHeader}>
                    <CheckCircle2 size={17} color="#10b981" />
                    <span>Configuración lista para: {generatedConfig.workspaceName || workspaceName}</span>
                  </div>

                  <div className={styles.previewGrid}>
                    <div>
                      <strong>Instrucciones del Agente</strong>
                      <p className={styles.previewText}>{generatedConfig.systemPrompt}</p>
                    </div>
                    {Array.isArray(generatedConfig.services) && generatedConfig.services.length > 0 && (
                      <div>
                        <strong>Servicios detectados ({generatedConfig.services.length})</strong>
                        <ul className={styles.previewList}>
                          {generatedConfig.services.map((s, i) => (
                            <li key={i}>
                              {s.name} · {s.duration_minutes} min
                              {s.price ? ` · $${s.price}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(generatedConfig.availability) && (
                      <div className={styles.previewHours}>
                        <Clock size={13} />
                        <span>
                          Días activos:{' '}
                          {generatedConfig.availability.filter((d) => d.is_active).length} días/semana
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={handleApplyGenerated}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <span className={styles.loader} />
                    ) : (
                      <>
                        <span>Guardar y Conectar WhatsApp / Google</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.skipBtn}
                  onClick={handleSkip}
                  disabled={isSaving}
                >
                  Omitir por ahora
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.sectionLabel}>¿Cómo vas a usar Munirix?</div>
              <div className={styles.useCaseGrid}>
                {USE_CASES.map((item) => {
                  const Icon = item.icon;
                  const active = selectedUseCase === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.useCaseCard} ${active ? styles.useCaseActive : ''}`}
                      onClick={() => setSelectedUseCase(item.id)}
                    >
                      <Icon size={18} className={styles.useCaseIcon} strokeWidth={1.75} />
                      <div className={styles.useCaseText}>
                        <span className={styles.useCaseTitle}>{item.title}</span>
                        <span className={styles.useCaseDetail}>{item.detail}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="workspaceName">Nombre de tu espacio u organización</label>
                  <input
                    id="workspaceName"
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="Ej. Barbería Central, Estudio Legal o Mi Asistente"
                    required
                    minLength={2}
                    disabled={isSaving}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="timezone">
                    <Globe size={13} style={{ display: 'inline', marginRight: 5 }} />
                    Zona horaria
                  </label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={isSaving}
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.actions}>
                <button type="submit" className={styles.primaryBtn} disabled={isSaving}>
                  {isSaving ? (
                    <span className={styles.loader} />
                  ) : (
                    <>
                      <span>Entrar a mi Workspace</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className={styles.skipBtn}
                  onClick={handleSkip}
                  disabled={isSaving}
                >
                  Omitir por ahora
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
