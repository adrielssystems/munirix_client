import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { z } from 'zod';
import { getActiveTenantContext } from '@/lib/auth';
import { resolveTenantLLM } from '@/lib/ai/provider';

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
1. Munirix sirve para CUALQUIER tipo de negocio o uso personal (barberías, restaurantes, tiendas, inmobiliarias, abogados, talleres, consultorios médicos, estética, profesores, asistentes personales, etc.). NUNCA asumas que es una clínica médica a menos que el usuario lo diga.
2. Haz preguntas cortas, amables y concretas en español. Si falta información clave (ej: qué hace el negocio/asistente, servicios/productos principales con duración o precio si aplica, días y horario de atención), pregunta en máximo 2 o 3 viñetas cortas.
3. En cuanto tengas suficiente información para armar una primera configuración útil (usualmente tras 1 o 2 respuestas del usuario), genera la configuración completa y pon "ready": true. El usuario podrá ajustarla luego.

FORMATO DE RESPUESTA OBLIGATORIO:
Responde ÚNICAMENTE con un objeto JSON válido (sin markdown \`\`\`json ni texto fuera del JSON) con esta estructura exacta:
{
  "ready": boolean,
  "reply": "Mensaje amable para el usuario en español (si ready=false, haz las preguntas faltantes; si ready=true, resume lo que configuraste y dile que revise la vista previa).",
  "config": null | {
    "workspaceName": "Nombre del negocio o espacio",
    "accountType": "personal" | "business",
    "industry": "personal" | "general" | "aesthetics" | "dermatology" | "health_general" | "legal" | "realestate",
    "needsAppointments": boolean,
    "systemPrompt": "Instrucciones claras y completas en español para el agente de WhatsApp del cliente, incluyendo tono, reglas, servicios y cómo atender o agendar.",
    "services": [
      {
        "name": "Nombre del servicio o producto",
        "duration_minutes": 30,
        "price": 25,
        "preparation_notes": "Nota breve opcional o cadena vacía"
      }
    ],
    "availability": [
      { "day_of_week": 1, "is_active": true, "start_time": "09:00", "end_time": "18:00" },
      { "day_of_week": 2, "is_active": true, "start_time": "09:00", "end_time": "18:00" },
      { "day_of_week": 3, "is_active": true, "start_time": "09:00", "end_time": "18:00" },
      { "day_of_week": 4, "is_active": true, "start_time": "09:00", "end_time": "18:00" },
      { "day_of_week": 5, "is_active": true, "start_time": "09:00", "end_time": "18:00" },
      { "day_of_week": 6, "is_active": false, "start_time": "09:00", "end_time": "13:00" },
      { "day_of_week": 0, "is_active": false, "start_time": "09:00", "end_time": "13:00" }
    ]
  }
}`;

function extractJsonObject(raw) {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('La IA no devolvió un JSON válido.');
  }
}

export async function POST(request) {
  try {
    const ctx = await getActiveTenantContext();
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Conversación inválida.' }, { status: 400 });
    }

    const { messages, workspaceName, timezone } = parsed.data;
    const { model } = await resolveTenantLLM(ctx.tenantId);

    const contextHeader = `Nombre actual del espacio: "${workspaceName || ctx.tenant.name}". Zona horaria: ${timezone || ctx.tenant.timezone || 'America/Caracas'}.`;

    const result = await generateText({
      model,
      system: `${ARCHITECT_SYSTEM_PROMPT}\n\n${contextHeader}`,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.35,
    });

    const data = extractJsonObject(result.text);

    return NextResponse.json({
      ok: true,
      ready: Boolean(data.ready),
      reply: String(data.reply || 'Perfecto, continuemos con tu configuración.'),
      config: data.ready && data.config ? data.config : null,
    });
  } catch (err) {
    console.error('[ONBOARDING AI-ASSIST] Error:', err);
    return NextResponse.json(
      { error: err.message || 'No se pudo consultar al asistente de configuración.' },
      { status: 500 }
    );
  }
}
