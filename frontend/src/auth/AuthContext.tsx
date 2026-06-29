import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, saveToken, loadToken, clearToken } from '../api/client';

export type Role = 'admin' | 'user';
export type User = { id: string; name: string; email: string; role: Role; is_active: boolean };

type Ctx = {
  ready: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const refresh = async () => {
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
      await clearToken();
    }
  };

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (t) await refresh();
      setReady(true);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await saveToken(res.access_token);
    setUser(res.user);
  };

  const signOut = async () => {
    await clearToken();
    setUser(null);
  };

  return <AuthCtx.Provider value={{ ready, user, signIn, signOut, refresh }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('AuthCtx missing');
  return c;
}
