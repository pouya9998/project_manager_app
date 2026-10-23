import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CommentBox from '../components/CommentBox';
import { api, uploadsUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  effortStatusLabel,
  formatDate,
  taskStatusColor,
  taskStatusLabel,
  taskStatuses,
} from '../lib/labels';

export default function TaskDetailPage() {
  const { id } = useParams();
  const { isAdmin, user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [commits, setCommits] = useState<any[]>([]);
  const [mrs, setMrs] = useState<any[]>([]);
  const [hours, setHours] = useState('1');
  const [effortDesc, setEffortDesc] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const t = await api(`/tasks/${id}`);
    setTask(t);
    if (t.project?.gitlabProjectId) {
      try {
        const [c, m] = await Promise.all([
          api(`/gitlab/projects/${t.project.gitlabProjectId}/commits`),
          api(`/gitlab/projects/${t.project.gitlabProjectId}/merge-requests?state=all`),
        ]);
        setCommits(c);
        setMrs(m);
      } catch {
        /* gitlab optional */
      }
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [id]);

  async function changeStatus(status: string) {
    await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status } as any });
    await load();
  }

  async function changeStep(stepId: number) {
    await api(`/tasks/${id}/step`, { method: 'PATCH', body: { stepId } as any });
    await load();
  }

  async function addEffort(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/efforts', {
        method: 'POST',
        body: {
          taskId: Number(id),
          hours: Number(hours),
          description: effortDesc,
        } as any,
      });
      setMsg('زمان ثبت شد و منتظر تأیید ادمین است');
      setEffortDesc('');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function linkCommit(c: any) {
    await api(`/tasks/${id}/commits`, {
      method: 'POST',
      body: {
        sha: c.id || c.short_id,
        title: c.title,
        webUrl: c.web_url,
        authorName: c.author_name,
        committedAt: c.committed_date,
      } as any,
    });
    setMsg('کامیت به وظیفه متصل شد');
    await load();
  }

  async function linkMr(m: any) {
    await api(`/tasks/${id}/merge-requests`, {
      method: 'POST',
      body: {
        mrIid: m.iid,
        title: m.title,
        state: m.state,
        webUrl: m.web_url,
        sourceBranch: m.source_branch,
        targetBranch: m.target_branch,
      } as any,
    });
    setMsg('مرج‌ریکوئست به وظیفه متصل شد');
    await load();
  }

  if (!task) {
    return <div className="panel p-8 text-ink-mute">{error || 'در حال بارگذاری...'}</div>;
  }

  const assigned = task.assignees?.some((a: any) => a.userId === user?.id || a.user?.id === user?.id);

  return (
    <div className="space-y-5">
      <Link to="/board" className="text-sm text-brand hover:underline">
        ← بازگشت به تابلو
      </Link>

      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {task.step ? (
              <div
                className="chip text-white"
                style={{ backgroundColor: task.step.color || '#64748b' }}
              >
                {task.step.title}
              </div>
            ) : (
              <div className={`chip ${taskStatusColor[task.status]}`}>{taskStatusLabel[task.status]}</div>
            )}
            <h2 className="mt-3 font-display text-3xl font-bold text-ink">{task.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-ink-soft">{task.description || 'بدون توضیحات'}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-ink-mute">
              <span>
                پروژه:{' '}
                {task.project ? (
                  <Link to={`/projects/${task.project.id}`} className="text-brand hover:underline">
                    {task.project.name}
                  </Link>
                ) : (
                  '—'
                )}
              </span>
              <span>ایجادکننده: {task.creator?.fullName}</span>
              <span>مهلت: {formatDate(task.dueDate)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {task.project?.steps?.length ? (
              <select
                className="input w-auto"
                value={task.stepId || ''}
                onChange={(e) => changeStep(Number(e.target.value))}
              >
                <option value="" disabled>
                  انتخاب مرحله
                </option>
                {task.project.steps.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="input w-auto"
                value={task.status}
                onChange={(e) => changeStatus(e.target.value)}
              >
                {taskStatuses.map((s) => (
                  <option key={s} value={s}>
                    {taskStatusLabel[s]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {(msg || error) && (
          <div className={`mt-4 rounded-xl px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {error || msg}
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h3 className="font-bold text-ink">مسئولان و فایل‌ها</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {task.assignees.map((a: any) => (
              <span key={a.id} className="chip bg-surface-soft text-ink">
                {a.user.fullName}
                {a.user.jobPosition ? ` · ${a.user.jobPosition.title}` : ''}
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {task.attachments?.length ? (
              task.attachments.map((f: any) => (
                <a
                  key={f.id}
                  className="block rounded-xl bg-surface-muted px-3 py-2 text-sm text-brand hover:bg-surface-soft"
                  href={uploadsUrl(f.storedName)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.originalName}
                </a>
              ))
            ) : (
              <div className="text-sm text-ink-faint">فایلی پیوست نشده</div>
            )}
          </div>
        </section>

        {(assigned || isAdmin) && (
          <section className="panel p-5">
            <h3 className="font-bold text-ink">ثبت زمان (ساعت)</h3>
            <form onSubmit={addEffort} className="mt-3 space-y-3">
              <div>
                <label className="label">ساعت کار</label>
                <input
                  className="input"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">توضیح کار</label>
                <textarea
                  className="input min-h-[80px]"
                  value={effortDesc}
                  onChange={(e) => setEffortDesc(e.target.value)}
                />
              </div>
              <button className="btn-primary">ثبت برای تأیید ادمین</button>
            </form>
          </section>
        )}

        <section className="panel p-5">
          <h3 className="font-bold text-ink">کامیت‌های متصل</h3>
          <div className="mt-3 space-y-2">
            {task.commits?.map((c: any) => (
              <a
                key={c.id}
                href={c.webUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl bg-surface-muted px-3 py-2 text-sm"
              >
                <div className="font-medium text-ink">{c.title}</div>
                <div className="text-xs text-ink-mute">{c.sha?.slice(0, 8)} · {c.authorName}</div>
              </a>
            ))}
            {!task.commits?.length && <div className="text-sm text-ink-faint">هنوز کامیتی متصل نشده</div>}
          </div>
          {commits.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-ink-soft">افزودن از گیت‌لب</div>
              <div className="max-h-48 space-y-2 overflow-auto">
                {commits.slice(0, 10).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm hover:bg-surface-muted"
                    onClick={() => linkCommit(c)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h3 className="font-bold text-ink">مرج‌ریکوئست‌ها</h3>
          <div className="mt-3 space-y-2">
            {task.mergeRequests?.map((m: any) => (
              <a
                key={m.id}
                href={m.webUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl bg-surface-muted px-3 py-2 text-sm"
              >
                <div className="font-medium text-ink">!{m.mrIid} {m.title}</div>
                <div className="text-xs text-ink-mute">{m.state} · {m.sourceBranch} → {m.targetBranch}</div>
              </a>
            ))}
            {!task.mergeRequests?.length && (
              <div className="text-sm text-ink-faint">مرج‌ریکوئستی متصل نشده</div>
            )}
          </div>
          {mrs.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-ink-soft">افزودن از گیت‌لب</div>
              <div className="max-h-48 space-y-2 overflow-auto">
                {mrs.slice(0, 10).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="w-full rounded-xl border border-line px-3 py-2 text-right text-sm hover:bg-surface-muted"
                    onClick={() => linkMr(m)}
                  >
                    !{m.iid} {m.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h3 className="font-bold text-ink">زمان‌های ثبت‌شده</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-ink-mute">
                  <th className="px-2 py-2 text-right font-medium">کاربر</th>
                  <th className="px-2 py-2 text-right font-medium">ساعت</th>
                  <th className="px-2 py-2 text-right font-medium">تأییدشده</th>
                  <th className="px-2 py-2 text-right font-medium">وضعیت</th>
                  <th className="px-2 py-2 text-right font-medium">توضیح</th>
                </tr>
              </thead>
              <tbody>
                {task.efforts?.map((e: any) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="px-2 py-2">{e.user?.fullName}</td>
                    <td className="px-2 py-2">{e.hours}</td>
                    <td className="px-2 py-2">{e.approvedHours ?? '—'}</td>
                    <td className="px-2 py-2">{effortStatusLabel[e.status]}</td>
                    <td className="px-2 py-2">{e.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="lg:col-span-2">
          <CommentBox taskId={Number(id)} comments={task.comments || []} onAdded={load} />
        </div>
      </div>
    </div>
  );
}
