'use client';

import { useEffect, useState } from 'react';
import { HeartPulse, Plus, Save, X } from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState({
    contact_id: '',
    name: '',
    phone: '',
    email: '',
    document_id: '',
    birth_date: '',
    gender: '',
    insurance_provider: '',
    allergies: '',
    medical_history: '',
    skin_type: '',
    current_routine: '',
  });

  const loadPatients = async () => {
    const res = await fetch('/api/patients', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      setPatients(json.patients || []);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const openEdit = (p) => {
    setSelected(p);
    setShowNew(true);
    setForm({
      contact_id: p.contact_id,
      name: p.name || '',
      phone: p.phone || '',
      email: p.email || '',
      document_id: p.document_id || '',
      birth_date: p.birth_date ? String(p.birth_date).slice(0, 10) : '',
      gender: p.gender || '',
      insurance_provider: p.insurance_provider || '',
      allergies: p.allergies || '',
      medical_history: p.medical_history || '',
      skin_type: p.skin_type || '',
      current_routine: p.current_routine || '',
    });
  };

  const openCreate = () => {
    setSelected(null);
    setShowNew(true);
    setForm({
      contact_id: '',
      name: '',
      phone: '',
      email: '',
      document_id: '',
      birth_date: '',
      gender: '',
      insurance_provider: '',
      allergies: '',
      medical_history: '',
      skin_type: '',
      current_routine: '',
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowNew(false);
        setNotice('Ficha del paciente guardada.');
        await loadPatients();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>Ficha de Pacientes (Dermatología)</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.2rem' }}>
            Datos demográficos, alergias, antecedentes, seguro médico, fototipo y rutina skincare actual.
          </p>
        </div>
        <button type="button" className="hc-btn hc-btn-primary" onClick={openCreate}>
          <Plus size={16} />
          <span>Nuevo Paciente</span>
        </button>
      </div>

      {notice && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '12px', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.35)', color: '#a7f3d0', fontSize: '0.86rem' }}>
          {notice}
        </div>
      )}

      {showNew && (
        <SpotlightCard spotlightColor="#EC4899" intensity={0.14} borderGlow={0.55} style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>
              {selected ? `Ficha Clínica Básica — ${selected.name}` : 'Registrar Nuevo Paciente'}
            </h2>
            <button type="button" className="hc-btn" onClick={() => setShowNew(false)}>
              <X size={15} />
            </button>
          </div>

          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
            {!selected && (
              <>
                <input className="hc-input" required placeholder="Nombre completo *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="hc-input" required placeholder="Teléfono WhatsApp *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input className="hc-input" type="email" placeholder="Correo electrónico" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </>
            )}
            <input className="hc-input" placeholder="Cédula / Documento ID" value={form.document_id} onChange={(e) => setForm({ ...form, document_id: e.target.value })} />
            <input className="hc-input" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            <input className="hc-input" placeholder="Seguro Médico" value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} />
            <input className="hc-input" placeholder="Tipo de piel / Fototipo (ej. Mixta, Fitzpatrick III)" value={form.skin_type} onChange={(e) => setForm({ ...form, skin_type: e.target.value })} />
            <textarea className="hc-textarea" rows={2} placeholder="Alergias conocidas (medicamentos, cosméticos...)" value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} />
            <textarea className="hc-textarea" rows={2} placeholder="Antecedentes médicos / dermatológicos" value={form.medical_history} onChange={(e) => setForm({ ...form, medical_history: e.target.value })} />
            <textarea className="hc-textarea" style={{ gridColumn: '1 / -1' }} rows={2} placeholder="Rutina skincare actual del paciente" value={form.current_routine} onChange={(e) => setForm({ ...form, current_routine: e.target.value })} />

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button type="button" className="hc-btn" onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="submit" className="hc-btn hc-btn-primary" disabled={saving}>
                <Save size={15} />
                <span>{saving ? 'Guardando...' : 'Guardar Ficha'}</span>
              </button>
            </div>
          </form>
        </SpotlightCard>
      )}

      {patients.length === 0 ? (
        <SpotlightCard spotlightColor="#EC4899" intensity={0.12} borderGlow={0.45} style={{ padding: '2.5rem', textAlign: 'center', borderRadius: '16px', backgroundColor: '#111520' }}>
          <HeartPulse size={34} color="#EC4899" style={{ margin: '0 auto 0.65rem' }} />
          <h3>Sin pacientes registrados aún</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.3rem' }}>
            Crea una ficha o agenda una cita desde WhatsApp para que el paciente aparezca automáticamente aquí.
          </p>
        </SpotlightCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {patients.map((p) => (
            <SpotlightCard
              key={p.contact_id}
              spotlightColor="#EC4899"
              intensity={0.14}
              borderGlow={0.5}
              style={{ padding: '1.35rem', borderRadius: '16px', backgroundColor: '#111520' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div>
                  <strong style={{ fontSize: '1.02rem' }}>{p.name}</strong>
                  <div className="tabular" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {p.phone} {p.document_id ? `· ID ${p.document_id}` : ''}
                  </div>
                </div>
                <span className="hc-pill hc-pill-indigo tabular">{p.visits_count || 0} citas</span>
              </div>

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
                {p.skin_type && <span className="hc-pill hc-pill-cyan">{p.skin_type}</span>}
                {p.insurance_provider && <span className="hc-pill hc-pill-emerald">{p.insurance_provider}</span>}
                {p.allergies && <span className="hc-pill hc-pill-coral">Alergias registradas</span>}
              </div>

              {p.allergies && (
                <p style={{ fontSize: '0.8rem', color: '#fda4af', marginBottom: '0.4rem' }}>
                  <strong>Alergias:</strong> {p.allergies}
                </p>
              )}
              {p.medical_history && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                  <strong>Antecedentes:</strong> {p.medical_history}
                </p>
              )}

              <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="hc-btn" style={{ padding: '0.42rem 0.8rem', fontSize: '0.8rem' }} onClick={() => openEdit(p)}>
                  Editar Ficha
                </button>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}
    </div>
  );
}

