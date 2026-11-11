import { darkTheme, lightTheme, type ThemePreference } from '@provecheck/shared';

const KEY = 'provecheck.theme';
const toVar = (k: string) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

export const storedTheme = (): ThemePreference =>
  (localStorage.getItem(KEY) as ThemePreference | null) ?? 'system';

/** Applies the tokens of the chosen theme to :root; "system" follows the browser. */
export function applyTheme(pref: ThemePreference) {
  localStorage.setItem(KEY, pref);
  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const tokens = dark ? darkTheme : lightTheme;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(toVar(k), v);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
}
