import { FormEvent, useEffect, useState } from 'react';
import BrandLogo from '../components/BrandLogo';
import { api, uploadsUrl } from '../lib/api';
import { useSettings } from '../lib/settings';
import { COLOR_PRESETS, applyBrandTheme, normalizeHex } from '../lib/theme';

export default function AppSettingsPage() {
  const { settings, setSettings, refresh } = useSettings();
  const [appName, setAppName] = useState(settings.appName);
  const [tagline, setTagline] = useState(settings.tagline || '');
  const [primaryColor, setPrimaryColor] = useState(normalizeHex(settings.primaryColor));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    setAppName(settings.appName);
    setTagline(settings.tagline || '');
    setPrimaryColor(normalizeHex(settings.primaryColor));
  }, [settings]);

  function previewColor(color: string) {
    const hex = normalizeHex(color);
    setPrimaryColor(hex);
    applyBrandTheme(hex);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await api('/settings', {
        method: 'PUT',
        body: {
          appName,
          tagline,
          primaryColor: normalizeHex(primaryColor),
        } as any,
      });
      setSettings(saved);
      setMessage('تنظیمات ذخیره شد');
    } catch (err: any) {
      setError(err.message || 'ذخیره ناموفق بود');
      applyBrandTheme(settings.primaryColor);
    } finally {
      setBusy(false);
    }
  }

  async function onLogoChange(file?: File | null) {
    if (!file) return;
    setLogoBusy(true);
    setError('');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const saved = await api('/settings/logo', { method: 'POST', formData: fd });
      setSettings(saved);
      await refresh();
      setMessage('لوگوی شرکت به‌روزرسانی شد');
    } catch (err: any) {
      setError(err.message || 'آپلود لوگو ناموفق بود');
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">تنظیمات برنامه</h2>
        <p className="page-sub">نام، لوگو و رنگ دکمه‌ها را مدیریت کنید.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <section className="panel p-5">
          <div className="text-sm font-semibold text-ink">لوگوی شرکت</div>
          <p className="mt-1 text-xs text-ink-mute">PNG، JPG، WEBP یا SVG — حداکثر ۳ مگابایت</p>
          <div className="mt-5 flex flex-col items-center gap-4 rounded-xl border border-dashed border-line bg-surface-muted p-6">
            <BrandLogo size="lg" />
            {settings.logoFile && (
              <a
                className="text-xs text-brand hover:underline"
                href={uploadsUrl(`branding/${settings.logoFile}`)}
                target="_blank"
                rel="noreferrer"
              >
                مشاهده فایل فعلی
              </a>
            )}
            <label className="btn-primary cursor-pointer">
              {logoBusy ? 'در حال آپلود...' : 'انتخاب لوگو'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                disabled={logoBusy}
                onChange={(e) => onLogoChange(e.target.files?.[0])}
              />
            </label>
          </div>
        </section>

        <form onSubmit={onSubmit} className="panel space-y-5 p-6">
          <div>
            <label className="label">نام برنامه / شرکت</label>
            <input
              className="input"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              required
              minLength={2}
            />
          </div>
          <div>
            <label className="label">شعار کوتاه</label>
            <input
              className="input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="نمایش کنار لوگو در سایدبار و صفحه ورود"
            />
          </div>

          <div>
            <label className="label">رنگ دکمه‌ها و برند</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => previewColor(e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-white p-1"
                aria-label="انتخاب رنگ"
              />
              <input
                className="input max-w-[140px] font-mono uppercase"
                value={primaryColor}
                onChange={(e) => previewColor(e.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#0f6e56"
              />
              <button type="button" className="btn-primary">
                پیش‌نمایش دکمه
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.label}
                  onClick={() => previewColor(p.value)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    primaryColor === p.value ? 'border-ink scale-110' : 'border-white shadow'
                  }`}
                  style={{ backgroundColor: p.value }}
                />
              ))}
            </div>
          </div>

          {message && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>
          )}
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
          </button>
        </form>
      </div>
    </div>
  );
}
