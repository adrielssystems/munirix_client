import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { query } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { createOAuth2Client, parseGoogleState, resolveGoogleOAuthApp } from '@/lib/google/auth';

export const dynamic = 'force-dynamic';

function resolvePublicOrigin(req) {
  if (process.env.NEXT_PUBLIC_CLIENT_URL) return process.env.NEXT_PUBLIC_CLIENT_URL.replace(/\/+$/, '');
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/+$/, '');
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (fwdHost && !fwdHost.startsWith('0.0.0.0')) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${fwdHost}`;
  }
  return new URL(req.url).origin;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const origin = resolvePublicOrigin(req);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  const redirectBase = `${origin}/dashboard/settings?tab=google`;

  if (oauthError) {
    return NextResponse.redirect(`${redirectBase}&google_error=${encodeURIComponent(oauthError)}`);
  }

  const parsedState = parseGoogleState(state);
  if (!code || !parsedState?.tenantId) {
    return NextResponse.redirect(`${redirectBase}&google_error=invalid_state`);
  }

  try {
    const appCreds = await resolveGoogleOAuthApp(parsedState.tenantId);
    if (!appCreds) {
      throw new Error('Credenciales OAuth de Google no encontradas.');
    }

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/integrations/google/callback`;
    const oauth2Client = createOAuth2Client({ ...appCreds, redirectUri });
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const profileRes = await oauth2.userinfo.get();
    const googleEmail = profileRes.data.email || null;

    const scopes = tokens.scope ? tokens.scope.split(' ') : [];
    const products = Array.isArray(parsedState.products) ? parsedState.products : ['calendar'];

    await query(
      `INSERT INTO tenant_google_integrations (
         tenant_id, user_id, google_email,
         access_token_encrypted, refresh_token_encrypted, token_expires_at,
         scopes, enabled_products, status, last_synced_at, last_error, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'connected', NOW(), NULL, NOW())
       ON CONFLICT (tenant_id)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         google_email = COALESCE(EXCLUDED.google_email, tenant_google_integrations.google_email),
         access_token_encrypted = COALESCE(EXCLUDED.access_token_encrypted, tenant_google_integrations.access_token_encrypted),
         refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, tenant_google_integrations.refresh_token_encrypted),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         enabled_products = EXCLUDED.enabled_products,
         status = 'connected',
         last_synced_at = NOW(),
         last_error = NULL,
         updated_at = NOW()`,
      [
        parsedState.tenantId,
        parsedState.userId || null,
        googleEmail,
        tokens.access_token ? encryptSecret(tokens.access_token) : null,
        tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scopes,
        JSON.stringify(products),
      ]
    );

    return NextResponse.redirect(`${redirectBase}&google_connected=1`);
  } catch (err) {
    console.error('[GOOGLE CALLBACK ERROR]:', err);
    return NextResponse.redirect(
      `${redirectBase}&google_error=${encodeURIComponent(err.message || 'oauth_failed')}`
    );
  }
}

