import { redirect } from 'next/navigation';
import { getActiveTenantContext } from '@/lib/auth';
import BillingClient from './BillingClient';

export const dynamic = 'force-dynamic';

export default async function BillingPage({ searchParams }) {
  const ctx = await getActiveTenantContext();
  if (!ctx.ok) {
    redirect('/login');
  }

  if (ctx.tenant.status === 'active' || ctx.user.role === 'superadmin') {
    redirect(ctx.tenant.onboarding_completed ? '/dashboard' : '/onboarding');
  }

  const sp = await searchParams;
  const initialPlan = ['profesional', 'negocio', 'empresa'].includes(sp?.plan)
    ? sp.plan
    : 'negocio';

  return (
    <BillingClient
      initialPlan={initialPlan}
      tenantName={ctx.tenant.name}
      tenantStatus={ctx.tenant.status}
      userEmail={ctx.user.email || ''}
    />
  );
}
