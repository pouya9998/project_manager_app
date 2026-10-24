const DEFAULT = '#0f6e56';

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, withColor: string, amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(withColor);
  return rgbToHex(
    a.r + (b.r - a.r) * amount,
    a.g + (b.g - a.g) * amount,
    a.b + (b.b - a.b) * amount,
  );
}

export function normalizeHex(color?: string | null) {
  if (!color) return DEFAULT;
  const c = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c.toLowerCase()}`;
  return DEFAULT;
}

export function applyBrandTheme(color?: string | null) {
  const primary = normalizeHex(color);
  const isDark = document.documentElement.classList.contains('dark');
  const dark = mix(primary, '#000000', isDark ? 0.28 : 0.22);
  // On dark UI, accent text must be lighter than the brand, not darker
  const fg = isDark ? mix(primary, '#ffffff', 0.42) : dark;
  const soft = mix(primary, isDark ? '#12161d' : '#ffffff', isDark ? 0.78 : 0.88);
  const mist = mix(primary, isDark ? '#12161d' : '#ffffff', isDark ? 0.62 : 0.72);
  // Chat bubbles: soft brand wash — never a solid loud green slab in dark mode
  const bubbleMine = isDark
    ? mix(primary, '#2a3140', 0.72)
    : mix(primary, '#ffffff', 0.82);
  const bubbleTheirs = isDark ? '#252b38' : '#ffffff';
  const root = document.documentElement;
  root.style.setProperty('--brand', primary);
  root.style.setProperty('--brand-dark', dark);
  root.style.setProperty('--brand-fg', fg);
  root.style.setProperty('--brand-soft', soft);
  root.style.setProperty('--brand-mist', mist);
  root.style.setProperty('--brand-rgb', Object.values(hexToRgb(primary)).join(' '));
  root.style.setProperty('--bubble-mine', bubbleMine);
  root.style.setProperty('--bubble-theirs', bubbleTheirs);

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', isDark ? '#12161d' : primary);
}

/** Apply custom favicon from settings, or fall back to default /favicon.svg */
export function applyFavicon(faviconUrl?: string | null) {
  const href = faviconUrl || '/favicon.svg';
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  // bust cache when admin replaces favicon
  link.href = faviconUrl ? `${href}${href.includes('?') ? '&' : '?'}v=${Date.now()}` : href;
}

export const COLOR_PRESETS = [
  { label: 'سبز', value: '#0f6e56' },
  { label: 'آبی', value: '#1d4ed8' },
  { label: 'نیلی', value: '#4338ca' },
  { label: 'فیروزه‌ای', value: '#0e7490' },
  { label: 'نارنجی', value: '#c2410c' },
  { label: 'قرمز', value: '#b91c1c' },
  { label: 'بنفش', value: '#7e22ce' },
  { label: 'زغالی', value: '#334155' },
];
