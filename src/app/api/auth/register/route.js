import { NextResponse } from 'next/server';
import { z } from 'zod';
import { registerEmailTenantUser } from '@/lib/tenant-provisioning';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa tu nombre completo (mínimo 2 caracteres).').max(120),
  email: z.string().trim().email('Ingresa un correo electrónico válido.').max(255),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(128, 'La contraseña es demasiado larga.'),
});

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`register:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos de registro. Intenta de nuevo en unos minutos.' },
        { status: 429 }
      );
    }
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues?.[0]?.message || 'Datos de registro inválidos.';
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const user = await registerEmailTenantUser(parsed.data);

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          tenantSlug: user.tenantSlug,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS' || err.code === 'GOOGLE_ONLY_ACCOUNT') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    console.error('[REGISTER] Error creando cliente/tenant:', err);
    return NextResponse.json(
      { error: 'No se pudo completar el registro en este momento.' },
      { status: 500 }
    );
  }
}
