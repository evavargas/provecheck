import type { Locale, MeDto, ThemePreference } from '@provecheck/shared';
import { createContext, useContext } from 'react';

export interface Session {
  user: MeDto;
  theme: ThemePreference;
  locale: Locale;
  setTheme: (t: ThemePreference) => void;
  setLocale: (l: Locale) => void;
  logout: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionContext');
  return ctx;
}
