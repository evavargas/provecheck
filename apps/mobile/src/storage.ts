import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Native: Keychain/Keystore. Web: localStorage (shortcut: readable by XSS, same limit as the panel).
const web = Platform.OS === 'web';

export const storage = {
  async get(key: string): Promise<string | null> {
    return web ? localStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
