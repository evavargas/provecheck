import {
  DEFAULT_LOCALE,
  type Locale,
  type LoginResponse,
  type MeDto,
  type ThemePreference,
} from '@provecheck/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, sessionStore } from './api/client';
import { PreferenceControls } from './components/PreferenceControls';
import { FirstLoginPage } from './features/auth/FirstLoginPage';
import { LoginPage } from './features/auth/LoginPage';
import { setLocale } from './i18n';
import { applyTheme, storedTheme } from './theme/theme';

type State =
  { screen: 'loading' } | { screen: 'login' } | { screen: 'first-login' | 'home'; user: MeDto };

export function App() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<State>({ screen: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(storedTheme);
  const locale = (i18n.language as Locale) || DEFAULT_LOCALE;
  const user = 'user' in state ? state.user : null;

  useEffect(() => applyTheme(theme), [theme]);
  // "system" must follow the OS while the page is open.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const enter = useCallback(async (me: MeDto) => {
    if (me.role !== 'admin') {
      await api.logout().catch(() => undefined);
      setNotice('auth.adminOnly');
      setState({ screen: 'login' });
      return;
    }
    // The profile wins over what the browser remembered (RN-29).
    setTheme(me.theme);
    if (me.locale) setLocale(me.locale);
    setState({ screen: me.mustChangePassword ? 'first-login' : 'home', user: me });
  }, []);

  useEffect(() => {
    if (!sessionStore.get()) return setState({ screen: 'login' });
    api.me().then(enter, () => setState({ screen: 'login' }));
  }, [enter]);

  useEffect(() => {
    const lost = () => setState({ screen: 'login' });
    window.addEventListener('provecheck:session-lost', lost);
    return () => window.removeEventListener('provecheck:session-lost', lost);
  }, []);

  // Preferences are saved in the profile once the first login is done; before that only the browser remembers them.
  const saveable = state.screen === 'home';
  const changeTheme = (next: ThemePreference) => {
    setTheme(next);
    if (saveable) void api.updatePreferences({ theme: next }).catch(() => undefined);
  };
  const changeLocale = (next: Locale) => {
    setLocale(next);
    if (saveable) void api.updatePreferences({ locale: next }).catch(() => undefined);
  };

  const prefs = (
    <PreferenceControls
      theme={theme}
      locale={locale}
      onTheme={changeTheme}
      onLocale={changeLocale}
    />
  );

  if (state.screen === 'loading') return <p className="center">{t('common.loading')}</p>;

  if (state.screen === 'home') {
    return (
      <div className="shell">
        <header className="topbar">
          <strong>{t('app.name')}</strong>
          <div className="topbar-right">
            {prefs}
            <button
              className="ghost"
              onClick={() => api.logout().finally(() => setState({ screen: 'login' }))}
            >
              {t('common.logout')}
            </button>
          </div>
        </header>
        <main className="content">
          <h1>{t('panel.home.title')}</h1>
          <p>{user?.name}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <span className="brand">{t('app.name')}</span>
        {prefs}
      </header>
      <main className="auth-main">
        <div className="auth-box">
          {notice && state.screen === 'login' && (
            <p role="alert" className="form-error notice">
              {t(notice)}
            </p>
          )}
          {state.screen === 'login' ? (
            <LoginPage
              onDone={(r: LoginResponse) => {
                setNotice(null);
                void enter(r.user);
              }}
            />
          ) : (
            <FirstLoginPage user={state.user} onDone={enter} />
          )}
        </div>
      </main>
      <footer className="auth-footer">
        © {new Date().getFullYear()} {t('app.name')}
      </footer>
    </div>
  );
}
