import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getActiveTenantContext } from '@/lib/auth';
import AuthPortal from '@/components/AuthPortal';

export const dynamic = 'force-dynamic';

export default async function ClientRegisterPage({ searchParams }) {
  let ctx = { ok: false };
  try {
    ctx = await getActiveTenantContext();
  } catch (err) {
    console.error('[REGISTER] Error validando sesión:', err?.message || err);
  }

  const sp = await searchParams;
  const planParam = ['profesional', 'negocio', 'empresa'].includes(sp?.plan) ? `?plan=${sp.plan}` : '';

  if (ctx.ok) {
    if (ctx.tenant.status === 'pending_payment' && ctx.user.role !== 'superadmin') {
      redirect(`/billing${planParam}`);
    }
    if (!ctx.tenant.onboarding_completed && ctx.user.role !== 'superadmin') {
      redirect('/onboarding');
    }
    redirect('/dashboard');
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const googleAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <Suspense fallback={null}>
      <AuthPortal
        initialMode="register"
        googleAuthEnabled={googleAuthEnabled}
        googleClientId={googleClientId}
      />
    </Suspense>
  );
}
