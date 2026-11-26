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
  needsAppointments: z.boolean().optional(),
  systemPrompt: z.string().trim().max(6000).optional(),
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(150),
        duration_minutes: z.coerce.number().int().min(5).max(480).default(30),
        price: z.coerce.number().min(0).optional().nullable(),
        preparation_notes: z.string().trim().max(500).optional(),
      })
    )
    .max(25)
    .optional(),
  availability: z
    .array(
      z.object({
        day_of_week: z.coerce.number().int().min(0).max(6),
        is_active: z.boolean(),
        start_time: z.string().min(4).max(8),
        end_time: z.string().min(4).max(8),
      })
    )
    .max(7)
    .optional(),
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

    const {
      skip,
      workspaceName,
      accountType,
      industry,
      timezone,
      needsAppointments,
      systemPrompt,
      services,
      availability,
    } = parsed.data;

    if (skip) {
      await query(
        `UPDATE tenants SET onboarding_completed = TRUE, updated_at = NOW() WHERE id = $1`,
        [ctx.tenantId]
      );
      return NextResponse.json({ ok: true, tenantId: ctx.tenantId, onboardingCompleted: true });
    }

    const chosenIndustry = industry || ctx.tenant.industry || 'general';
    const preset = INDUSTRY_PRESETS[chosenIndustry] || INDUSTRY_PRESETS.general;
    let baseModules = [...preset.defaultModules];
    if (needsAppointments === false) {
      baseModules = baseModules.filter((m) => m !== 'appointments');
    }
    const enabledModules = normalizeModules(baseModules);
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

    if (systemPrompt) {
      await query(
        `INSERT INTO tenant_ai_configs (tenant_id, enabled, system_prompt, use_platform_key)
         VALUES ($1, TRUE, $2, TRUE)
         ON CONFLICT (tenant_id) DO UPDATE SET
           system_prompt = EXCLUDED.system_prompt,
           enabled = TRUE,
           updated_at = NOW()`,
        [ctx.tenantId, systemPrompt]
      );
    }

    if (Array.isArray(services) && services.length > 0) {
      const existingSvc = await query(`SELECT COUNT(*)::int AS total FROM services WHERE tenant_id = $1`, [
        ctx.tenantId,
      ]);
      if ((existingSvc.rows[0]?.total || 0) === 0) {
        for (const svc of services) {
          await query(
            `INSERT INTO services (tenant_id, name, duration_minutes, price, preparation_notes, active)
             VALUES ($1, $2, $3, $4, $5, TRUE)`,
            [
              ctx.tenantId,
              svc.name,
              svc.duration_minutes || 30,
              svc.price ?? null,
              svc.preparation_notes || '',
            ]
          );
        }
      }
    }

    if (Array.isArray(availability) && availability.length > 0) {
      await query(`DELETE FROM availability_rules WHERE tenant_id = $1`, [ctx.tenantId]);
      for (const rule of availability) {
        await query(
          `INSERT INTO availability_rules (tenant_id, day_of_week, is_active, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5)`,
          [ctx.tenantId, rule.day_of_week, Boolean(rule.is_active), rule.start_time, rule.end_time]
        );
      }
    }

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
