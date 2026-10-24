import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const STEP_COLORS = ['#64748b', '#0f6e56', '#1d4ed8', '#c2410c', '#7e22ce', '#0e7490', '#b91c1c'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(STEP_COLORS[0]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setProject(await api(`/projects/${id}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function addStep(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api(`/projects/${id}/steps`, {
        method: 'POST',
        body: { title, color } as any,
      });
      setTitle('');
      setMsg('مرحله افزوده شد');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeStep(stepId: number) {
    if (!confirm('حذف این مرحله؟')) return;
    await api(`/projects/${id}/steps/${stepId}`, { method: 'DELETE' });
    await load();
  }

  async function move(stepId: number, dir: -1 | 1) {
    const steps = [...(project?.steps || [])];
    const idx = steps.findIndex((s: any) => s.id === stepId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= steps.length) return;
    const ids = steps.map((s: any) => s.id);
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    await api(`/projects/${id}/steps/reorder`, {
      method: 'PUT',
      body: { ids } as any,
    });
    await load();
  }

  if (!project) {
    return <div className="panel p-8 text-ink-mute">{error || 'در حال بارگذاری...'}</div>;
  }

  return (
    <div className="space-y-5">
      <Link to="/projects" className="text-sm text-brand hover:underline">
        ← بازگشت به پروژه‌ها
      </Link>

      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="chip bg-surface-soft text-ink-soft">
                {project.type === 'SOFTWARE' ? 'نرم‌افزاری' : 'غیرنرم‌افزاری'}
              </span>
            </div>
            <h2 className="page-title mt-2">{project.name}</h2>
            <p className="page-sub">{project.description || 'بدون توضیح'}</p>
            <div className="mt-3 text-sm text-ink-mute">
              {project._count?.tasks ?? 0} وظیفه · {project.steps?.length ?? 0} مرحله
              {project.gitlabPath ? ` · ${project.gitlabPath}` : ''}
            </div>
            {project.lastGitlabSyncAt && (
              <div className="mt-1 text-xs text-ink-mute">
                آخرین همگام‌سازی گیت‌لب: {new Date(project.lastGitlabSyncAt).toLocaleString('fa-IR')}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && project.type === 'SOFTWARE' && project.gitlabProjectId && (
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  setError('');
                  try {
                    await api(`/projects/${id}/gitlab/sync`, { method: 'POST' });
                    setMsg('همگام‌سازی گیت‌لب انجام شد');
                    await load();
                  } catch (err: any) {
                    setError(err.message);
                  }
                }}
              >
                همگام‌سازی گیت‌لب
              </button>
            )}
            <Link to="/chat" className="btn-ghost">
              گفتگوها
            </Link>
          </div>
        </div>
      </header>

      <section className="panel p-6">
        <h3 className="font-bold text-ink">مراحل گردش‌کار این پروژه</h3>
        <p className="mt-1 text-sm text-ink-mute">
          این مراحل به‌جای وضعیت‌های پیش‌فرض روی تابلو و جزئیات وظیفه نمایش داده می‌شوند.
        </p>

        <div className="mt-4 space-y-2">
          {project.steps?.map((s: any, index: number) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-muted px-3 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <div>
                  <div className="font-semibold text-ink">
                    {index + 1}. {s.title}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => move(s.id, -1)}>
                    بالا
                  </button>
                  <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => move(s.id, 1)}>
                    پایین
                  </button>
                  <button type="button" className="btn-danger py-1.5 text-xs" onClick={() => removeStep(s.id)}>
                    حذف
                  </button>
                </div>
              )}
            </div>
          ))}
          {!project.steps?.length && (
            <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
              هنوز مرحله‌ای تعریف نشده؛ از وضعیت‌های پیش‌فرض استفاده می‌شود.
            </div>
          )}
        </div>

        {isAdmin && (
          <form onSubmit={addStep} className="mt-5 grid gap-3 border-t border-line pt-5 md:grid-cols-[1fr_auto_auto]">
            <input
              className="input"
              placeholder="عنوان مرحله (مثلاً طراحی، توسعه، تست)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="flex items-center gap-2">
              {STEP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-8 w-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-white shadow'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <button className="btn-primary">افزودن مرحله</button>
          </form>
        )}

        {(msg || error) && (
          <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {error || msg}
          </div>
        )}
      </section>
    </div>
  );
}
