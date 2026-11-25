import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveTenantContext } from '@/lib/auth';
import { query } from '@/lib/db';
import { INDUSTRY_PRESETS, normalizeModules } from '@/lib/modules';

const onboardingSchema = z.object({
  skip: z.boolean().optional(),
  workspaceName: z.string().trim().min(2, 'Ingresa un nombre para tu espacio.').max(120).optional(),
  accountType: z.enum(['personal', 'business']).optional(),
  industry: z
    .enum(['personal', 'dermatology', 'health_general', 'aesthetics', 'legal', 'realestate', 'general'])
    .optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
});

export async function POST(request) {
  try {
    const ctx = await getActiveTenantContext();
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues?.[0]?.message || 'Datos de configuración inválidos.';
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const { skip, workspaceName, accountType, industry, timezone } = parsed.data;

    if (skip) {
      await query(
        `UPDATE tenants SET onboarding_completed = TRUE, updated_at = NOW() WHERE id = $1`,
        [ctx.tenantId]
      );
      return NextResponse.json({ ok: true, tenantId: ctx.tenantId, onboardingCompleted: true });
    }

    const chosenIndustry = industry || ctx.tenant.industry || 'general';
    const preset = INDUSTRY_PRESETS[chosenIndustry] || INDUSTRY_PRESETS.general;
    const enabledModules = normalizeModules(preset.defaultModules);
    const resolvedAccountType = accountType || (chosenIndustry === 'personal' ? 'personal' : 'business');
    const resolvedName = workspaceName || ctx.tenant.name;
    const resolvedTimezone = timezone || ctx.tenant.timezone || 'America/Caracas';

    const updated = await query(
      `UPDATE tenants
       SET name = $1,
           account_type = $2,
           industry = $3,
           timezone = $4,
           enabled_modules = $5::jsonb,
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, slug, account_type, industry, timezone, enabled_modules, onboarding_completed`,
      [
        resolvedName,
        resolvedAccountType,
        chosenIndustry,
        resolvedTimezone,
        JSON.stringify(enabledModules),
        ctx.tenantId,
      ]
    );

    return NextResponse.json({
      ok: true,
      tenant: updated.rows[0],
    });
  } catch (err) {
    console.error('[ONBOARDING] Error guardando configuración inicial:', err);
    return NextResponse.json(
      { error: 'No se pudo guardar la configuración de tu espacio.' },
      { status: 500 }
    );
  }
}
