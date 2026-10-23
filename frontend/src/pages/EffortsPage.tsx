import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { effortStatusLabel, formatDate } from '../lib/labels';

export default function EffortsPage() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [adjustHours, setAdjustHours] = useState<Record<number, string>>({});

  async function load() {
    setItems(await api('/efforts'));
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function review(id: number, status: string) {
    const hours = adjustHours[id];
    await api(`/efforts/${id}/review`, {
      method: 'PATCH',
      body: {
        status,
        approvedHours: hours ? Number(hours) : undefined,
      } as any,
    });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">ثبت زمان‌ها</h2>
        <p className="mt-1 text-sm text-ink-mute">
          کاربران ساعت کار را ثبت می‌کنند؛ ادمین می‌تواند تأیید یا اصلاح کند.
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-mute">
              <th className="px-4 py-3 text-right font-medium">وظیفه</th>
              <th className="px-4 py-3 text-right font-medium">کاربر</th>
              <th className="px-4 py-3 text-right font-medium">ساعت</th>
              <th className="px-4 py-3 text-right font-medium">وضعیت</th>
              <th className="px-4 py-3 text-right font-medium">تاریخ</th>
              {isAdmin && <th className="px-4 py-3 text-right font-medium">اقدام</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-line align-top">
                <td className="px-4 py-3">
                  <Link className="font-medium text-brand hover:underline" to={`/tasks/${e.task.id}`}>
                    {e.task.title}
                  </Link>
                  <div className="mt-1 text-xs text-ink-mute">{e.description || ''}</div>
                </td>
                <td className="px-4 py-3">{e.user.fullName}</td>
                <td className="px-4 py-3">
                  <div>{e.hours}</div>
                  {e.approvedHours != null && (
                    <div className="text-xs text-emerald-700">تأیید: {e.approvedHours}</div>
                  )}
                </td>
                <td className="px-4 py-3">{effortStatusLabel[e.status]}</td>
                <td className="px-4 py-3">{formatDate(e.workDate)}</td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    {e.status === 'PENDING' ? (
                      <div className="flex min-w-[220px] flex-col gap-2">
                        <input
                          className="input py-1.5"
                          type="number"
                          step="0.25"
                          min="0"
                          placeholder={`اصلاح ساعت (${e.hours})`}
                          value={adjustHours[e.id] || ''}
                          onChange={(ev) =>
                            setAdjustHours((s) => ({ ...s, [e.id]: ev.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-1">
                          <button className="btn-primary py-1.5 text-xs" onClick={() => review(e.id, 'APPROVED')}>
                            تأیید
                          </button>
                          <button className="btn-ghost py-1.5 text-xs" onClick={() => review(e.id, 'ADJUSTED')}>
                            اصلاح
                          </button>
                          <button className="btn-danger py-1.5 text-xs" onClick={() => review(e.id, 'REJECTED')}>
                            رد
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-faint">بررسی‌شده</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
