const KEY = 'pmo_theme';

export type ThemeMode = 'light' | 'dark';

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const brand = getComputedStyle(root).getPropertyValue('--brand').trim() || '#0f6e56';
    meta.setAttribute('content', mode === 'dark' ? '#12161d' : brand);
  }
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = getStoredTheme() === 'dark' ? 'light' : 'dark';
  applyThemeMode(next);
  return next;
}

/** Call once at app boot before paint if possible */
export function initThemeMode() {
  applyThemeMode(getStoredTheme());
}
