import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth/next';
import { clientAuthOptions } from '@/lib/auth';
import AuthPortal from '@/components/AuthPortal';

export const dynamic = 'force-dynamic';

export default async function ClientRegisterPage() {
  const session = await getServerSession(clientAuthOptions);
  if (session?.user) {
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
