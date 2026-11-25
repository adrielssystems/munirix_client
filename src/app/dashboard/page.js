import Link from 'next/link';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';
import SpotlightCard from '@/components/ui/SpotlightCard';
import CountUp from '@/components/ui/CountUp';
import DashboardCharts from '@/components/DashboardCharts';
import {
  CalendarCheck2,
  MessageSquare,
  Users,
  Bot,
  Calendar,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import styles from './dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) return null;

  const { tenantId, tenant } = ctx;

  const [
    aptSummary,
    convSummary,
    contactsSummary,
    aiConfigRes,
    googleRes,
    upcomingRes,
    dailyMsgsRes,
    dailyAptsRes,
    servicesBreakdownRes,
  ] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed') AND start_at >= NOW())::int AS upcoming,
         COUNT(*) FILTER (WHERE status = 'confirmed' AND start_at >= NOW())::int AS confirmed
       FROM appointments WHERE tenant_id = $1`,
      [tenantId]
    ),
    query(
      `SELECT COUNT(*)::int AS open_convs,
              COALESCE(SUM(unread_count), 0)::int AS unread
       FROM conversations WHERE tenant_id = $1 AND status != 'closed'`,
      [tenantId]
    ),
    query(`SELECT COUNT(*)::int AS total FROM contacts WHERE tenant_id = $1`, [tenantId]),
    query(`SELECT provider, model, enabled FROM tenant_ai_configs WHERE tenant_id = $1`, [tenantId]),
    query(`SELECT status, google_email FROM tenant_google_integrations WHERE tenant_id = $1`, [tenantId]),
    query(
      `SELECT a.id, a.title, a.start_at, a.status, a.triage_reason, a.source,
              c.name AS contact_name, c.phone AS contact_phone, s.duration_minutes
       FROM appointments a
       JOIN contacts c ON c.id = a.contact_id
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.tenant_id = $1 AND a.start_at >= NOW() - INTERVAL '2 hours'
         AND a.status IN ('scheduled', 'confirmed')
       ORDER BY a.start_at ASC
       LIMIT 6`,
      [tenantId]
    ),
    query(
      `SELECT to_char(created_at AT TIME ZONE $2, 'Dy') AS day,
              DATE(created_at AT TIME ZONE $2) AS d,
              COUNT(*)::int AS total
       FROM messages
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '6 days'
       GROUP BY 1, 2
       ORDER BY 2 ASC`,
      [tenantId, tenant.timezone || 'America/Caracas']
    ),
    query(
      `SELECT to_char(start_at AT TIME ZONE $2, 'Dy') AS day,
              DATE(start_at AT TIME ZONE $2) AS d,
              COUNT(*)::int AS total
       FROM appointments
       WHERE tenant_id = $1 AND start_at >= NOW() - INTERVAL '6 days'
       GROUP BY 1, 2
       ORDER BY 2 ASC`,
      [tenantId, tenant.timezone || 'America/Caracas']
    ),
    query(
      `SELECT LEFT(s.name, 18) AS name, COUNT(a.id)::int AS count
       FROM services s
       LEFT JOIN appointments a ON a.service_id = s.id AND a.tenant_id = $1
       WHERE s.tenant_id = $1 AND s.is_active = true
       GROUP BY s.id, s.name
       ORDER BY count DESC, s.name ASC
       LIMIT 6`,
      [tenantId]
    ),
  ]);

  const aiCfg = aiConfigRes.rows[0] || { provider: 'gemini', model: 'gemini-2.5-flash', enabled: true };
  const gSync = googleRes.rows[0] || { status: 'disconnected' };

  // Armar serie limpia de los últimos 7 días
  const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const msgMap = new Map(dailyMsgsRes.rows.map((r) => [new Date(r.d).toISOString().slice(0, 10), r.total]));
  const aptMap = new Map(dailyAptsRes.rows.map((r) => [new Date(r.d).toISOString().slice(0, 10), r.total]));
  const dailyActivity = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (6 - i));
    const key = dt.toISOString().slice(0, 10);
    return {
      day: dayLabels[dt.getDay()],
      messages: msgMap.get(key) || 0,
      appointments: aptMap.get(key) || 0,
    };
  });

  const kpis = [
    {
      label: 'Citas Próximas',
      value: aptSummary.rows[0]?.upcoming || 0,
      sub: `${aptSummary.rows[0]?.confirmed || 0} confirmadas por paciente`,
      color: '#22D3EE',
      icon: CalendarCheck2,
    },
    {
      label: 'Conversaciones Activas',
      value: convSummary.rows[0]?.open_convs || 0,
      sub: `${convSummary.rows[0]?.unread || 0} mensajes sin leer`,
      color: '#10B981',
      icon: MessageSquare,
    },
    {
      label: 'Pacientes / Contactos',
      value: contactsSummary.rows[0]?.total || 0,
      sub: 'Aislados en tu espacio multitenant',
      color: '#6366F1',
      icon: Users,
    },
  ];

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Panel de {tenant.name}</h1>
          <p>
            Zona horaria: <strong>{tenant.timezone}</strong> · Operación omnicanal y agenda inteligente en vivo.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link href="/dashboard/calendar" className="hc-btn hc-btn-primary">
            <Calendar size={16} />
            <span>Abrir Agenda</span>
          </Link>
          <Link href="/dashboard/settings" className="hc-btn">
            <Bot size={16} />
            <span>Motor IA: {aiCfg.provider}</span>
          </Link>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <SpotlightCard
              key={item.label}
              spotlightColor={item.color}
              intensity={0.16}
              borderGlow={0.55}
              style={{ padding: '1.35rem', borderRadius: '16px', backgroundColor: '#111520' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', fontWeight: 500 }}>
                  {item.label}
                </span>
                <Icon size={18} color={item.color} />
              </div>
              <div className="tabular" style={{ fontSize: '2.15rem', fontWeight: 700, lineHeight: 1.05 }}>
                <CountUp to={item.value} duration={0.85} trigger="load" />
              </div>
              <p style={{ marginTop: '0.45rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {item.sub}
              </p>
            </SpotlightCard>
          );
        })}

        <SpotlightCard
          spotlightColor={gSync.status === 'connected' ? '#10B981' : '#F59E0B'}
          intensity={0.15}
          borderGlow={0.5}
          style={{ padding: '1.35rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', fontWeight: 500 }}>
              Integraciones Activas
            </span>
            <Bot size={18} color="#a5b4fc" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Agente IA ({aiCfg.provider})</span>
              <span className={`hc-pill ${aiCfg.enabled ? 'hc-pill-emerald' : 'hc-pill-amber'}`}>
                {aiCfg.enabled ? 'Activo' : 'Pausado'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Google Calendar</span>
              <span className={`hc-pill ${gSync.status === 'connected' ? 'hc-pill-emerald' : 'hc-pill-amber'}`}>
                {gSync.status === 'connected' ? 'Sincronizado' : 'Conectar'}
              </span>
            </div>
          </div>
        </SpotlightCard>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <DashboardCharts
          dailyActivity={dailyActivity}
          serviceBreakdown={servicesBreakdownRes.rows}
        />
      </div>

      <SpotlightCard
        spotlightColor="#22D3EE"
        intensity={0.12}
        borderGlow={0.45}
        style={{ padding: '1.5rem', borderRadius: '16px', backgroundColor: '#111520' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.12rem', fontWeight: 600 }}>Próximas Citas en Agenda</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Reservas creadas por el Agente IA de WhatsApp o de forma manual
            </p>
          </div>
          <Link href="/dashboard/calendar" className="hc-btn" style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}>
            <span>Ver Calendario</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>

        {upcomingRes.rows.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No hay citas próximas registradas todavía. Agenda una desde el Calendario o prueba el Simulador IA en Configuración.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.85rem' }}>
            {upcomingRes.rows.map((apt) => (
              <div
                key={apt.id}
                style={{
                  padding: '0.95rem 1.05rem',
                  borderRadius: '12px',
                  background: 'rgba(7,8,10,0.68)',
                  border: '1px solid var(--border-hairline)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.92rem' }}>{apt.contact_name}</strong>
                  <span className={`hc-pill ${apt.status === 'confirmed' ? 'hc-pill-emerald' : 'hc-pill-cyan'}`}>
                    {apt.status === 'confirmed' ? 'Confirmada' : 'Agendada'}
                  </span>
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{apt.title}</div>
                {apt.triage_reason && (
                  <div style={{ fontSize: '0.78rem', color: '#a5b4fc' }}>
                    Motivo: {apt.triage_reason}
                  </div>
                )}
                <div className="tabular" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  <Clock size={13} />
                  <span>
                    {new Date(apt.start_at).toLocaleString('es-VE', {
                      timeZone: tenant.timezone || 'America/Caracas',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SpotlightCard>
    </div>
  );
}

