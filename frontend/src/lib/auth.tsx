import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

export type User = {
  id: number;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  jobPosition?: { id: number; title: string } | null;
  avatarFile?: string | null;
  statusMessage?: string | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (u: User | null) => void;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('pmo_token');
    if (!token) {
      setUser(null);
      return;
    }
    const me = await api<User>('/auth/me');
    setUser(me);
    localStorage.setItem('pmo_user', JSON.stringify(me));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('pmo_token');
    if (!token) {
      setLoading(false);
      return;
    }
    refreshUser()
      .catch(() => {
        localStorage.removeItem('pmo_token');
        localStorage.removeItem('pmo_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refreshUser]);

  async function login(email: string, password: string) {
    const res = await api<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password } as any,
    });
    localStorage.setItem('pmo_token', res.accessToken);
    localStorage.setItem('pmo_user', JSON.stringify(res.user));
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('pmo_token');
    localStorage.removeItem('pmo_user');
    setUser(null);
  }

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        setUser,
        isAdmin: user?.role === 'ADMIN',
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
