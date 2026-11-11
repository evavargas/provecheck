import {
  Building2,
  ClipboardList,
  Gavel,
  History,
  House,
  LogOut,
  Menu,
  Settings,
  Star,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { LogoMark } from '../components/Icon';
import { PreferenceControls } from '../components/PreferenceControls';
import { useSession } from '../session';

interface NavItem {
  key: string;
  icon: LucideIcon;
  to?: string;
}

// Only the sections that exist are links; the rest keep their place in the menu, disabled.
const NAV: NavItem[] = [
  { key: 'home', icon: House, to: '/' },
  { key: 'tasks', icon: ClipboardList },
  { key: 'objections', icon: Gavel },
  { key: 'companies', icon: Building2 },
  { key: 'users', icon: Users, to: '/users' },
  { key: 'ratings', icon: Star },
  { key: 'serviceTypes', icon: Wrench },
  { key: 'audit', icon: History },
  { key: 'settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  const [open, setOpen] = useState(false);

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className="sidebar" data-open={open}>
        <div className="sidebar-brand">
          <LogoMark size={36} />
          <span className="sidebar-name">{t('app.name')}</span>
          <button
            className="icon-button sidebar-close"
            onClick={() => setOpen(false)}
            aria-label={t('nav.close')}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <nav aria-label={t('app.name')}>
          {NAV.map(({ key, icon: Icon, to }) =>
            to ? (
              <NavLink
                key={key}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                title={t(`nav.${key}`)}
                onClick={() => setOpen(false)}
              >
                <Icon size={20} aria-hidden />
                <span>{t(`nav.${key}`)}</span>
              </NavLink>
            ) : (
              <span
                key={key}
                className="nav-item disabled"
                aria-disabled="true"
                title={`${t(`nav.${key}`)} · ${t('nav.soon')}`}
              >
                <Icon size={20} aria-hidden />
                <span>{t(`nav.${key}`)}</span>
              </span>
            ),
          )}
        </nav>
        <button className="nav-item logout" onClick={session.logout} title={t('common.logout')}>
          <LogOut size={20} aria-hidden />
          <span>{t('common.logout')}</span>
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setOpen(true)}
            aria-label={t('nav.menu')}
          >
            <Menu size={22} aria-hidden />
          </button>
          <strong className="org-name">{session.user.organizationName}</strong>
          <div className="topbar-right">
            <PreferenceControls
              theme={session.theme}
              locale={session.locale}
              onTheme={session.setTheme}
              onLocale={session.setLocale}
            />
            <div className="whoami">
              <span>{session.user.name}</span>
              <small>{t(`roles.${session.user.role}`)}</small>
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
