'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  MessageSquare,
  CalendarDays,
  Users,
  HeartPulse,
  ClipboardList,
  FileText,
  Camera,
  Building2,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import LogoutButton from '@/components/ui/LogoutButton';
import { getEnabledModuleDefinitions } from '@/lib/modules';
import styles from '@/app/dashboard/dashboard.module.css';

const ICON_MAP = {
  MessageSquare,
  CalendarDays,
  Users,
  HeartPulse,
  ClipboardList,
  FileText,
  Camera,
  Building2,
};

export default function DashboardSidebar({ tenant, user }) {
  const pathname = usePathname();
  const enabledDefs = getEnabledModuleDefinitions(tenant.enabled_modules);
  const coreMods = enabledDefs.filter((m) => m.tier === 'core');
  const verticalMods = enabledDefs.filter((m) => m.tier !== 'core');
  const primaryColor = tenant.branding?.primaryColor || '#6366F1';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandRow}>
          <img
            src="/brand/Logo_Munirix_sin_fondo.png"
            alt="Munirix"
            width={48}
            height={54}
            style={{ width: 'auto', height: 52, objectFit: 'contain' }}
          />
          <h2>Munirix</h2>
        </div>
        <span className={styles.tenantBadge}>{tenant.name}</span>
      </div>

      <nav className={styles.nav}>
        <div className={styles.navLabel}>Workspace</div>
        <Link
          href="/dashboard"
          className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}
        >
          <Home size={18} />
          <span>Panel General</span>
        </Link>

        {coreMods.map((mod) => {
          const Icon = ICON_MAP[mod.icon] || Users;
          const active = pathname === mod.href || pathname.startsWith(`${mod.href}/`);
          return (
            <Link
              key={mod.key}
              href={mod.href}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
            >
              <Icon size={18} />
              <span>{mod.shortLabel}</span>
            </Link>
          );
        })}

        {verticalMods.length > 0 && (
          <>
            <div className={styles.navLabel}>Módulos Activos</div>
            {verticalMods.map((mod) => {
              const Icon = ICON_MAP[mod.icon] || HeartPulse;
              const active = pathname === mod.href || pathname.startsWith(`${mod.href}/`);
              return (
                <Link
                  key={mod.key}
                  href={mod.comingSoon ? '/dashboard/settings?tab=modules' : mod.href}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                >
                  <Icon size={18} />
                  <span>{mod.shortLabel}</span>
                  {mod.comingSoon && <span className={styles.phaseChip}>F{mod.phase}</span>}
                </Link>
              );
            })}
          </>
        )}

        <div className={styles.navLabel}>Sistema</div>
        <Link
          href="/dashboard/settings"
          className={`${styles.navItem} ${pathname.startsWith('/dashboard/settings') ? styles.active : ''}`}
        >
          <Settings size={18} />
          <span>Configuración</span>
        </Link>

        {user.role === 'superadmin' && (
          <Link href={process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/admin` : "https://app.munirix.net/admin"} className={styles.navItem}>
            <Shield size={18} color="#a5b4fc" />
            <span>Partner Admin</span>
          </Link>
        )}
      </nav>

      <div className={styles.userProfile}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.name || user.email}
              referrerPolicy="no-referrer"
              style={{
                width: 30,
                height: 30,
                borderRadius: '9999px',
                objectFit: 'cover',
                border: '1px solid rgba(154, 176, 201, 0.25)',
                flexShrink: 0,
              }}
            />
          )}
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.name || user.email}</span>
            <span className={styles.userRole}>{user.role}</span>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}


