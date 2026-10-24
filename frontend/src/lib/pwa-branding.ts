import { uploadsUrl } from './api';
import type { AppSettings } from './settings';
import { normalizeHex } from './theme';

let manifestObjectUrl: string | null = null;
let iconObjectUrls: string[] = [];

function revokeAll() {
  if (manifestObjectUrl) {
    URL.revokeObjectURL(manifestObjectUrl);
    manifestObjectUrl = null;
  }
  for (const u of iconObjectUrls) URL.revokeObjectURL(u);
  iconObjectUrls = [];
}

function shortName(appName: string) {
  const t = (appName || 'اپ').trim();
  if (t.length <= 12) return t;
  return `${t.slice(0, 11)}…`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function paintIcon(settings: AppSettings, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const brand = normalizeHex(settings.primaryColor);
  const pad = Math.round(size * 0.08);
  const radius = Math.round(size * 0.22);

  // rounded background
  ctx.fillStyle = brand;
  roundRect(ctx, 0, 0, size, size, radius);
  ctx.fill();

  const logoSrc = settings.logoFile
    ? uploadsUrl(`branding/${settings.logoFile}`)
    : settings.faviconFile
      ? uploadsUrl(`branding/${settings.faviconFile}`)
      : null;

  if (logoSrc) {
    const img = await loadImage(logoSrc);
    if (img) {
      // white inset plate for logos with transparency
      ctx.fillStyle = '#ffffff';
      const inset = pad + Math.round(size * 0.04);
      roundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, Math.round(radius * 0.7));
      ctx.fill();

      const box = size - inset * 2 - Math.round(size * 0.08);
      const ox = (size - box) / 2;
      const oy = (size - box) / 2;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, ox + (box - w) / 2, oy + (box - h) / 2, w, h);

      return canvasBlob(canvas);
    }
  }

  // lettermark fallback using app name (not hard-coded "PMO")
  const letter = (settings.appName || 'ا').trim().charAt(0) || 'ا';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(size * 0.42)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
  ctx.fillText(letter, size / 2, size / 2 + size * 0.03);

  return canvasBlob(canvas);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('icon blob failed'))), 'image/png');
  });
}

function setLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  Object.entries(attrs).forEach(([k, v]) => link!.setAttribute(k, v));
  link.href = href;
}

/**
 * Rebuilds install icons + web manifest from current branding
 * so Add-to-Home-Screen shows the real app name/logo — not static "PMO".
 */
export async function applyPwaBranding(settings: AppSettings) {
  if (typeof document === 'undefined') return;

  try {
    const [blob192, blob512] = await Promise.all([
      paintIcon(settings, 192),
      paintIcon(settings, 512),
    ]);

    revokeAll();
    const url192 = URL.createObjectURL(blob192);
    const url512 = URL.createObjectURL(blob512);
    iconObjectUrls = [url192, url512];

    const origin = window.location.origin;
    const manifest = {
      id: `${origin}/`,
      name: settings.appName || 'سامانه مدیریت پروژه',
      short_name: shortName(settings.appName || 'سامانه'),
      description: settings.tagline || 'مدیریت وظایف، گفتگو و پروژه‌ها',
      lang: 'fa',
      dir: 'rtl',
      theme_color: normalizeHex(settings.primaryColor),
      background_color: '#f3f5f8',
      display: 'standalone',
      orientation: 'any',
      start_url: `${origin}/`,
      scope: `${origin}/`,
      icons: [
        { src: url192, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: url512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: url512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };

    const mBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    manifestObjectUrl = URL.createObjectURL(mBlob);

    setLink('manifest', manifestObjectUrl);
    setLink('apple-touch-icon', url192, { sizes: '192x192' });

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', shortName(settings.appName || 'سامانه'));
  } catch {
    /* keep static manifest fallback */
  }
}
