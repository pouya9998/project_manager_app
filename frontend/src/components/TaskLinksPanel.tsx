import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  taskLinkTypeInverseLabel,
  taskLinkTypeLabel,
  taskLinkTypes,
  taskStatusLabel,
} from '../lib/labels';

type Dep = {
  id: number;
  type: string;
  fromTaskId: number;
  toTaskId: number;
  fromTask?: { id: number; title: string; status?: string };
  toTask?: { id: number; title: string; status?: string };
};

type TaskHit = { id: number; title: string; status?: string; project?: { name?: string } };

type Props = {
  taskId: number;
  canEdit: boolean;
  deps: Dep[];
  onChanged: () => void;
};

export default function TaskLinksPanel({ taskId, canEdit, deps, onChanged }: Props) {
  const [linkType, setLinkType] = useState('RELATES_TO');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TaskHit[]>([]);
  const [selected, setSelected] = useState<TaskHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canEdit) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      api<TaskHit[]>(`/tasks?q=${encodeURIComponent(q)}`)
        .then((list) => setHits(list.filter((x) => x.id !== taskId).slice(0, 8)))
        .catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [query, taskId, canEdit]);

  async function addLink(e: FormEvent) {
    e.preventDefault();
    if (!selected) {
      setError('یک وظیفه را از نتایج جستجو انتخاب کنید');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/tasks/dependencies', {
        method: 'POST',
        body: {
          fromTaskId: taskId,
          toTaskId: selected.id,
          type: linkType,
        } as any,
      });
      setSelected(null);
      setQuery('');
      setHits([]);
      onChanged();
    } catch (err: any) {
      setError(err.message || 'خطا در ایجاد ارتباط');
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(id: number) {
    setBusy(true);
    setError('');
    try {
      await api(`/tasks/dependencies/${id}`, { method: 'DELETE' });
      onChanged();
    } catch (err: any) {
      setError(err.message || 'خطا در حذف ارتباط');
    } finally {
      setBusy(false);
    }
  }

  const rows = deps.map((d) => {
    const outbound = d.fromTaskId === taskId;
    const other = outbound ? d.toTask : d.fromTask;
    const otherId = outbound ? d.toTaskId : d.fromTaskId;
    const label = outbound
      ? taskLinkTypeLabel[d.type] || d.type
      : taskLinkTypeInverseLabel[d.type] || d.type;
    return { dep: d, other, otherId, label };
  });

  return (
    <section className="panel p-4 sm:p-5">
      <h3 className="font-bold text-ink">ارتباط وظایف</h3>
      <p className="mt-1 text-xs text-ink-mute sm:text-sm">
        مانند جيرا: مسدود کردن، مرتبط بودن، یا تکراری بودن وظایف را مشخص کنید.
      </p>

      <div className="mt-3 space-y-2">
        {rows.map(({ dep, other, otherId, label }) => (
          <div
            key={dep.id}
            className="flex flex-col gap-2 rounded-xl bg-surface-muted px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-ink-mute">{label}</div>
              <Link
                to={`/tasks/${otherId}`}
                className="mt-0.5 block truncate text-sm font-medium text-brand hover:underline"
              >
                #{otherId} {other?.title || 'وظیفه'}
              </Link>
              {other?.status && (
                <div className="mt-0.5 text-[11px] text-ink-faint">
                  {taskStatusLabel[other.status] || other.status}
                </div>
              )}
            </div>
            {canEdit && (
              <button
                type="button"
                className="btn-danger shrink-0 self-start py-1 text-xs sm:self-center"
                disabled={busy}
                onClick={() => removeLink(dep.id)}
              >
                حذف
              </button>
            )}
          </div>
        ))}
        {!rows.length && (
          <div className="text-sm text-ink-faint">هنوز ارتباطی تعریف نشده</div>
        )}
      </div>

      {canEdit && (
        <form onSubmit={addLink} className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">نوع ارتباط</label>
              <select
                className="input"
                value={linkType}
                onChange={(e) => setLinkType(e.target.value)}
              >
                {taskLinkTypes.map((t) => (
                  <option key={t} value={t}>
                    {taskLinkTypeLabel[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="label">جستجوی وظیفه</label>
              <input
                className="input"
                placeholder="عنوان یا #شناسه"
                value={selected ? `#${selected.id} ${selected.title}` : query}
                onChange={(e) => {
                  setSelected(null);
                  setQuery(e.target.value);
                }}
                autoComplete="off"
              />
              {!!hits.length && !selected && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-xl border border-line bg-surface shadow-card">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="block w-full border-b border-line/60 px-3 py-2 text-right text-sm last:border-0 hover:bg-surface-muted"
                      onClick={() => {
                        setSelected(h);
                        setQuery('');
                        setHits([]);
                      }}
                    >
                      <span className="font-medium text-ink">
                        #{h.id} {h.title}
                      </span>
                      {h.project?.name && (
                        <span className="mt-0.5 block text-[11px] text-ink-mute">
                          {h.project.name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <button className="btn-primary w-full sm:w-auto" type="submit" disabled={busy || !selected}>
            {busy ? 'در حال ذخیره...' : 'افزودن ارتباط'}
          </button>
        </form>
      )}
    </section>
  );
}
