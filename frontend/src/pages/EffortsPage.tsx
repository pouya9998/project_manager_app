import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { effortStatusLabel, formatDate } from '../lib/labels';

export default function EffortsPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [adjustHours, setAdjustHours] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function load() {
    const qs = filter ? `?status=${filter}` : '';
    setItems(await api(`/efforts${qs}`));
  }

  useEffect(() => {
    load().catch(console.error);
  }, [filter]);

  async function review(id: number, status: string, hoursOverride?: number) {
    const hours = hoursOverride ?? (adjustHours[id] ? Number(adjustHours[id]) : undefined);
    await api(`/efforts/${id}/review`, {
      method: 'PATCH',
      body: {
        status,
        approvedHours: hours,
        reviewNote: notes[id] || undefined,
      } as any,
    });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">ثبت زمان‌ها / حقوق</h2>
          <p className="mt-1 text-sm text-ink-mute">
            کاربر هنگام اتمام وظیفه نرم‌افزاری، MR و ساعت ادعا می‌کند. پیشنهاد خطوط تغییر فقط برای ادمین است.
          </p>
        </div>
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">همه</option>
          <option value="PENDING">در انتظار</option>
          <option value="APPROVED">تأییدشده</option>
          <option value="ADJUSTED">اصلاح‌شده</option>
          <option value="REJECTED">ردشده</option>
        </select>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-mute">
              <th className="px-4 py-3 text-right font-medium">وظیفه</th>
              <th className="px-4 py-3 text-right font-medium">کاربر</th>
              <th className="px-4 py-3 text-right font-medium">MR / کامیت</th>
              <th className="px-4 py-3 text-right font-medium">ادعای کاربر</th>
              {isAdmin && <th className="px-4 py-3 text-right font-medium">پیشنهاد سیستم</th>}
              <th className="px-4 py-3 text-right font-medium">وضعیت</th>
              <th className="px-4 py-3 text-right font-medium">تاریخ</th>
              {isAdmin && <th className="px-4 py-3 text-right font-medium">اقدام حقوق</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-line align-top">
                <td className="px-4 py-3">
                  <Link className="font-medium text-brand hover:underline" to={`/tasks/${e.task.id}`}>
                    {e.task.title}
                  </Link>
                  <div className="mt-1 text-xs text-ink-mute">
                    {e.task.project?.name || ''}
                    {e.source === 'MERGE_REQUEST'
                      ? ' · تکمیل با MR'
                      : e.source === 'COMMIT'
                        ? ' · کامیت'
                        : ' · دستی'}
                  </div>
                </td>
                <td className="px-4 py-3">{e.user.fullName}</td>
                <td className="px-4 py-3">
                  {e.mergeRequest ? (
                    <div>
                      <a
                        className="text-brand hover:underline"
                        href={e.mergeRequest.webUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        !{e.mergeRequest.mrIid}
                      </a>
                      <div className="max-w-[180px] truncate text-xs text-ink-mute">{e.mergeRequest.title}</div>
                    </div>
                  ) : e.commit ? (
                    <div>
                      <a
                        className="text-brand hover:underline"
                        href={e.commit.webUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {e.commit.sha?.slice(0, 8)}
                      </a>
                      <div className="max-w-[180px] truncate text-xs text-ink-mute">{e.commit.title}</div>
                    </div>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{e.hours}س</div>
                  {e.approvedHours != null && (
                    <div className="text-xs text-emerald-700">حقوق نهایی: {e.approvedHours}س</div>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="font-semibold text-amber-800">
                      {e.suggestedHours != null ? `${e.suggestedHours}س` : '—'}
                    </div>
                    {e.adviceMeta?.linesChanged != null && (
                      <div className="text-xs text-ink-mute">
                        {e.adviceMeta.linesChanged} خط تغییر
                        {e.judgeSource === 'AI' ? ' · AI' : e.judgeSource === 'HEURISTIC' ? ' · فرمول' : ''}
                      </div>
                    )}
                    {e.commit && (e.commit.additions != null || e.commit.deletions != null) && (
                      <div className="text-xs text-ink-faint">
                        +{e.commit.additions ?? 0}/-{e.commit.deletions ?? 0}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">{effortStatusLabel[e.status]}</td>
                <td className="px-4 py-3">{formatDate(e.workDate)}</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    {e.status === 'PENDING' ? (
                      <div className="flex min-w-[240px] flex-col gap-2">
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                          کاربر: <strong>{e.hours}س</strong>
                          {e.suggestedHours != null && (
                            <>
                              {' '}
                              · سیستم: <strong>{e.suggestedHours}س</strong>
                            </>
                          )}
                        </div>
                        <input
                          className="input py-1.5"
                          type="number"
                          step="0.25"
                          min="0"
                          placeholder={
                            e.suggestedHours != null
                              ? `ساعت نهایی (پیشنهاد ${e.suggestedHours})`
                              : `ساعت نهایی (${e.hours})`
                          }
                          value={adjustHours[e.id] || ''}
                          onChange={(ev) =>
                            setAdjustHours((s) => ({ ...s, [e.id]: ev.target.value }))
                          }
                        />
                        <input
                          className="input py-1.5"
                          placeholder="یادداشت بررسی"
                          value={notes[e.id] || ''}
                          onChange={(ev) => setNotes((s) => ({ ...s, [e.id]: ev.target.value }))}
                        />
                        <div className="flex flex-wrap gap-1">
                          <button
                            className="btn-primary py-1.5 text-xs"
                            onClick={() => review(e.id, 'APPROVED')}
                          >
                            تأیید ادعا
                          </button>
                          {e.suggestedHours != null && (
                            <button
                              className="btn-ghost py-1.5 text-xs"
                              onClick={() => review(e.id, 'ADJUSTED', e.suggestedHours)}
                            >
                              اعمال پیشنهاد
                            </button>
                          )}
                          <button
                            className="btn-ghost py-1.5 text-xs"
                            onClick={() => review(e.id, 'ADJUSTED')}
                          >
                            اصلاح
                          </button>
                          <button
                            className="btn-danger py-1.5 text-xs"
                            onClick={() => review(e.id, 'REJECTED')}
                          >
                            رد
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-ink-faint">{e.reviewNote || 'بررسی‌شده'}</div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={isAdmin ? 8 : 6} className="px-4 py-8 text-center text-ink-faint">
                  موردی نیست
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
