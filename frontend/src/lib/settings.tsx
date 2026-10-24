import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, uploadsUrl } from './api';
import { applyPwaBranding } from './pwa-branding';
import { applyBrandTheme, applyFavicon } from './theme';

export type AppSettings = {
  id: number;
  appName: string;
  tagline?: string | null;
  logoFile?: string | null;
  faviconFile?: string | null;
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
  faviconFile: null,
  primaryColor: '#0f6e56',
};

const Ctx = createContext<SettingsCtx | null>(null);

function applySettingsSideEffects(s: AppSettings) {
  applyBrandTheme(s.primaryColor);
  applyFavicon(s.faviconFile ? uploadsUrl(`branding/${s.faviconFile}`) : null);
  if (s.appName) document.title = s.appName;
  void applyPwaBranding(s);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(defaults);
  const [loading, setLoading] = useState(true);

  const setSettings = useCallback((s: AppSettings) => {
    setSettingsState(s);
    applySettingsSideEffects(s);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<AppSettings>('/settings');
      setSettings(data);
    } catch {
      applyBrandTheme(defaults.primaryColor);
      applyFavicon(null);
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
