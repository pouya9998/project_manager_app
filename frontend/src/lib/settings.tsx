import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { applyBrandTheme } from './theme';

export type AppSettings = {
  id: number;
  appName: string;
  tagline?: string | null;
  logoFile?: string | null;
  primaryColor?: string | null;
};

type SettingsCtx = {
  settings: AppSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  setSettings: (s: AppSettings) => void;
};

const defaults: AppSettings = {
  id: 0,
  appName: 'سامانه مدیریت پروژه',
  tagline: 'مدیریت وظایف، گیت‌لب و جلسات',
  logoFile: null,
  primaryColor: '#0f6e56',
};

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(defaults);
  const [loading, setLoading] = useState(true);

  const setSettings = useCallback((s: AppSettings) => {
    setSettingsState(s);
    applyBrandTheme(s.primaryColor);
    if (s.appName) document.title = s.appName;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<AppSettings>('/settings');
      setSettings(data);
    } catch {
      applyBrandTheme(defaults.primaryColor);
      document.title = defaults.appName;
    } finally {
      setLoading(false);
    }
  }, [setSettings]);

  useEffect(() => {
    applyBrandTheme(defaults.primaryColor);
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ settings, loading, refresh, setSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings outside provider');
  return ctx;
}
