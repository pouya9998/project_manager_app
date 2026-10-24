import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/labels';

export default function GitlabSettingsPage() {
  const [form, setForm] = useState({ name: 'پیش‌فرض', baseUrl: '', accessToken: '' });
  const [config, setConfig] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState<number | null>(null);

  async function load() {
    const [c, p] = await Promise.all([
      api('/gitlab/config').catch(() => null),
      api('/projects').catch(() => []),
    ]);
    setConfig(c);
    setProjects((p as any[]).filter((x) => x.type === 'SOFTWARE' && x.gitlabProjectId));
    if (c) {
      setForm((f) => ({ ...f, name: c.name, baseUrl: c.baseUrl, accessToken: '' }));
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
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
      setMessage('تنظیمات ذخیره شد — برای تأیید سلامت، «تست اتصال» را بزنید');
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
      await load();
    } catch (err: any) {
      setError(err.message);
      await load();
    }
  }

  async function disconnect() {
    if (!confirm('قطع اتصال گیت‌لب؟ توکن حذف می‌شود.')) return;
    await api('/gitlab/config', { method: 'DELETE' });
    setConfig(null);
    setMessage('اتصال قطع شد');
  }

  async function syncProject(id: number) {
    setSyncing(id);
    setError('');
    try {
      const res = await api<any>(`/projects/${id}/gitlab/sync`, { method: 'POST' });
      setMessage(
        `همگام‌سازی انجام شد — کامیت: ${res.commitsLinked}، MR: ${res.mrsLinked}، پایپلاین: ${res.pipelinesUpserted}`,
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(null);
    }
  }

  const webhookUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/gitlab/webhooks` : '/api/gitlab/webhooks';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">اتصال گیت‌لب</h2>
        <p className="mt-1 text-sm text-ink-mute">
          فقط پروژه‌های نرم‌افزاری می‌توانند به مخزن متصل شوند. توکن به‌صورت رمزنگاری‌شده ذخیره می‌شود.
        </p>
      </div>

      {config && (
        <div className="panel grid gap-3 p-5 md:grid-cols-3">
          <div>
            <div className="text-xs text-ink-mute">وضعیت سلامت</div>
            <div className={`mt-1 font-semibold ${config.lastHealthOk ? 'text-emerald-700' : 'text-amber-700'}`}>
              {config.lastHealthOk == null ? 'هنوز تست نشده' : config.lastHealthOk ? 'سالم' : 'ناموفق'}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">آخرین بررسی</div>
            <div className="mt-1 text-sm text-ink">
              {config.lastHealthAt ? formatDate(config.lastHealthAt) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">آخرین همگام‌سازی</div>
            <div className="mt-1 text-sm text-ink">
              {config.lastSyncAt ? formatDate(config.lastSyncAt) : '—'}
            </div>
          </div>
          {config.lastHealthError && (
            <div className="md:col-span-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {config.lastHealthError}
            </div>
          )}
          <div className="md:col-span-3 rounded-xl bg-surface-soft px-3 py-2 text-xs text-ink-soft">
            آدرس وب‌هوک: <code className="font-mono">{webhookUrl}</code>
            <br />
            هدر: <code className="font-mono">X-Gitlab-Token</code> = سکرت پیکربندی‌شده
            {config.hasWebhookSecret ? ' (تنظیم شده)' : ''}
          </div>
        </div>
      )}

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
            required={!config?.hasToken}
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
          {config?.hasToken && (
            <button className="btn-danger" type="button" onClick={disconnect}>قطع اتصال</button>
          )}
        </div>
      </form>

      {projects.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-bold text-ink">همگام‌سازی پروژه‌های نرم‌افزاری</h3>
          <div className="mt-3 space-y-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2"
              >
                <div>
                  <div className="font-medium text-ink">{p.name}</div>
                  <div className="text-xs text-ink-mute">
                    {p.gitlabPath || '—'}
                    {p.lastGitlabSyncAt ? ` · آخرین sync: ${formatDate(p.lastGitlabSyncAt)}` : ''}
                  </div>
                  {p.lastGitlabSyncError && (
                    <div className="text-xs text-red-600">{p.lastGitlabSyncError}</div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={syncing === p.id}
                  onClick={() => syncProject(p.id)}
                >
                  {syncing === p.id ? '...' : 'همگام‌سازی'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
