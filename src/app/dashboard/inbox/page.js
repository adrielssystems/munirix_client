'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Send, Bot, User, RefreshCw } from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';
import SquishSwitch from '@/components/ui/SquishSwitch';

export default function InboxPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const loadConversations = async () => {
    const res = await fetch('/api/inbox', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      setConversations(json.conversations || []);
      if (!selectedId && json.conversations?.[0]?.id) {
        setSelectedId(json.conversations[0].id);
      }
    }
  };

  const loadThread = async (id) => {
    if (!id) return;
    const res = await fetch(`/api/inbox/${id}/messages`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      setActiveConv(json.conversation);
      setMessages(json.messages || []);
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadThread(selectedId);
  }, [selectedId]);

  const handleToggleAI = async (checked) => {
    if (!selectedId) return;
    const res = await fetch(`/api/inbox/${selectedId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_enabled: checked }),
    });
    if (res.ok) {
      setActiveConv((prev) => (prev ? { ...prev, ai_enabled: checked } : prev));
      await loadConversations();
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !selectedId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/inbox/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft }),
      });
      if (res.ok) {
        setDraft('');
        await loadThread(selectedId);
        await loadConversations();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>Bandeja Omnicanal</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.2rem' }}>
            Monitorea conversaciones de WhatsApp e Instagram y toma control humano cuando lo necesites.
          </p>
        </div>
        <button
          type="button"
          className="hc-btn"
          onClick={() => {
            loadConversations();
            if (selectedId) loadThread(selectedId);
          }}
        >
          <RefreshCw size={15} />
          <span>Actualizar</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', minHeight: '620px' }}>
        <SpotlightCard
          spotlightColor="#10B981"
          intensity={0.1}
          borderGlow={0.45}
          style={{ padding: '0.9rem', borderRadius: '16px', backgroundColor: '#111520', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', padding: '0.35rem 0.5rem', textTransform: 'uppercase' }}>
            Conversaciones ({conversations.length})
          </div>

          {conversations.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Aún no llegan mensajes a los webhooks de este tenant.
            </div>
          ) : (
            conversations.map((cv) => {
              const active = cv.id === selectedId;
              return (
                <button
                  key={cv.id}
                  type="button"
                  onClick={() => setSelectedId(cv.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.8rem 0.85rem',
                    borderRadius: '12px',
                    border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid transparent',
                    background: active ? 'rgba(99,102,241,0.14)' : 'rgba(7,8,10,0.55)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{cv.contact_name}</strong>
                    <span className={`hc-pill ${cv.channel === 'whatsapp' ? 'hc-pill-emerald' : 'hc-pill-indigo'}`} style={{ fontSize: '0.68rem' }}>
                      {cv.channel}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cv.last_message_preview || 'Sin mensajes'}
                  </p>
                </button>
              );
            })
          )}
        </SpotlightCard>

        <SpotlightCard
          spotlightColor="#6366F1"
          intensity={0.1}
          borderGlow={0.45}
          style={{ padding: '1.25rem', borderRadius: '16px', backgroundColor: '#111520', display: 'flex', flexDirection: 'column' }}
        >
          {!activeConv ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <MessageSquare size={36} style={{ marginBottom: '0.6rem', opacity: 0.5 }} />
              <p>Selecciona una conversación para ver el historial y responder.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.9rem', borderBottom: '1px solid var(--border-hairline)', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <strong style={{ fontSize: '1.05rem' }}>{activeConv.contact_name}</strong>
                  <div className="tabular" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {activeConv.contact_phone || activeConv.session_id}
                  </div>
                </div>
                <SquishSwitch
                  checked={Boolean(activeConv.ai_enabled)}
                  onChange={handleToggleAI}
                  width={50}
                  height={27}
                  radius={14}
                  trackColor="#232836"
                  trackOnColor="#10B981"
                  thumbColor="#94a3b8"
                  thumbOnColor="#07080a"
                  label={activeConv.ai_enabled ? 'Agente IA Activo' : 'IA Pausada (Manual)'}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingRight: '0.35rem', maxHeight: '440px' }}>
                {messages.map((m) => {
                  const isContact = m.sender_type === 'contact';
                  return (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: isContact ? 'flex-start' : 'flex-end',
                        maxWidth: '78%',
                        padding: '0.75rem 0.95rem',
                        borderRadius: '13px',
                        background: isContact
                          ? 'rgba(255,255,255,0.06)'
                          : m.sender_type === 'bot'
                          ? 'rgba(99,102,241,0.22)'
                          : 'rgba(16,185,129,0.22)',
                        border: '1px solid var(--border-hairline)',
                        fontSize: '0.86rem',
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        {m.sender_type === 'bot' ? <Bot size={12} /> : <User size={12} />}
                        <span>{isContact ? activeConv.contact_name : m.sender_type === 'bot' ? 'Agente IA' : 'Asesor'}</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border-hairline)' }}>
                <input
                  className="hc-input"
                  placeholder="Escribe una respuesta manual por WhatsApp..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="hc-btn hc-btn-primary" disabled={sending || !draft.trim()}>
                  <Send size={15} />
                  <span>Enviar</span>
                </button>
              </form>
            </>
          )}
        </SpotlightCard>
      </div>
    </div>
  );
}

