import { redirect } from 'next/navigation';
import { getActiveTenantContext } from '@/lib/auth';
import DashboardSidebar from '@/components/DashboardSidebar';
import styles from './dashboard.module.css';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }) {
  const ctx = await getActiveTenantContext();

  if (!ctx.ok) {
    redirect('/login');
  }

  if (ctx.tenant.status === 'pending_payment' && ctx.user.role !== 'superadmin') {
    redirect('/billing');
  }

  if (!ctx.tenant.onboarding_completed && ctx.user.role !== 'superadmin') {
    redirect('/onboarding');
  }

  let trialBanner = null;
  if (ctx.tenant.status === 'trial' && ctx.tenant.trial_ends_at) {
    const msLeft = Math.max(0, new Date(ctx.tenant.trial_ends_at).getTime() - Date.now());
    const totalHours = Math.ceil(msLeft / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const label =
      days > 0
        ? `${days} día${days > 1 ? 's' : ''}${hours > 0 ? ` y ${hours}h` : ''}`
        : `${totalHours} hora${totalHours === 1 ? '' : 's'}`;
    trialBanner = (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.68rem 1.1rem',
          marginBottom: '1rem',
          borderRadius: '12px',
          background: 'linear-gradient(90deg, rgba(56, 198, 236, 0.14), rgba(123, 107, 242, 0.12))',
          border: '1px solid rgba(56, 198, 236, 0.35)',
          fontSize: '0.84rem',
          color: '#e6eef8',
        }}
      >
        <span>
          <strong>Prueba gratuita de 3 días activa:</strong> te quedan{' '}
          <strong style={{ color: '#38c6ec' }}>{label}</strong> para probar tu agente con tus clientes.
        </span>
        <a
          href="/billing"
          style={{
            padding: '0.38rem 0.85rem',
            borderRadius: '9999px',
            background: '#38c6ec',
            color: '#06070c',
            fontWeight: 700,
            fontSize: '0.78rem',
            textDecoration: 'none',
          }}
        >
          Activar Plan ($40 / $70 / $150)
        </a>
      </div>
    );
  }

  return (
    <div className={styles.dashboardLayout}>
      <DashboardSidebar tenant={ctx.tenant} user={ctx.user} />
      <main className={styles.mainContent}>
        <div className={styles.contentWrapper}>
          {trialBanner}
          {children}
        </div>
      </main>
    </div>
  );
}
