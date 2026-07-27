/**
 * Local persistence for non-sensitive preferences (language, cleanup toggle).
 * The session itself is owned by the `@better-auth/expo` client, which stores
 * it in the encrypted keychain.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export async function getPref(key: string): Promise<string | null> {
  return AsyncStorage.getItem(`freestyle_pref_${key}`);
}

export async function setPref(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(`freestyle_pref_${key}`, value);
}

/** Read and parse a JSON-encoded preference, falling back on any error. */
export async function getJsonPref<T>(key: string, fallback: T): Promise<T> {
  const raw = await getPref(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Serialize and persist a JSON preference. */
export async function setJsonPref<T>(key: string, value: T): Promise<void> {
  await setPref(key, JSON.stringify(value));
}
