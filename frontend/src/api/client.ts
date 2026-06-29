import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

const TOKEN_KEY = 'kushanji_token';

async function getStore() {
  return Platform.OS === 'web' ? AsyncStorage : SecureStore;
}

export async function saveToken(t: string) {
  if (Platform.OS === 'web') return AsyncStorage.setItem(TOKEN_KEY, t);
  return SecureStore.setItemAsync(TOKEN_KEY, t);
}
export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function clearToken() {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(TOKEN_KEY);
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Type': Platform.OS,
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data as T;
}
