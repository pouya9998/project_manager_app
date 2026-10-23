import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

export type User = {
  id: number;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  jobPosition?: { id: number; title: string } | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('pmo_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('pmo_token');
        localStorage.removeItem('pmo_user');
      })
      .finally(() => setLoading(false));
  }, []);

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
