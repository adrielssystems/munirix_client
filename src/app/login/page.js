import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { clientAuthOptions } from '@/lib/auth';
import AuthPortal from '@/components/AuthPortal';

export const dynamic = 'force-dynamic';

export default async function ClientLoginPage() {
  let session = null;
  try {
    session = await getServerSession(clientAuthOptions);
  } catch (err) {
    console.error('[LOGIN] Error leyendo sesión:', err?.message || err);
  }
  if (session?.user) {
    redirect('/dashboard');
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const googleAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <Suspense fallback={null}>
      <AuthPortal
        initialMode="login"
        googleAuthEnabled={googleAuthEnabled}
        googleClientId={googleClientId}
      />
    </Suspense>
  );
}
