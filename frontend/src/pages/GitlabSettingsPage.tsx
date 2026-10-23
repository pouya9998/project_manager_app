import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function GitlabSettingsPage() {
  const [form, setForm] = useState({ name: 'پیش‌فرض', baseUrl: '', accessToken: '' });
  const [config, setConfig] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/gitlab/config')
      .then((c) => {
        setConfig(c);
        if (c) {
          setForm((f) => ({ ...f, name: c.name, baseUrl: c.baseUrl, accessToken: '' }));
        }
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const saved = await api('/gitlab/config', {
        method: 'PUT',
        body: {
          name: form.name,
          baseUrl: form.baseUrl,
          accessToken: form.accessToken || undefined,
        } as any,
      });
      setConfig(saved);
      setMessage('تنظیمات گیت‌لب ذخیره شد');
      setForm((f) => ({ ...f, accessToken: '' }));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function test() {
    setError('');
    setMessage('');
    try {
      const res = await api<{ message: string; username: string }>('/gitlab/test', { method: 'POST' });
      setMessage(`${res.message} — کاربر: ${res.username}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">اتصال گیت‌لب</h2>
        <p className="mt-1 text-sm text-ink-mute">
          آدرس سرور گیت‌لب خودسازمانی و توکن دسترسی شخصی را اینجا ثبت کنید.
        </p>
      </div>

      <form onSubmit={onSubmit} className="panel max-w-2xl space-y-4 p-6">
        <div>
          <label className="label">نام پروفایل</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">آدرس پایه گیت‌لب</label>
          <input
            className="input"
            placeholder="https://gitlab.example.com"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">توکن دسترسی (Personal Access Token)</label>
          <input
            className="input"
            type="password"
            placeholder={config?.hasToken ? 'برای تغییر توکن، مقدار جدید وارد کنید' : 'glpat-...'}
            value={form.accessToken}
            onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            required={!config?.hasToken && !config?.accessToken}
          />
        </div>
        {config?.hasToken && (
          <div className="rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-soft">
            توکن فعلی: {config.accessToken}
          </div>
        )}
        {message && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="submit">ذخیره</button>
          <button className="btn-ghost" type="button" onClick={test}>تست اتصال</button>
        </div>
      </form>
    </div>
  );
}
