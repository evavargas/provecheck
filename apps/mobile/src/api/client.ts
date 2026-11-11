import { createApiClient, type SessionDto, type SessionStore } from '@provecheck/shared';
import { storage } from '../storage';

const KEY = 'provecheck.session';
let cached: SessionDto | null = null;

// The client API is synchronous, so the session is cached in memory and written through to secure storage.
const store: SessionStore = {
  get: () => cached,
  set(session) {
    cached = session;
    void (session ? storage.set(KEY, JSON.stringify(session)) : storage.remove(KEY));
  },
};

export async function hydrateSession(): Promise<boolean> {
  const raw = await storage.get(KEY);
  cached = raw ? (JSON.parse(raw) as SessionDto) : null;
  return cached !== null;
}

let onSessionLost: () => void = () => undefined;
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

// shortcut: an Android emulator reaches the host at 10.0.2.2; set EXPO_PUBLIC_API_URL for devices and production.
export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  store,
  onSessionLost: () => onSessionLost(),
});
