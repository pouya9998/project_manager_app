import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { taskStatusLabel } from '../lib/labels';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

type Stats = {
  tasks: number;
  byStatus: Record<string, number>;
  pendingEfforts: number;
  approvedHours: number;
};

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>('/dashboard').then(setStats).catch(console.error);
  }, []);

  const cards = [
    { label: 'کل وظایف', value: stats?.tasks ?? '—', tone: 'bg-brand-soft text-brand-dark' },
    { label: 'زمان‌های در انتظار', value: stats?.pendingEfforts ?? '—', tone: 'bg-amber-50 text-amber-800' },
    { label: 'ساعات تأییدشده', value: stats?.approvedHours ?? '—', tone: 'bg-violet-50 text-violet-800' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-mute">سلام، {user?.fullName}</p>
          <h2 className="page-title mt-1">داشبورد {settings.appName}</h2>
          <p className="page-sub">خلاصه وضعیت کارها و زمان‌های تیم</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/board" className="btn-primary">
            تابلو وظایف
          </Link>
          {isAdmin && (
            <Link to="/settings" className="btn-ghost">
              تنظیمات و لوگو
            </Link>
          )}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="panel p-5">
            <div className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${c.tone}`}>
              {c.label}
            </div>
            <div className="mt-4 text-3xl font-bold tracking-tight text-ink">{c.value}</div>
          </div>
        ))}
      </section>

      <section className="panel p-6">
        <h3 className="text-base font-bold text-ink">توزیع وضعیت وظایف</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(stats?.byStatus || {}).map(([status, count]) => (
            <div
              key={status}
              className="flex items-center justify-between rounded-xl border border-line bg-surface-muted px-4 py-3"
            >
              <span className="text-sm text-ink-soft">{taskStatusLabel[status] || status}</span>
              <span className="text-lg font-bold text-ink">{count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
