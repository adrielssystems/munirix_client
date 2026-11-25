'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import SpotlightCard from '@/components/ui/SpotlightCard';

const tooltipStyle = {
  backgroundColor: '#0d1017',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '10px',
  color: '#f4f6fa',
  fontSize: '0.82rem',
};

export default function DashboardCharts({ dailyActivity, serviceBreakdown }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
      <SpotlightCard
        spotlightColor="#6366F1"
        intensity={0.12}
        borderGlow={0.45}
        style={{ padding: '1.5rem', borderRadius: '16px', backgroundColor: '#111520' }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Citas & Mensajes (Últimos 7 días)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
            Actividad real del canal WhatsApp y agenda del tenant
          </p>
        </div>

        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyActivity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradMsgs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradApts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="day" stroke="#667085" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#667085" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="messages" name="Mensajes" stroke="#6366F1" strokeWidth={2} fill="url(#gradMsgs)" />
              <Area type="monotone" dataKey="appointments" name="Citas" stroke="#22D3EE" strokeWidth={2} fill="url(#gradApts)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SpotlightCard>

      <SpotlightCard
        spotlightColor="#22D3EE"
        intensity={0.12}
        borderGlow={0.45}
        style={{ padding: '1.5rem', borderRadius: '16px', backgroundColor: '#111520' }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Citas por Motivo / Servicio</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
            Distribución del triaje automático y reservas manuales
          </p>
        </div>

        <div style={{ width: '100%', height: 240 }}>
          {serviceBreakdown.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Aún no hay servicios configurados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceBreakdown} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#667085" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#667085" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Citas" fill="#10B981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </SpotlightCard>
    </div>
  );
}

