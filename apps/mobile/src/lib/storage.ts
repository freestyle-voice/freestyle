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
