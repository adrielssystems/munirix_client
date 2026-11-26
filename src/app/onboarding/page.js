import { redirect } from 'next/navigation';
import { getActiveTenantContext } from '@/lib/auth';
import OnboardingClient from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }) {
  const ctx = await getActiveTenantContext();

  if (!ctx.ok) {
    redirect('/login');
  }

  if (ctx.tenant.status === 'pending_payment' && ctx.user.role !== 'superadmin') {
    redirect('/billing');
  }

  const sp = await searchParams;
  const isReconfigure = sp?.reconfigure === '1';

  if (ctx.tenant.onboarding_completed && !isReconfigure && ctx.user.role !== 'superadmin') {
    redirect('/dashboard');
  }

  return (
    <OnboardingClient
      initialWorkspaceName={ctx.tenant.name}
      userName={ctx.user.name || ''}
      userEmail={ctx.user.email || ''}
      userAvatar={ctx.user.avatarUrl || null}
    />
  );
}
