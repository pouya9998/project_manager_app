import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDateOnly, taskStatusLabel } from '../lib/labels';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';

type TaskCard = {
  id: number;
  title: string;
  status: string;
  priority: number;
  dueDate?: string | null;
  project?: { id: number; name: string } | null;
  assignees: { user: { id: number; fullName: string } }[];
};

type Stats = {
  tasks: number;
  byStatus: Record<string, number>;
  pendingEfforts: number;
  approvedHours: number;
  softwareProjects?: number;
  engineering?: {
    periodDays: number;
    metrics: {
      wip: number;
      overdue: number;
      openMrs: number;
      staleMrs: number;
      pipelineSuccessRate: number | null;
      leadTimeDays: number | null;
      cycleTimeDays: number | null;
      doneInPeriod: number;
    };
  };
  agenda?: {
    todayYmd: string;
    dueToday: TaskCard[];
    upcoming: TaskCard[];
    overdue: TaskCard[];
    plannedByProject: {
      projectId: number | null;
      projectName: string;
      tasks: TaskCard[];
    }[];
  };
};

function TaskRow({ task }: { task: TaskCard }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-muted px-3 py-2.5 transition hover:border-[color:rgb(var(--brand-rgb)/0.35)] hover:bg-surface-soft"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">
          #{task.id} {task.title}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-ink-mute">
          {task.project?.name || 'بدون پروژه'}
          {' · '}
          {taskStatusLabel[task.status] || task.status}
          {task.assignees?.length
            ? ` · ${task.assignees.map((a) => a.user.fullName).slice(0, 2).join('، ')}`
            : ''}
        </div>
      </div>
      <div className="shrink-0 text-left text-[11px] font-medium text-ink-soft">
        {formatDateOnly(task.dueDate)}
      </div>
    </Link>
  );
}

function AgendaSection({
  title,
  hint,
  tasks,
  empty,
  tone,
}: {
  title: string;
  hint?: string;
  tasks: TaskCard[];
  empty: string;
  tone: string;
}) {
  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>
            {title}
          </div>
          {hint && <p className="mt-1 text-xs text-ink-mute">{hint}</p>}
        </div>
        <span className="text-sm font-bold text-ink">{tasks.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        {!tasks.length && <div className="text-sm text-ink-faint">{empty}</div>}
      </div>
    </section>
  );
}

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

  const eng = stats?.engineering?.metrics;
  const agenda = stats?.agenda;
  const todayLabel = agenda?.todayYmd ? formatDateOnly(`${agenda.todayYmd}T12:00:00+03:30`) : '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-mute">سلام، {user?.fullName}</p>
          <h2 className="page-title mt-1">داشبورد {settings.appName}</h2>
          <p className="page-sub">
            {isAdmin ? 'خلاصه وضعیت کارها برای همهٔ تیم' : 'خلاصه وظایف محول‌شده به شما'}
            {' · '}
            امروز {todayLabel}
          </p>
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

      {agenda && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-ink">برنامه و مهلت‌ها</h3>
            <span className="text-xs text-ink-mute">
              {isAdmin ? 'نمایش همهٔ وظایف' : 'فقط وظایف شما'}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AgendaSection
              title="مهلت امروز — باید انجام شود"
              hint="وظایفی که مهلت‌شان امروز است"
              tasks={agenda.dueToday}
              empty="امروز مهلتی ندارید"
              tone="bg-rose-50 text-rose-800"
            />
            <AgendaSection
              title="عقب‌افتاده"
              hint="مهلت گذشته و هنوز باز است"
              tasks={agenda.overdue}
              empty="عقب‌افتاده‌ای نیست"
              tone="bg-orange-50 text-orange-800"
            />
            <AgendaSection
              title="نزدیک به مهلت (۷ روز)"
              hint="مهلت در روزهای آینده"
              tasks={agenda.upcoming}
              empty="مهلت نزدیکی در هفتهٔ پیشِ رو نیست"
              tone="bg-amber-50 text-amber-800"
            />

            <section className="panel p-4 sm:p-5 lg:row-span-1">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                    برنامه بر اساس پروژه
                  </div>
                  <p className="mt-1 text-xs text-ink-mute">۱۴ روز آینده — کجا چه کاری برنامه‌ریزی شده</p>
                </div>
              </div>
              <div className="mt-3 space-y-4">
                {agenda.plannedByProject.map((g) => (
                  <div key={g.projectId ?? 'none'}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-ink">{g.projectName}</h4>
                      <span className="text-xs text-ink-mute">{g.tasks.length} وظیفه</span>
                    </div>
                    <div className="space-y-2">
                      {g.tasks.map((t) => (
                        <TaskRow key={t.id} task={t} />
                      ))}
                    </div>
                  </div>
                ))}
                {!agenda.plannedByProject.length && (
                  <div className="text-sm text-ink-faint">برنامه‌ای با مهلت در دو هفتهٔ آینده نیست</div>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {isAdmin && eng && (
        <section className="panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-ink">مهندسی نرم‌افزار (۳۰ روز)</h3>
            <Link to="/gitlab" className="text-sm text-brand hover:underline">
              تنظیمات گیت‌لب
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'WIP', value: eng.wip },
              { label: 'عقب‌افتاده', value: eng.overdue },
              { label: 'MR باز', value: eng.openMrs },
              { label: 'MR کهنه (>۷روز)', value: eng.staleMrs },
              {
                label: 'نرخ موفقیت پایپلاین',
                value: eng.pipelineSuccessRate == null ? '—' : `${eng.pipelineSuccessRate}%`,
              },
              { label: 'Lead time (روز)', value: eng.leadTimeDays ?? '—' },
              { label: 'Cycle time (روز)', value: eng.cycleTimeDays ?? '—' },
              { label: 'انجام‌شده در دوره', value: eng.doneInPeriod },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-line bg-surface-muted px-4 py-3">
                <div className="text-xs text-ink-mute">{m.label}</div>
                <div className="mt-1 text-xl font-bold text-ink">{m.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

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
