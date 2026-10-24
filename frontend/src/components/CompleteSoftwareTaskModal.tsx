import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type Props = {
  taskId: number;
  taskTitle?: string;
  open: boolean;
  onClose: () => void;
  onCompleted: (result: any) => void;
};

const stateLabel: Record<string, string> = {
  opened: 'باز',
  merged: 'ادغام‌شده',
  closed: 'بسته‌شده',
  locked: 'قفل',
};

export default function CompleteSoftwareTaskModal({
  taskId,
  taskTitle,
  open,
  onClose,
  onCompleted,
}: Props) {
  const [mrs, setMrs] = useState<any[]>([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [mrIid, setMrIid] = useState('');
  const [hours, setHours] = useState('1');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMrs, setLoadingMrs] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMrIid('');
    setHours('1');
    setDescription('');
    setStateFilter('all');
    setLoadingMrs(true);
    api<any>(`/efforts/completion-options?taskId=${taskId}`)
      .then((res) => {
        const list = res.mergeRequests || [];
        setMrs(list);
        const first = list.find((m: any) => !m.claimed && m.state === 'merged')
          || list.find((m: any) => !m.claimed && m.state === 'opened')
          || list.find((m: any) => !m.claimed);
        if (first) setMrIid(String(first.mrIid));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMrs(false));
  }, [open, taskId]);

  const filtered = useMemo(() => {
    if (stateFilter === 'all') return mrs;
    return mrs.filter((m) => m.state === stateFilter);
  }, [mrs, stateFilter]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!mrIid) {
      setError('یک مرج‌ریکوئست انتخاب کنید');
      return;
    }
    setLoading(true);
    try {
      const res = await api(`/efforts/complete-task/${taskId}`, {
        method: 'POST',
        body: {
          mrIid: Number(mrIid),
          hours: Number(hours),
          description: description || undefined,
        } as any,
      });
      onCompleted(res);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="panel w-full max-w-lg space-y-4 p-5 shadow-xl">
        <div>
          <h3 className="text-lg font-bold text-ink">تکمیل وظیفه نرم‌افزاری</h3>
          <p className="mt-1 text-sm text-ink-mute">
            {taskTitle ? `«${taskTitle}» — ` : ''}
            همه MRهای این پروژه گیت‌لب (باز / ادغام / بسته) را می‌بینید؛ یکی را انتخاب و ساعت را وارد کنید.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">فیلتر وضعیت</label>
            <select
              className="input"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            >
              <option value="all">همه ({mrs.length})</option>
              <option value="opened">باز</option>
              <option value="merged">ادغام‌شده</option>
              <option value="closed">بسته‌شده</option>
            </select>
          </div>
          <div>
            <label className="label">مرج‌ریکوئست پروژه *</label>
            <select
              className="input"
              value={mrIid}
              onChange={(e) => setMrIid(e.target.value)}
              required
              disabled={loadingMrs}
            >
              <option value="">{loadingMrs ? 'در حال بارگذاری از گیت‌لب...' : 'انتخاب MR'}</option>
              {filtered.map((m) => (
                <option key={m.mrIid} value={m.mrIid} disabled={m.claimed}>
                  !{m.mrIid} [{stateLabel[m.state] || m.state || '?'}] {m.title}
                  {m.claimed ? ' — قبلاً ثبت‌شده' : ''}
                </option>
              ))}
            </select>
            {!loadingMrs && !mrs.length && (
              <p className="mt-1 text-xs text-amber-700">
                در این پروژه گیت‌لب هیچ مرج‌ریکوئستی یافت نشد.
              </p>
            )}
            {!loadingMrs && mrs.length > 0 && !filtered.length && (
              <p className="mt-1 text-xs text-ink-mute">با این فیلتر موردی نیست.</p>
            )}
          </div>
          <div>
            <label className="label">ساعت کار (ادعای شما) *</label>
            <input
              className="input"
              type="number"
              min="0.25"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-ink-mute">
              فقط ساعت ادعایی شما ثبت می‌شود؛ برآورد سیستم فقط برای ادمین نمایش داده می‌شود.
            </p>
          </div>
          <div>
            <label className="label">توضیح (اختیاری)</label>
            <textarea
              className="input min-h-[70px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
              انصراف
            </button>
            <button className="btn-primary" type="submit" disabled={loading || loadingMrs || !mrs.length}>
              {loading ? '...' : 'ثبت و اتمام وظیفه'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
