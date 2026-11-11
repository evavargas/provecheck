import { createApiClient, type SessionDto } from '@provecheck/shared';

const KEY = 'provecheck.session';

// shortcut: the refresh token lives in localStorage (readable by XSS); move to an httpOnly cookie before production.
const store = {
  get(): SessionDto | null {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionDto) : null;
  },
  set(session: SessionDto | null) {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  },
};

export const sessionStore = store;
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  store,
  onSessionLost: () => window.dispatchEvent(new Event('provecheck:session-lost')),
});
