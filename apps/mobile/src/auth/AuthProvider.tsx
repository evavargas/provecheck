import { ApiRequestError, type MeDto } from '@provecheck/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, hydrateSession, setSessionLostHandler } from '../api/client';
import { setLocale } from '../i18n';
import { useTheme } from '../theme/theme';

type State =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: 'notForApp' }
  | { status: 'inactive' }
  | { status: 'firstLogin' | 'ready'; user: MeDto };

interface AuthContext {
  state: State;
  signIn: (identifier: string, password: string) => Promise<void>;
  completeFirstLogin: (email: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { setPreference } = useTheme();

  const enter = useCallback(
    async (me: MeDto) => {
      // This app is for collaborators and client users; admins use the panel.
      if (me.role === 'admin') {
        await api.logout().catch(() => undefined);
        setState({ status: 'signedOut', notice: 'notForApp' });
        return;
      }
      setPreference(me.theme); // the profile wins over what the device remembered (RN-29)
      if (me.locale) void setLocale(me.locale);
      setState({ status: me.mustChangePassword ? 'firstLogin' : 'ready', user: me });
    },
    [setPreference],
  );

  useEffect(() => {
    setSessionLostHandler(() => setState({ status: 'signedOut' }));
    void (async () => {
      if (!(await hydrateSession())) return setState({ status: 'signedOut' });
      try {
        await enter(await api.me());
      } catch (err) {
        // Offline with a stored session keeps the user out for now; offline mode comes with the task list.
        setState(
          err instanceof ApiRequestError && err.code === 'ACCOUNT_INACTIVE'
            ? { status: 'inactive' }
            : { status: 'signedOut' },
        );
      }
    })();
  }, [enter]);

  const value = useMemo<AuthContext>(
    () => ({
      state,
      async signIn(identifier, password) {
        try {
          await enter((await api.login({ identifier, password })).user);
        } catch (err) {
          if (err instanceof ApiRequestError && err.code === 'ACCOUNT_INACTIVE') {
            setState({ status: 'inactive' });
            return;
          }
          throw err;
        }
      },
      async completeFirstLogin(email, newPassword) {
        await enter(await api.firstLogin({ email, newPassword }));
      },
      async signOut() {
        await api.logout().catch(() => undefined);
        setState({ status: 'signedOut' });
      },
    }),
    [state, enter],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
};
