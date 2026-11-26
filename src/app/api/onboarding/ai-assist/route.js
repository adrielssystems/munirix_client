import { NextResponse } from 'next/server';
import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getActiveTenantContext } from '@/lib/auth';
import { resolveTenantLLM, resolveFallbackLLM } from '@/lib/ai/provider';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
  workspaceName: z.string().optional(),
  timezone: z.string().optional(),
});

const ARCHITECT_SYSTEM_PROMPT = `Eres el Arquitecto de Configuración de Munirix. Tu objetivo es ayudar a cualquier cliente (sin conocimientos técnicos) a configurar su Agente de IA para WhatsApp y su Agenda en pocos mensajes.

REGLAS DE CONVERSACIÓN:
1. Munirix sirve para CUALQUIER tipo de negocio o uso personal (barberías, restaurantes, tiendas, inmobiliarias, abogados, talleres, consultorios, estética, asistentes personales, etc.). NUNCA asumas que es una clínica médica a menos que el usuario lo diga.
2. Haz preguntas cortas, amables y concretas en español.
3. En cuanto el usuario te dé suficiente contexto (por ejemplo, tras 1 o 2 mensajes claros como "quiero un asistente personal para mi agenda"), NO sigas haciendo preguntas innecesarias: llama inmediatamente a la herramienta \`apply_onboarding_config\` con una configuración completa y práctica (para uso personal, puedes usar \`industry: "personal"\`, \`accountType: "personal"\`, servicios opcionales vacíos \`[]\` y horario estándar Lunes-Viernes 08:00-18:00), y luego responde amablemente explicando lo que dejaste listo.`;

export async function POST(request) {
  try {
    const ctx = await getActiveTenantContext();
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }
    if (ctx.tenant.status === 'pending_payment' && ctx.user.role !== 'superadmin') {
      return NextResponse.json({ error: 'Tu prueba gratuita expiró. Activa un plan para continuar.' }, { status: 402 });
    }

    const rl = checkRateLimit(`ai-assist:${ctx.tenantId}`, { limit: 20, windowMs: 10 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiadas consultas seguidas al asistente. Espera unos minutos.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Conversación inválida.' }, { status: 400 });
    }

    const { messages, workspaceName, timezone } = parsed.data;
    const { model, provider } = await resolveTenantLLM(ctx.tenantId);

    const contextHeader = `Nombre actual del espacio: "${workspaceName || ctx.tenant.name}". Zona horaria: ${timezone || ctx.tenant.timezone || 'America/Caracas'}.`;

    let generatedConfig = null;

    const runArchitect = (activeModel) =>
      generateText({
        model: activeModel,
        system: `${ARCHITECT_SYSTEM_PROMPT}\n\n${contextHeader}`,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.35,
        stopWhen: stepCountIs(3),
        tools: {
          apply_onboarding_config: tool({
            description: 'Guarda la configuración propuesta para el espacio y agente del cliente cuando ya se tiene suficiente información.',
            inputSchema: z.object({
              workspaceName: z.string().describe('Nombre del negocio o espacio personal'),
              accountType: z.enum(['personal', 'business']),
              industry: z.enum(['personal', 'general', 'aesthetics', 'dermatology', 'health_general', 'legal', 'realestate']),
              needsAppointments: z.boolean(),
              systemPrompt: z.string().describe('Instrucciones detalladas en español para el agente de WhatsApp'),
              services: z
                .array(
                  z.object({
                    name: z.string(),
                    duration_minutes: z.number().int().min(5).max(480).default(30),
                    price: z.number().nullable().optional(),
                    preparation_notes: z.string().optional(),
                  })
                )
                .default([]),
              availability: z
                .array(
                  z.object({
                    day_of_week: z.number().int().min(0).max(6),
                    is_active: z.boolean(),
                    start_time: z.string(),
                    end_time: z.string(),
                  })
                )
                .default([]),
            }),
            execute: async (configInput) => {
              generatedConfig = configInput;
              return { ok: true };
            },
          }),
        },
      });

    let result;
    try {
      result = await runArchitect(model);
    } catch (primaryErr) {
      const fb = resolveFallbackLLM(provider);
      if (!fb) throw primaryErr;
      console.warn(`[ONBOARDING AI-ASSIST] Fallback a ${fb.provider} por error en ${provider}:`, primaryErr.message);
      generatedConfig = null;
      result = await runArchitect(fb.model);
    }

    const replyText =
      String(result.text || '').trim() ||
      (generatedConfig
        ? '¡Listo! Ya preparé la configuración ideal para tu agente. Revisa el resumen abajo y presiona Guardar.'
        : 'Cuéntame un poco más sobre cómo trabajas para terminar de configurarlo.');

    return NextResponse.json({
      ok: true,
      ready: Boolean(generatedConfig),
      reply: replyText,
      config: generatedConfig,
    });
  } catch (err) {
    console.error('[ONBOARDING AI-ASSIST] Error:', err);
    return NextResponse.json(
      { error: err.message || 'No se pudo consultar al asistente de configuración.' },
      { status: 500 }
    );
  }
}
