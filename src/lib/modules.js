/**
 * Registro central de módulos activables (Feature Flags por Tenant - Nivel 2).
 * Cada tenant almacena un arreglo de claves en tenants.enabled_modules (JSONB).
 */

export const MODULE_CATALOG = [
  // Nivel 1: Core SaaS
  {
    key: 'inbox',
    label: 'Bandeja Omnicanal',
    shortLabel: 'Inbox',
    description: 'Chat en vivo de WhatsApp e Instagram con control de Agente IA y pausa humana.',
    tier: 'core',
    phase: 1,
    href: '/dashboard/inbox',
    icon: 'MessageSquare',
    accent: '#10B981',
  },
  {
    key: 'appointments',
    label: 'Agenda & Calendario',
    shortLabel: 'Agenda',
    description: 'Motor de disponibilidad, citas, recordatorios 24h/2h y sincronización Google Calendar.',
    tier: 'core',
    phase: 1,
    href: '/dashboard/calendar',
    icon: 'CalendarDays',
    accent: '#22D3EE',
  },
  {
    key: 'contacts',
    label: 'CRM Contactos',
    shortLabel: 'Contactos',
    description: 'Directorio de leads/clientes con etiquetas, estado e historial de interacciones.',
    tier: 'core',
    phase: 1,
    href: '/dashboard/contacts',
    icon: 'Users',
    accent: '#6366F1',
  },
  // Nivel 2: Vertical Salud / Dermatología
  {
    key: 'patients',
    label: 'Pacientes',
    shortLabel: 'Pacientes',
    description: 'Ficha del paciente con datos demográficos, alergias, antecedentes, seguro y fototipo.',
    tier: 'health',
    phase: 1,
    href: '/dashboard/patients',
    icon: 'HeartPulse',
    accent: '#EC4899',
  },
  {
    key: 'clinical_records',
    label: 'Historias Clínicas',
    shortLabel: 'Historias',
    description: 'Notas de evolución por consulta (Motivo, Examen físico, Diagnóstico, Plan y Skincare).',
    tier: 'health',
    phase: 2,
    href: '/dashboard/clinical',
    icon: 'ClipboardList',
    accent: '#8B5CF6',
    comingSoon: true,
  },
  {
    key: 'prescriptions',
    label: 'Récipes PDF',
    shortLabel: 'Récipes',
    description: 'Generación de récipes e indicaciones en PDF con firma digital y envío a WhatsApp.',
    tier: 'health',
    phase: 2,
    href: '/dashboard/prescriptions',
    icon: 'FileText',
    accent: '#F59E0B',
    comingSoon: true,
  },
  {
    key: 'photo_evolution',
    label: 'Evolución Fotográfica',
    shortLabel: 'Fotos',
    description: 'Galería clínica privada con comparador visual Antes y Después por tratamiento.',
    tier: 'health',
    phase: 2,
    href: '/dashboard/evolution',
    icon: 'Camera',
    accent: '#06B6D4',
    comingSoon: true,
  },
  // Nivel 2: Otros Verticales (Fase 3)
  {
    key: 'properties',
    label: 'Propiedades (Real Estate)',
    shortLabel: 'Propiedades',
    description: 'Catálogo de inmuebles, fichas y agendamiento de visitas para agencias inmobiliarias.',
    tier: 'realestate',
    phase: 3,
    href: '/dashboard/properties',
    icon: 'Building2',
    accent: '#F97316',
    comingSoon: true,
  },
];

export const INDUSTRY_PRESETS = {
  personal: {
    label: 'Agente Personal',
    defaultModules: ['inbox', 'appointments', 'contacts'],
  },
  dermatology: {
    label: 'Salud / Dermatología',
    defaultModules: ['inbox', 'appointments', 'contacts', 'patients'],
    fullModules: ['inbox', 'appointments', 'contacts', 'patients', 'clinical_records', 'prescriptions', 'photo_evolution'],
  },
  health_general: {
    label: 'Salud / Consultorio Médico',
    defaultModules: ['inbox', 'appointments', 'contacts', 'patients'],
  },
  aesthetics: {
    label: 'Clínica Estética & Spa',
    defaultModules: ['inbox', 'appointments', 'contacts', 'patients'],
  },
  legal: {
    label: 'Servicios Legales / Asesoría',
    defaultModules: ['inbox', 'appointments', 'contacts'],
  },
  realestate: {
    label: 'Bienes Raíces',
    defaultModules: ['inbox', 'appointments', 'contacts', 'properties'],
  },
  general: {
    label: 'Negocio de Servicios (Core)',
    defaultModules: ['inbox', 'appointments', 'contacts'],
  },
};

export const VALID_MODULE_KEYS = new Set(MODULE_CATALOG.map((m) => m.key));

export function normalizeModules(modulesInput) {
  if (!Array.isArray(modulesInput)) {
    return ['inbox', 'appointments', 'contacts'];
  }
  const filtered = modulesInput.filter((key) => typeof key === 'string' && VALID_MODULE_KEYS.has(key));
  return Array.from(new Set(filtered));
}

export function hasModule(enabledModules, moduleKey) {
  if (!Array.isArray(enabledModules)) return false;
  return enabledModules.includes(moduleKey);
}

export function getEnabledModuleDefinitions(enabledModules) {
  const normalized = normalizeModules(enabledModules);
  return MODULE_CATALOG.filter((m) => normalized.includes(m.key));
}

