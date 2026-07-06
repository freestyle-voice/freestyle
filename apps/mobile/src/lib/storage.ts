/**
 * Persistence: the cloud session token lives in the encrypted keychain
 * (`expo-secure-store`); non-sensitive preferences live in AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "freestyle_cloud_token";

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getPref(key: string): Promise<string | null> {
  return AsyncStorage.getItem(`freestyle_pref_${key}`);
}

export async function setPref(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(`freestyle_pref_${key}`, value);
}
