'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, MotionConfig } from 'motion/react';
import SoftAurora from '@/components/ui/SoftAurora';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  Globe,
  HeartPulse,
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
    id: 'dermatology',
    accountType: 'business',
    industry: 'dermatology',
    title: 'Consultorio / Salud',
    detail: 'Triaje, citas sin solapamiento, recordatorios y fichas de pacientes.',
    icon: HeartPulse,
  },
  {
    id: 'general',
    accountType: 'business',
    industry: 'general',
    title: 'Empresa / Ventas',
    detail: 'Atención 24/7 por WhatsApp, calificación de leads y CRM.',
    icon: Briefcase,
  },
  {
    id: 'realestate',
    accountType: 'business',
    industry: 'realestate',
    title: 'Bienes Raíces',
    detail: 'Consultas de propiedades, visitas y seguimiento de clientes.',
    icon: Building2,
  },
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

  const [selectedUseCase, setSelectedUseCase] = useState('personal');
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName || '');
  const [timezone, setTimezone] = useState('America/Caracas');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
              Elige cómo vas a usar tus agentes para activar los módulos exactos desde el primer minuto.
            </p>
          </div>

          {error && (
            <div className={styles.errorBox} role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

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
                  placeholder="Ej. Clínica Dermatológica Norte o Espacio de Héctor"
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
        </motion.div>
      </div>
    </MotionConfig>
  );
}
