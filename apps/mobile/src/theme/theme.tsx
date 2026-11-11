import { darkTheme, lightTheme, type Theme, type ThemePreference } from '@provecheck/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { storage } from '../storage';

const KEY = 'provecheck.theme';
interface ThemeContext {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  colors: Theme;
  isDark: boolean;
}
const Ctx = createContext<ThemeContext | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  useEffect(() => {
    void storage.get(KEY).then((v) => v && setPref(v as ThemePreference));
  }, []);

  const value = useMemo<ThemeContext>(() => {
    const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');
    return {
      preference,
      isDark,
      colors: isDark ? darkTheme : lightTheme,
      setPreference: (p) => {
        setPref(p);
        void storage.set(KEY, p);
      },
    };
  }, [preference, system]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
};
