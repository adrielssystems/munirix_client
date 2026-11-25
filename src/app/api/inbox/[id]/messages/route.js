import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getActiveTenantContext } from '@/lib/auth';
import { sendWhatsAppText } from '@/lib/meta/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const ctx = await getActiveTenantContext('inbox');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { id } = await params;

  const [convRes, msgsRes] = await Promise.all([
    query(
      `SELECT cv.*, c.name AS contact_name, c.phone AS contact_phone
       FROM conversations cv
       JOIN contacts c ON c.id = cv.contact_id
       WHERE cv.id = $1 AND cv.tenant_id = $2 LIMIT 1`,
      [id, ctx.tenantId]
    ),
    query(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC
       LIMIT 100`,
      [id, ctx.tenantId]
    ),
  ]);

  if (convRes.rowCount === 0) {
    return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });
  }

  // Marcar como leída
  await query(`UPDATE conversations SET unread_count = 0 WHERE id = $1 AND tenant_id = $2`, [
    id,
    ctx.tenantId,
  ]);

  return NextResponse.json({ conversation: convRes.rows[0], messages: msgsRes.rows });
}

export async function POST(req, { params }) {
  const ctx = await getActiveTenantContext('inbox');
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const { id } = await params;
    const body = await req.json();

    // Permitir pausar/reanudar IA en la conversación
    if (body.ai_enabled !== undefined) {
      const aiOn = Boolean(body.ai_enabled);
      const upd = await query(
        `UPDATE conversations
         SET ai_enabled = $1, status = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4
         RETURNING *`,
        [aiOn, aiOn ? 'open' : 'paused_ai', id, ctx.tenantId]
      );
      return NextResponse.json({ conversation: upd.rows[0] });
    }

    const text = String(body.text || '').trim();
    if (!text) return NextResponse.json({ error: 'Mensaje vacío.' }, { status: 400 });

    const convRes = await query(
      `SELECT cv.id, cv.channel, cv.session_id, c.phone
       FROM conversations cv
       JOIN contacts c ON c.id = cv.contact_id
       WHERE cv.id = $1 AND cv.tenant_id = $2 LIMIT 1`,
      [id, ctx.tenantId]
    );
    const conv = convRes.rows[0];
    if (!conv) return NextResponse.json({ error: 'Conversación no encontrada.' }, { status: 404 });

    const sent = await sendWhatsAppText({
      tenantId: ctx.tenantId,
      toPhone: conv.phone || conv.session_id,
      text,
      conversationId: conv.id,
      senderType: 'agent',
      senderId: ctx.user.id,
    });

    return NextResponse.json({ ok: true, ...sent });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
