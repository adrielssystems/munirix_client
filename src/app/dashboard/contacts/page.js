'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', tags: '', lead_status: 'new' });

  const loadContacts = async () => {
    const res = await fetch('/api/contacts', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      setContacts(json.contacts || []);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: '', phone: '', email: '', tags: '', lead_status: 'new' });
      setShowAdd(false);
      await loadContacts();
    }
  };

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>CRM Contactos</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.2rem' }}>
            Directorio multicanal de leads y clientes con etiquetas y estado comercial.
          </p>
        </div>
        <button type="button" className="hc-btn hc-btn-primary" onClick={() => setShowAdd((v) => !v)}>
          <Plus size={16} />
          <span>Nuevo Contacto</span>
        </button>
      </div>

      {showAdd && (
        <SpotlightCard spotlightColor="#6366F1" intensity={0.14} borderGlow={0.5} style={{ padding: '1.4rem', borderRadius: '16px', backgroundColor: '#111520' }}>
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
            <input className="hc-input" required placeholder="Nombre completo *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="hc-input" required placeholder="Teléfono WhatsApp *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="hc-input" type="email" placeholder="Correo electrónico" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="hc-input" placeholder="Etiquetas (ej. vip, botox)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            <select className="hc-select" value={form.lead_status} onChange={(e) => setForm({ ...form, lead_status: e.target.value })}>
              <option value="new">Nuevo</option>
              <option value="contacted">Contactado</option>
              <option value="qualified">Calificado</option>
              <option value="closed_won">Cliente Activo</option>
            </select>
            <button type="submit" className="hc-btn hc-btn-primary">Guardar Contacto</button>
          </form>
        </SpotlightCard>
      )}

      <div style={{ position: 'relative', maxWidth: '380px' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          className="hc-input"
          style={{ paddingLeft: '2.4rem' }}
          placeholder="Buscar por nombre, teléfono o correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <SpotlightCard spotlightColor="#6366F1" intensity={0.1} borderGlow={0.45} style={{ padding: '1.25rem', borderRadius: '16px', backgroundColor: '#111520' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={30} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
            <p>Sin contactos registrados.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.6rem' }}>Nombre</th>
                  <th style={{ padding: '0.75rem 0.6rem' }}>Teléfono</th>
                  <th style={{ padding: '0.75rem 0.6rem' }}>Canal</th>
                  <th style={{ padding: '0.75rem 0.6rem' }}>Estado</th>
                  <th style={{ padding: '0.75rem 0.6rem' }}>Etiquetas</th>
                  <th style={{ padding: '0.75rem 0.6rem' }}>Citas</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.8rem 0.6rem', fontWeight: 600 }}>{c.name}</td>
                    <td className="tabular" style={{ padding: '0.8rem 0.6rem', color: 'var(--text-secondary)' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '0.8rem 0.6rem' }}><span className="hc-pill hc-pill-emerald">{c.channel}</span></td>
                    <td style={{ padding: '0.8rem 0.6rem' }}><span className="hc-pill hc-pill-indigo">{c.lead_status}</span></td>
                    <td style={{ padding: '0.8rem 0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {(c.tags || []).map((tag) => (
                          <span key={tag} className="hc-pill">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="tabular" style={{ padding: '0.8rem 0.6rem' }}>{c.appointments_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SpotlightCard>
    </div>
  );
}

