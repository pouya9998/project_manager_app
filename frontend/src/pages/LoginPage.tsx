import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'ورود ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse at 20% 20%, rgba(15,110,86,0.55), transparent 50%), radial-gradient(ellipse at 90% 80%, rgba(15,110,86,0.25), transparent 45%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <BrandLogo size="md" />
          <span className="font-display text-xl font-bold">{settings.appName}</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">
            کار تیمی، شفاف و منظم
          </h2>
          <p className="mt-4 text-base leading-7 text-white/70">
            {settings.tagline ||
              'مدیریت وظایف، زمان‌کاری و جلسات در یک سامانه یکپارچه با گیت‌لب.'}
          </p>
        </div>
        <div className="relative text-sm text-white/40">ورود امن به حساب کاربری</div>
      </section>

      <section className="flex items-center justify-center bg-surface-muted px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-right">
            <div className="mb-4 lg:hidden">
              <BrandLogo size="lg" />
            </div>
            <h1 className="page-title">ورود به سامانه</h1>
            <p className="mt-2 text-sm text-ink-mute lg:hidden">{settings.appName}</p>
          </div>

          <form onSubmit={onSubmit} className="panel space-y-4 p-6 sm:p-8">
            <div>
              <label className="label">ایمیل</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="label">رمز عبور</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'در حال ورود...' : 'ورود'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
