'use client';

import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Video,
  Check,
  RefreshCw,
} from 'lucide-react';
import SpotlightCard from '@/components/ui/SpotlightCard';

const STATUS_STYLE = {
  scheduled: { label: 'Agendada', cls: 'hc-pill-cyan' },
  confirmed: { label: 'Confirmada', cls: 'hc-pill-emerald' },
  completed: { label: 'Completada', cls: 'hc-pill-indigo' },
  cancelled: { label: 'Cancelada', cls: 'hc-pill-coral' },
};

export default function CalendarPage() {
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [timezone, setTimezone] = useState('America/Caracas');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form nueva cita + consulta de slots
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [contactId, setContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [triageReason, setTriageReason] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const res = await fetch('/api/appointments', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      setAppointments(json.appointments || []);
      setServices(json.services || []);
      setContacts(json.contacts || []);
      setTimezone(json.timezone || 'America/Caracas');
      if (!serviceId && json.services?.[0]?.id) {
        setServiceId(json.services[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showNew || !selectedDate) return;
    let active = true;
    const fetchSlots = async () => {
      setLoadingSlots(true);
      setSelectedSlot('');
      const qs = new URLSearchParams({ date: selectedDate });
      if (serviceId) qs.set('serviceId', serviceId);
      const res = await fetch(`/api/appointments/slots?${qs.toString()}`, { cache: 'no-store' });
      if (res.ok && active) {
        const json = await res.json();
        setSlots(json.slots || []);
      }
      if (active) setLoadingSlots(false);
    };
    fetchSlots();
    return () => {
      active = false;
    };
  }, [showNew, selectedDate, serviceId]);

  const handleBook = async (e) => {
    e.preventDefault();
    if (!selectedSlot) {
      setError('Selecciona un bloque horario disponible.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contactId || null,
          newContactName: contactId ? null : newContactName,
          newContactPhone: contactId ? null : newContactPhone,
          serviceId: serviceId || null,
          startAtIso: selectedSlot,
          triageReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'No se pudo reservar la cita.');
      } else {
        setShowNew(false);
        setNewContactName('');
        setNewContactPhone('');
        setTriageReason('');
        setNotice(
          `Cita agendada para ${json.formattedStart}. Recordatorios 24h y 2h programados en Worker${
            json.googleSync?.synced ? ' + sincronizada con Google Calendar' : ''
          }.`
        );
        await loadData();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setNotice('');
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      if (status === 'completed') {
        setNotice('Cita marcada como completada. Se programó el seguimiento automático post-consulta.');
      } else if (status === 'confirmed') {
        setNotice('Cita confirmada.');
      } else if (status === 'cancelled') {
        setNotice('Cita cancelada y removida de recordatorios/Google Calendar.');
      }
      await loadData();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>Agenda & Calendario Inteligente</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginTop: '0.25rem' }}>
            Zona horaria: <strong>{timezone}</strong> · Bloqueos automáticos, Google Calendar y recordatorios WhatsApp 24h/2h.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button type="button" className="hc-btn" onClick={loadData}>
            <RefreshCw size={15} />
            <span>Actualizar</span>
          </button>
          <button type="button" className="hc-btn hc-btn-primary" onClick={() => setShowNew((v) => !v)}>
            <Plus size={16} />
            <span>Nueva Cita</span>
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '12px', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.35)', color: '#a7f3d0', fontSize: '0.86rem' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ padding: '0.8rem 1rem', borderRadius: '12px', background: 'rgba(251,113,133,0.14)', border: '1px solid rgba(251,113,133,0.35)', color: '#fecdd3', fontSize: '0.86rem' }}>
          {error}
        </div>
      )}

      {showNew && (
        <SpotlightCard
          spotlightColor="#22D3EE"
          intensity={0.14}
          borderGlow={0.55}
          style={{ padding: '1.6rem', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem' }}>
            Reservar Bloque Disponible
          </h2>

          <form onSubmit={handleBook} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Motivo / Servicio
                </label>
                <select className="hc-select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Fecha
                </label>
                <input
                  className="hc-input"
                  type="date"
                  value={selectedDate}
                  min={todayStr}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Paciente / Contacto existente
                </label>
                <select className="hc-select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">+ Nuevo paciente rápido</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!contactId && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
                <input
                  className="hc-input"
                  required
                  placeholder="Nombre del paciente *"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                />
                <input
                  className="hc-input"
                  required
                  placeholder="WhatsApp (ej. 584121234567) *"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                />
              </div>
            )}

            <input
              className="hc-input"
              placeholder="Motivo de consulta / Triaje (ej. Control de acné, revisión de lunar en hombro)"
              value={triageReason}
              onChange={(e) => setTriageReason(e.target.value)}
            />

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Horarios disponibles reales ({loadingSlots ? 'consultando...' : `${slots.length} bloques`})
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {!loadingSlots && slots.length === 0 && (
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                    No hay bloques disponibles para esta fecha (verifica horarios de atención o elige otro día).
                  </span>
                )}
                {slots.map((slot) => {
                  const active = selectedSlot === slot.startAt;
                  return (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => setSelectedSlot(slot.startAt)}
                      className={`hc-btn tabular ${active ? 'hc-btn-primary' : ''}`}
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                    >
                      {slot.localTime}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button type="button" className="hc-btn" onClick={() => setShowNew(false)}>
                Cancelar
              </button>
              <button type="submit" className="hc-btn hc-btn-primary" disabled={saving || !selectedSlot}>
                {saving ? 'Agendando...' : 'Confirmar Reserva'}
              </button>
            </div>
          </form>
        </SpotlightCard>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)' }}>Cargando agenda...</div>
      ) : appointments.length === 0 ? (
        <SpotlightCard
          spotlightColor="#6366F1"
          intensity={0.12}
          borderGlow={0.45}
          style={{ padding: '2.5rem', textAlign: 'center', borderRadius: '16px', backgroundColor: '#111520' }}
        >
          <CalendarDays size={36} color="#6366F1" style={{ margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>Agenda despejada</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Crea tu primera cita manual o deja que el Agente IA de WhatsApp comience a agendar pacientes.
          </p>
        </SpotlightCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '1rem' }}>
          {appointments.map((apt) => {
            const st = STATUS_STYLE[apt.status] || STATUS_STYLE.scheduled;
            return (
              <SpotlightCard
                key={apt.id}
                spotlightColor={apt.service_color || '#22D3EE'}
                intensity={0.14}
                borderGlow={0.5}
                style={{ padding: '1.35rem', borderRadius: '16px', backgroundColor: '#111520' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <div>
                    <strong style={{ fontSize: '1.02rem' }}>{apt.contact_name}</strong>
                    <div className="tabular" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {apt.contact_phone}
                    </div>
                  </div>
                  <span className={`hc-pill ${st.cls}`}>{st.label}</span>
                </div>

                <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '0.35rem' }}>{apt.title}</div>
                {apt.triage_reason && (
                  <div style={{ fontSize: '0.8rem', color: '#a5b4fc', marginBottom: '0.5rem' }}>
                    Triaje: {apt.triage_reason}
                  </div>
                )}

                <div className="tabular" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
                  <Clock size={14} color="#22d3ee" />
                  <span>
                    {new Date(apt.start_at).toLocaleString('es-VE', {
                      timeZone: timezone,
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                  <span className="hc-pill">
                    <Sparkles size={11} /> {apt.source}
                  </span>
                  {apt.google_event_id && <span className="hc-pill hc-pill-emerald">Google Calendar</span>}
                  {apt.meet_link && (
                    <a href={apt.meet_link} target="_blank" rel="noreferrer" className="hc-pill hc-pill-cyan">
                      <Video size={11} /> Meet
                    </a>
                  )}
                </div>

                {['scheduled', 'confirmed'].includes(apt.status) && (
                  <div style={{ display: 'flex', gap: '0.45rem', borderTop: '1px solid var(--border-hairline)', paddingTop: '0.8rem', flexWrap: 'wrap' }}>
                    {apt.status === 'scheduled' && (
                      <button
                        type="button"
                        className="hc-btn hc-btn-emerald"
                        style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}
                        onClick={() => handleStatusChange(apt.id, 'confirmed')}
                      >
                        <CheckCircle2 size={13} /> Confirmar
                      </button>
                    )}
                    <button
                      type="button"
                      className="hc-btn"
                      style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}
                      onClick={() => handleStatusChange(apt.id, 'completed')}
                    >
                      <Check size={13} /> Completar
                    </button>
                    <button
                      type="button"
                      className="hc-btn hc-btn-danger"
                      style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}
                      onClick={() => handleStatusChange(apt.id, 'cancelled')}
                    >
                      <XCircle size={13} /> Cancelar
                    </button>
                  </div>
                )}
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

