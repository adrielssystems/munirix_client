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

  if (!ctx.tenant.onboarding_completed && ctx.user.role !== 'superadmin') {
    redirect('/onboarding');
  }

  return (
    <div className={styles.dashboardLayout}>
      <DashboardSidebar tenant={ctx.tenant} user={ctx.user} />
      <main className={styles.mainContent}>
        <div className={styles.contentWrapper}>{children}</div>
      </main>
    </div>
  );
}
