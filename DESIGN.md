# Munirix — DESIGN.md ("Obsidian Prism")

## 1. Visual Theme & Atmosphere
Munirix uses a high-craft dark-chrome system engineered for multi-tenant SaaS operations and modern medical/service clinics.
- **Persuade surfaces** (Landing `/`, Login `/login`): cinematic obsidian canvas layered with interactive WebGL aurora (`SoftAurora`), crisp display typography (`Space Grotesk` + `Inter`), and spotlight-reactive cards.
- **Operate surfaces** (Tenant Dashboard `/dashboard/*`, Admin Console `/admin/*`, Calendar, Inbox): restrained dark elevation ladder (`#07080A` → `#0D1017` → `#131824`), crisp 1px hairlines, tabular numbers (`font-variant-numeric: tabular-nums`), high-contrast legibility (≥4.5:1), and tactile micro-interactions (`SquishSwitch`, `SpotlightCard`, `CountUp`) without visual noise.

## 2. Color Palette & Roles
| Token | Hex / Value | Role |
| :--- | :--- | :--- |
| `--bg-canvas` | `#07080A` | Primary viewport canvas |
| `--bg-surface` | `#0D1017` | Sidebar, header, primary containers |
| `--bg-elevated` | `#131824` | Interactive panels, modals, table headers |
| `--bg-hover` | `#1A2132` | Hover states on rows and navigation items |
| `--border-hairline` | `rgba(255, 255, 255, 0.08)` | Default structural borders |
| `--border-strong` | `rgba(255, 255, 255, 0.16)` | Active/focused container borders |
| `--text-primary` | `#F4F6FA` | Primary headings and values |
| `--text-secondary` | `#9CA6BA` | Supporting text, labels, metadata |
| `--text-muted` | `#667085` | Placeholders, disabled labels |
| `--accent-primary` | `#6366F1` | Primary brand CTA, AI orchestration, active routes (overridable via `tenant.branding.primaryColor`) |
| `--accent-cyan` | `#22D3EE` | Clinical/scheduling highlights, Google Calendar sync |
| `--accent-emerald` | `#10B981` | Confirmed appointments, WhatsApp live status, active tenants |
| `--accent-amber` | `#F59E0B` | Pending confirmation, rescheduled, warnings |
| `--accent-coral` | `#FB7185` | Cancelled, errors, destructive actions |

## 3. Typography Rules
- **Display / Headings:** `Space Grotesk` (weights 500–700), tight tracking (`-0.025em` to `-0.03em`), balanced line-height (`1.1`–`1.2`).
- **Body / UI Controls:** `Inter` (weights 400–600), crisp legibility at `14px`–`15px`, `line-height: 1.5`.
- **Data & Timestamps:** `tabular-nums` enabled across all KPIs, calendar hours, phone numbers, and durations.

## 4. Component & Motion Principles
- **Elevation:** Prefer `1px solid var(--border-hairline)` + subtle reactive spotlight (`SpotlightCard`) over heavy drop shadows. Card border radius: `14px`–`18px`. Pill radius reserved for compact badges and primary CTA buttons.
- **Authored Motion:** Use `SoftAurora` solely on full-bleed atmospheric canvases (Landing/Login); use `SpotlightCard`, `CountUp`, `BlurText`, and `SquishSwitch` purposefully on interactive controls and metrics. Always honor `prefers-reduced-motion`.
- **Browser Surfaces:** Custom dark scrollbars, indigo text selection (`rgba(99,102,241,0.32)`), and visible `2px` keyboard focus rings (`var(--accent-cyan)`).
