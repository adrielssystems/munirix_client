import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth/next";
import bcrypt from "bcryptjs";
import { query } from "./db.js";
import { normalizeModules, hasModule } from "./modules.js";
import {
  findOrProvisionGoogleUser,
  mapUserRowToSessionPayload,
  verifyGoogleIdToken,
} from "./tenant-provisioning.js";

export function createAuthOptions({ cookiePrefix = "munirix", requireSuperadminOnly = false } = {}) {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd && String(process.env.NEXTAUTH_URL || "").startsWith("https://");

  const providers = [
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const res = await query(
          `SELECT u.*,
                  t.name AS tenant_name,
                  t.slug AS tenant_slug,
                  t.status AS tenant_status,
                  t.industry AS tenant_industry,
                  t.timezone AS tenant_timezone,
                  t.enabled_modules AS tenant_modules,
                  t.branding AS tenant_branding,
                  t.onboarding_completed AS onboarding_completed
           FROM users u
           LEFT JOIN tenants t ON t.id = u.tenant_id
           WHERE LOWER(u.email) = $1`,
          [credentials.email.toLowerCase().trim()]
        );

        const user = res.rows[0];
        if (!user) return null;

        if (!user.password_hash) {
          throw new Error('Esta cuenta está vinculada con Google. Usa "Continuar con Google".');
        }

        const isValid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!isValid) return null;

        if (requireSuperadminOnly && user.role !== "superadmin") {
          throw new Error("Esta consola es exclusiva para Superadministradores de Munirix.");
        }
        if (user.role !== "superadmin" && user.tenant_status !== "active") {
          throw new Error("El acceso para esta organización está suspendido.");
        }

        return mapUserRowToSessionPayload(user);
      },
    }),
  ];

  // Google OAuth 2.0 + Google One Tap / FedCM solo para clientes/tenants (munirix_client)
  if (!requireSuperadminOnly) {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push(
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
        })
      );
    }

    providers.push(
      CredentialsProvider({
        id: "google-onetap",
        name: "Google One Tap",
        credentials: {
          credential: { label: "Google ID Token", type: "text" },
        },
        async authorize(credentials) {
          if (!credentials?.credential) return null;
          const googleProfile = await verifyGoogleIdToken(credentials.credential);
          return findOrProvisionGoogleUser(googleProfile);
        },
      })
    );
  }

  return {
    providers,
    cookies: {
      sessionToken: {
        name: `${cookiePrefix}.session-token`,
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure,
        },
      },
      callbackUrl: {
        name: `${cookiePrefix}.callback-url`,
        options: { sameSite: "lax", path: "/", secure },
      },
      csrfToken: {
        name: `${cookiePrefix}.csrf-token`,
        options: { httpOnly: true, sameSite: "lax", path: "/", secure },
      },
    },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider === "google") {
          if (requireSuperadminOnly) return false;
          try {
            const provisioned = await findOrProvisionGoogleUser({
              email: profile?.email || user?.email,
              name: profile?.name || user?.name,
              googleSub: profile?.sub || account.providerAccountId,
              avatarUrl: profile?.picture || user?.image || null,
            });
            Object.assign(user, provisioned);
            return true;
          } catch (err) {
            return `/login?error=${encodeURIComponent(err.message || "Error al iniciar sesión con Google.")}`;
          }
        }
        return true;
      },
      async jwt({ token, user, trigger, session }) {
        if (user) {
          token.id = user.id;
          token.role = user.role;
          token.avatarUrl = user.avatarUrl || user.image || null;
          token.tenantId = user.tenantId;
          token.tenantName = user.tenantName;
          token.tenantSlug = user.tenantSlug;
          token.tenantIndustry = user.tenantIndustry;
          token.tenantTimezone = user.tenantTimezone;
          token.enabledModules = user.enabledModules;
          token.tenantBranding = user.tenantBranding;
          token.onboardingCompleted = user.onboardingCompleted ?? true;
        }
        if (trigger === "update" && session) {
          if (typeof session.tenantName === "string") token.tenantName = session.tenantName;
          if (typeof session.tenantIndustry === "string") token.tenantIndustry = session.tenantIndustry;
          if (typeof session.tenantTimezone === "string") token.tenantTimezone = session.tenantTimezone;
          if (Array.isArray(session.enabledModules)) token.enabledModules = session.enabledModules;
          if (typeof session.onboardingCompleted === "boolean") {
            token.onboardingCompleted = session.onboardingCompleted;
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (token) {
          session.user.id = token.id;
          session.user.role = token.role;
          session.user.avatarUrl = token.avatarUrl || session.user.image || null;
          session.user.tenantId = token.tenantId;
          session.user.tenantName = token.tenantName;
          session.user.tenantSlug = token.tenantSlug;
          session.user.tenantIndustry = token.tenantIndustry;
          session.user.tenantTimezone = token.tenantTimezone;
          session.user.enabledModules = token.enabledModules || [];
          session.user.tenantBranding = token.tenantBranding || {};
          session.user.onboardingCompleted = token.onboardingCompleted ?? true;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    session: {
      strategy: "jwt",
      maxAge: 24 * 60 * 60,
    },
    secret: process.env.NEXTAUTH_SECRET || "munirix_fallback_secret_set_NEXTAUTH_SECRET_in_env",
  };
}

export const clientAuthOptions = createAuthOptions({
  cookiePrefix: "munirix-client",
  requireSuperadminOnly: false,
});

export const adminAuthOptions = createAuthOptions({
  cookiePrefix: "munirix-admin",
  requireSuperadminOnly: true,
});

export const authOptions = clientAuthOptions;

/**
 * Obtiene la sesión actual del Workspace Tenant (munirix_client) con el estado EN VIVO del tenant en PostgreSQL.
 */
export async function getActiveTenantContext(requiredModule = null, customAuthOptions = clientAuthOptions) {
  const session = await getServerSession(customAuthOptions);
  if (!session?.user) {
    return { ok: false, status: 401, error: "No autenticado" };
  }

  let tenantId = session.user.tenantId;

  if (!tenantId && session.user.role === "superadmin") {
    const firstTenant = await query(
      `SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`
    );
    tenantId = firstTenant.rows[0]?.id || null;
  }

  if (!tenantId) {
    return { ok: false, status: 403, error: "Usuario sin organización asignada" };
  }

  const tenantRes = await query(
    `SELECT id, name, slug, status, industry, timezone, enabled_modules, branding, business_hours, settings, onboarding_completed, account_type
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId]
  );

  const tenant = tenantRes.rows[0];
  if (!tenant) {
    return { ok: false, status: 404, error: "Organización no encontrada" };
  }
  if (session.user.role !== "superadmin" && tenant.status !== "active") {
    return { ok: false, status: 403, error: "Organización suspendida" };
  }

  const enabledModules = normalizeModules(tenant.enabled_modules);

  if (requiredModule && !hasModule(enabledModules, requiredModule)) {
    return {
      ok: false,
      status: 403,
      error: `El módulo "${requiredModule}" no está habilitado para esta organización.`,
    };
  }

  return {
    ok: true,
    session,
    user: session.user,
    tenantId: tenant.id,
    tenant: {
      ...tenant,
      enabled_modules: enabledModules,
    },
    enabledModules,
  };
}

/**
 * Valida sesión de Superadmin para la consola Partner Admin (munirix_app).
 */
export async function requireSuperadmin(customAuthOptions = adminAuthOptions) {
  const session = await getServerSession(customAuthOptions);
  if (!session?.user) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (session.user.role !== "superadmin") {
    return { ok: false, status: 403, error: "Se requieren permisos de Superadmin" };
  }
  return { ok: true, session, user: session.user };
}
