import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { query } from '../db.js';
import { resolveTenantLLM } from '../ai/provider.js';
import {
  getAvailableSlots,
  createAppointment,
  updateAppointmentState,
  formatInTimezone,
} from '../scheduling/slots.js';

/**
 * Ejecuta el Agente IA Multitenant con memoria conversacional + triaje dermatológico + Tool Calling.
 * Funciona con cualquier proveedor LLM elegido por el tenant (Gemini, DeepSeek, OpenAI, Anthropic).
 */
export async function runTenantAIAgent({
  tenantId,
  contactId = null,
  conversationId = null,
  userMessage,
  channel = 'whatsapp',
  simulate = false,
}) {
  const [tenantRes, servicesRes, historyRes] = await Promise.all([
    query(`SELECT id, name, industry, timezone, enabled_modules FROM tenants WHERE id = $1 LIMIT 1`, [tenantId]),
    query(
      `SELECT id, name, description, duration_minutes, price, currency, preparation_notes, triage_keywords
       FROM services WHERE tenant_id = $1 AND is_active = true ORDER BY name ASC`,
      [tenantId]
    ),
    conversationId
      ? query(
          `SELECT sender_type, content FROM messages
           WHERE tenant_id = $1 AND conversation_id = $2
           ORDER BY created_at DESC LIMIT 16`,
          [tenantId, conversationId]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const tenant = tenantRes.rows[0];
  if (!tenant) throw new Error('Tenant no encontrado.');

  const { model, provider, modelName, config } = await resolveTenantLLM(tenantId);

  if (!simulate && !config.enabled) {
    return { skipped: true, reason: 'ai_disabled' };
  }

  // Verificar palabras clave de escalamiento humano inmediato
  const lowerMsg = String(userMessage || '').toLowerCase();
  const handoffWords = Array.isArray(config.handoff_keywords) ? config.handoff_keywords : [];
  if (!simulate && conversationId && handoffWords.some((kw) => kw && lowerMsg.includes(kw.toLowerCase()))) {
    await query(
      `UPDATE conversations SET ai_enabled = false, status = 'paused_ai', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    return {
      reply:
        'Entendido. Acabo de transferir tu conversación a un asesor humano del equipo para atenderte personalmente en breve.',
      provider,
      modelName,
      handoff: true,
      toolCalls: [],
    };
  }

  const nowStr = formatInTimezone(new Date(), tenant.timezone || 'America/Caracas');
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: tenant.timezone || 'America/Caracas',
  }).format(new Date());

  const servicesSummary = servicesRes.rows
    .map(
      (s) =>
        `- ID: ${s.id} | ${s.name} | Duración: ${s.duration_minutes} min | Precio: ${
          s.price ? `${s.price} ${s.currency}` : 'Consultar'
        } | Palabras clave: ${(s.triage_keywords || []).join(', ')} | Preparación: ${
          s.preparation_notes || 'Ninguna'
        }`
    )
    .join('\n');

  const systemPrompt = [
    config.system_prompt ||
      `Eres el asistente virtual de agendamiento de ${tenant.name}. Responde en español, de forma cálida, clara y concisa.`,
    config.knowledge_base ? `\n### Base de Conocimiento del Consultorio / Negocio:\n${config.knowledge_base}` : '',
    config.triage_enabled
      ? `\n### Regla de Triaje Obligatoria:\n${
          config.triage_prompt ||
          'Antes de confirmar una cita, pregunta el motivo de consulta para elegir el servicio con la duración correcta e indica cualquier preparación previa.'
        }`
      : '',
    `\n### Catálogo Activo de Servicios:\n${servicesSummary || 'Sin servicios cargados.'}`,
    `\n### Contexto Actual:\n- Fecha hoy (${tenant.timezone}): ${todayIso} (${nowStr})\n- Canal: ${channel}\n- Usa siempre las herramientas disponibles para consultar disponibilidad real antes de ofrecer horarios y para agendar, reprogramar o cancelar citas. Nunca inventes disponibilidad.`,
  ]
    .filter(Boolean)
    .join('\n');

  const priorMessages = historyRes.rows
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({
      role: m.sender_type === 'contact' ? 'user' : 'assistant',
      content: m.content,
    }));

  // Asegurar que el mensaje actual esté al final
  if (
    priorMessages.length === 0 ||
    priorMessages[priorMessages.length - 1].role !== 'user' ||
    priorMessages[priorMessages.length - 1].content !== userMessage
  ) {
    priorMessages.push({ role: 'user', content: userMessage });
  }

  const executedTools = [];

  const tools = {
    get_services_catalog: tool({
      description: 'Devuelve la lista de servicios, precios, duraciones y preparación previa del consultorio.',
      inputSchema: z.object({}),
      execute: async () => {
        executedTools.push('get_services_catalog');
        return { services: servicesRes.rows };
      },
    }),

    check_available_slots: tool({
      description:
        'Consulta los horarios realmente disponibles para una fecha (YYYY-MM-DD) y servicio específico, cruzando la agenda interna y Google Calendar.',
      inputSchema: z.object({
        date: z.string().describe('Fecha en formato YYYY-MM-DD'),
        serviceId: z.string().optional().describe('UUID del servicio seleccionado según el motivo de consulta'),
      }),
      execute: async ({ date, serviceId }) => {
        executedTools.push(`check_available_slots(${date})`);
        const availability = await getAvailableSlots({
          tenantId,
          dateStr: date,
          serviceId: serviceId || null,
        });
        return {
          date: availability.date,
          timezone: availability.timezone,
          durationMinutes: availability.durationMinutes,
          availableSlots: availability.slots.slice(0, 12),
          totalSlots: availability.slots.length,
        };
      },
    }),

    book_appointment: tool({
      description: 'Reserva oficialmente una cita en la agenda y la sincroniza con Google Calendar.',
      inputSchema: z.object({
        serviceId: z.string().describe('UUID del servicio según el triaje'),
        startAtIso: z.string().describe('Fecha y hora exacta en formato ISO obtenida de check_available_slots'),
        triageReason: z.string().describe('Motivo de consulta expresado por el paciente/cliente'),
      }),
      execute: async ({ serviceId, startAtIso, triageReason }) => {
        executedTools.push(`book_appointment(${startAtIso})`);
        if (simulate || !contactId) {
          return {
            simulated: true,
            message: `Simulación exitosa: se reservaría el servicio ${serviceId} el ${startAtIso} por motivo "${triageReason}".`,
          };
        }
        const booked = await createAppointment({
          tenantId,
          contactId,
          serviceId,
          startAtIso,
          triageReason,
          source: `ai_${channel}`,
        });
        return {
          booked: true,
          appointmentId: booked.appointment.id,
          formattedStart: booked.formattedStart,
          serviceName: booked.service?.name || booked.appointment.title,
          preparationNotes: booked.service?.preparation_notes || null,
          googleSynced: booked.googleSync?.synced || false,
        };
      },
    }),

    list_patient_appointments: tool({
      description: 'Lista las citas próximas activas del paciente actual para reprogramar o cancelar.',
      inputSchema: z.object({}),
      execute: async () => {
        executedTools.push('list_patient_appointments');
        if (!contactId) return { appointments: [] };
        const res = await query(
          `SELECT id, title, start_at, status, triage_reason
           FROM appointments
           WHERE tenant_id = $1 AND contact_id = $2
             AND status IN ('scheduled', 'confirmed') AND start_at >= NOW()
           ORDER BY start_at ASC LIMIT 5`,
          [tenantId, contactId]
        );
        return {
          appointments: res.rows.map((a) => ({
            ...a,
            formattedStart: formatInTimezone(a.start_at, tenant.timezone),
          })),
        };
      },
    }),

    reschedule_appointment: tool({
      description: 'Reprograma una cita existente a una nueva fecha y hora ISO disponible.',
      inputSchema: z.object({
        appointmentId: z.string(),
        newStartAtIso: z.string(),
      }),
      execute: async ({ appointmentId, newStartAtIso }) => {
        executedTools.push(`reschedule_appointment(${appointmentId})`);
        if (simulate) return { simulated: true, appointmentId, newStartAtIso };
        const updated = await updateAppointmentState({
          tenantId,
          appointmentId,
          newStartAtIso,
        });
        return { rescheduled: true, formattedStart: updated.formattedStart };
      },
    }),

    cancel_appointment: tool({
      description: 'Cancela una cita existente del paciente y la elimina de Google Calendar.',
      inputSchema: z.object({
        appointmentId: z.string(),
        reason: z.string().optional(),
      }),
      execute: async ({ appointmentId, reason }) => {
        executedTools.push(`cancel_appointment(${appointmentId})`);
        if (simulate) return { simulated: true, appointmentId };
        await updateAppointmentState({
          tenantId,
          appointmentId,
          status: 'cancelled',
          cancellationReason: reason || 'Cancelada por el paciente vía WhatsApp',
        });
        return { cancelled: true };
      },
    }),

    handoff_to_human: tool({
      description: 'Pausa el agente IA y deriva la conversación a un asesor humano o a la doctora.',
      inputSchema: z.object({
        reason: z.string(),
      }),
      execute: async ({ reason }) => {
        executedTools.push('handoff_to_human');
        if (!simulate && conversationId) {
          await query(
            `UPDATE conversations SET ai_enabled = false, status = 'paused_ai', updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [conversationId, tenantId]
          );
        }
        return { handedOff: true, reason };
      },
    }),
  };

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: priorMessages,
    temperature: Number(config.temperature ?? 0.3),
    tools,
    stopWhen: stepCountIs(5),
  });

  return {
    reply: result.text || '¿En qué horario te gustaría agendar tu consulta?',
    provider,
    modelName,
    toolCalls: executedTools,
    handoff: executedTools.includes('handoff_to_human'),
  };
}

