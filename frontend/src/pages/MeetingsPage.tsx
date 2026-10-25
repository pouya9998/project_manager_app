import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatDate } from '../lib/labels';

type UserLite = { id: number; fullName: string; email?: string; avatarFile?: string | null };

type Meeting = {
  id: number;
  title: string;
  description?: string | null;
  meetingUrl?: string | null;
  jitsiRoom?: string | null;
  type: 'INSTANT' | 'SCHEDULED' | 'RECURRING';
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startsAt: string;
  endsAt?: string | null;
  hostId: number;
  host: UserLite;
  invitees?: { userId: number; role: string; user: UserLite }[];
  project?: { id: number; name: string } | null;
  startedAt?: string | null;
  endedAt?: string | null;
  liveParticipants?: number;
  online?: { userId: number; user: UserLite; joinedAt: string }[];
  jitsiEnabled?: boolean;
};

const statusLabel: Record<string, string> = {
  SCHEDULED: 'زمان‌بندی‌شده',
  LIVE: 'در حال برگزاری',
  ENDED: 'پایان‌یافته',
  CANCELLED: 'لغو شده',
};

const recurrenceLabel: Record<string, string> = {
  NONE: 'بدون تکرار',
  DAILY: 'روزانه',
  WEEKLY: 'هفتگی',
  MONTHLY: 'ماهانه',
};

function statusChip(status: string) {
  if (status === 'LIVE') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (status === 'SCHEDULED') return 'bg-sky-500/15 text-sky-800 dark:text-sky-300';
  if (status === 'ENDED') return 'bg-surface-soft text-ink-mute';
  return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
}

function openExternalMeeting(url?: string | null) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function toLocalInputValue(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string) {
  if (!local) return undefined;
  return new Date(local).toISOString();
}

export default function MeetingsPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const creating = search.get('new') === '1' || search.get('new') === 'instant';
  const wantInstant = search.get('new') === 'instant';

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterDay, setFilterDay] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [useJitsi, setUseJitsi] = useState(true);
  const [jitsiAvailable, setJitsiAvailable] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 3600000).toISOString()),
  );
  const [recurrence, setRecurrence] = useState<'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('NONE');
  const [inviteeIds, setInviteeIds] = useState<number[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [startNow, setStartNow] = useState(wantInstant);

  const [editUrl, setEditUrl] = useState('');

  async function loadCalendar() {
    const from = new Date(Date.now() - 14 * 86400000).toISOString();
    const to = new Date(Date.now() + 90 * 86400000).toISOString();
    const list = await api<Meeting[]>(
      `/meetings/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    setMeetings(list);
  }

  useEffect(() => {
    loadCalendar().catch((e) => setError(e.message));
    api<{ jitsiEnabled: boolean }>('/meetings/config')
      .then((c) => {
        setJitsiAvailable(!!c.jitsiEnabled);
        setUseJitsi(!!c.jitsiEnabled);
      })
      .catch(() => setJitsiAvailable(false));
    api<UserLite[]>('/users')
      .then((u) => setUsers(u.filter((x) => x.id !== user?.id)))
      .catch(() => {});
    api<{ id: number; name: string }[]>('/projects')
      .then(setProjects)
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!id) return;
    const t = window.setInterval(() => {
      api<Meeting>(`/meetings/${id}`)
        .then((m) => setDetail(m))
        .catch(() => {});
    }, 15000);
    return () => window.clearInterval(t);
  }, [id]);

  useEffect(() => {
    setStartNow(wantInstant);
  }, [wantInstant]);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await api<Meeting>(`/meetings/${id}`);
        if (cancelled) return;
        setDetail(m);
        setEditUrl(m.meetingUrl || '');
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const filtered = useMemo(() => {
    if (!filterDay) return meetings;
    return meetings.filter((m) => m.startsAt.slice(0, 10) === filterDay);
  }, [meetings, filterDay]);

  const upcoming = filtered.filter((m) => m.status === 'SCHEDULED' || m.status === 'LIVE');
  const past = filtered.filter((m) => m.status === 'ENDED' || m.status === 'CANCELLED');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api<Meeting>('/meetings', {
        method: 'POST',
        body: {
          title,
          description: description || undefined,
          meetingUrl: useJitsi ? undefined : meetingUrl.trim() || undefined,
          useJitsi: useJitsi && jitsiAvailable,
          type: startNow ? 'INSTANT' : recurrence !== 'NONE' ? 'RECURRING' : 'SCHEDULED',
          startsAt: startNow ? new Date().toISOString() : fromLocalInputValue(startsAt),
          endsAt: fromLocalInputValue(endsAt),
          recurrence,
          inviteeIds,
          projectId: projectId === '' ? undefined : Number(projectId),
          startNow,
        } as any,
      });
      await loadCalendar();
      navigate(`/meetings/${created.id}`);
      if (startNow) {
        const join = await api<{ url: string }>(`/meetings/${created.id}/join`, {
          method: 'POST',
          body: {} as any,
        });
        openExternalMeeting(join.url);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startMeeting(meetingId: number) {
    setBusy(true);
    try {
      const m = await api<Meeting>(`/meetings/${meetingId}/start`, { method: 'POST', body: {} as any });
      setDetail(m);
      await loadCalendar();
      const join = await api<{ url: string }>(`/meetings/${meetingId}/join`, {
        method: 'POST',
        body: {} as any,
      });
      openExternalMeeting(join.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinMeeting(meetingId: number) {
    setBusy(true);
    setError('');
    try {
      const join = await api<{ url: string }>(`/meetings/${meetingId}/join`, {
        method: 'POST',
        body: {} as any,
      });
      openExternalMeeting(join.url);
      const m = await api<Meeting>(`/meetings/${meetingId}`);
      setDetail(m);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function attachJitsi(meetingId: number) {
    setBusy(true);
    try {
      const m = await api<Meeting>(`/meetings/${meetingId}/ensure-jitsi`, {
        method: 'POST',
        body: {} as any,
      });
      setDetail(m);
      setEditUrl(m.meetingUrl || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMeetingUrl() {
    if (!detail) return;
    setBusy(true);
    setError('');
    try {
      const m = await api<Meeting>(`/meetings/${detail.id}`, {
        method: 'PATCH',
        body: { meetingUrl: editUrl.trim() || null } as any,
      });
      setDetail(m);
      setEditUrl(m.meetingUrl || '');
      await loadCalendar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelMeeting(meetingId: number) {
    if (!confirm('جلسه لغو شود؟')) return;
    setBusy(true);
    try {
      await api(`/meetings/${meetingId}`, {
        method: 'PATCH',
        body: { status: 'CANCELLED' } as any,
      });
      await loadCalendar();
      navigate('/meetings');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function endMeeting(meetingId: number) {
    setBusy(true);
    try {
      const m = await api<Meeting>(`/meetings/${meetingId}`, {
        method: 'PATCH',
        body: { status: 'ENDED' } as any,
      });
      setDetail(m);
      await loadCalendar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleInvitee(uid: number) {
    setInviteeIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  if (creating) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="page-title">جلسه جدید</h1>
            <p className="page-sub">اتاق جیتسی داخلی یا لینک گوگل میت / زوم</p>
          </div>
          <Link to="/meetings" className="btn-ghost">
            بازگشت
          </Link>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={onCreate} className="panel space-y-4 p-5">
          <label className="block">
            <span className="label">عنوان</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          {jitsiAvailable && (
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={useJitsi}
                onChange={(e) => setUseJitsi(e.target.checked)}
              />
              ایجاد اتاق در جیتسی (خودمیزبان)
            </label>
          )}

          {(!jitsiAvailable || !useJitsi) && (
            <label className="block">
              <span className="label">لینک خارجی (Google Meet / Zoom / …)</span>
              <input
                className="input"
                type="url"
                dir="ltr"
                placeholder="https://meet.google.com/..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
              />
            </label>
          )}
          <label className="block">
            <span className="label">توضیحات</span>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={startNow}
              onChange={(e) => setStartNow(e.target.checked)}
            />
            شروع فوری (وضعیت «در حال برگزاری»)
          </label>

          {!startNow && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">شروع</span>
                <input
                  type="datetime-local"
                  className="input"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="label">پایان تقریبی</span>
                <input
                  type="datetime-local"
                  className="input"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="label">تکرار</span>
            <select
              className="input"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as any)}
              disabled={startNow}
            >
              <option value="NONE">بدون تکرار</option>
              <option value="DAILY">روزانه</option>
              <option value="WEEKLY">هفتگی</option>
              <option value="MONTHLY">ماهانه</option>
            </select>
          </label>

          <label className="block">
            <span className="label">پروژه (اختیاری)</span>
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="label">دعوت‌شدگان</div>
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-xl border border-line bg-surface-muted p-3">
              {users.map((u) => {
                const active = inviteeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`chip ${active ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}
                    onClick={() => toggleInvitee(u.id)}
                  >
                    {u.fullName}
                  </button>
                );
              })}
              {!users.length && <span className="text-xs text-ink-mute">کاربری نیست</span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '...' : startNow ? 'ایجاد و باز کردن لینک' : 'ایجاد جلسه'}
            </button>
            <Link to="/meetings" className="btn-ghost">
              انصراف
            </Link>
          </div>
        </form>
      </div>
    );
  }

  if (id && detail) {
    const isHost = detail.hostId === user?.id;
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/meetings" className="text-xs font-semibold text-brand">
              ← بازگشت به تقویم
            </Link>
            <h1 className="page-title mt-1">{detail.title}</h1>
            <p className="page-sub">{detail.description || 'بدون توضیحات'}</p>
          </div>
          <span className={`chip ${statusChip(detail.status)}`}>{statusLabel[detail.status]}</span>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="panel grid gap-3 p-5 sm:grid-cols-2">
          <div>
            <div className="text-xs text-ink-mute">میزبان</div>
            <div className="font-semibold">{detail.host.fullName}</div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">زمان</div>
            <div className="font-semibold">{formatDate(detail.startsAt)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">تکرار</div>
            <div className="font-semibold">{recurrenceLabel[detail.recurrence]}</div>
          </div>
          <div>
            <div className="text-xs text-ink-mute">پروژه</div>
            <div className="font-semibold">{detail.project?.name || '—'}</div>
          </div>
        </div>

        <div className="panel space-y-3 p-5">
          <h2 className="text-sm font-bold">لینک جلسه</h2>
          {detail.jitsiRoom && (
            <div className="text-xs text-ink-mute">
              جیتسی · اتاق <span dir="ltr">{detail.jitsiRoom}</span>
            </div>
          )}
          {isHost ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1"
                dir="ltr"
                placeholder="https://meet.google.com/..."
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
              />
              <button type="button" className="btn-ghost" disabled={busy} onClick={saveMeetingUrl}>
                ذخیره لینک
              </button>
            </div>
          ) : detail.meetingUrl ? (
            <a
              href={detail.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm font-semibold text-brand"
              dir="ltr"
            >
              {detail.meetingUrl}
            </a>
          ) : (
            <p className="text-sm text-ink-mute">هنوز لینکی ثبت نشده است</p>
          )}
          {isHost && jitsiAvailable && !detail.jitsiRoom && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => attachJitsi(detail.id)}>
              اتصال به جیتسی
            </button>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 text-sm font-bold">شرکت‌کنندگان دعوت‌شده</h2>
          <div className="flex flex-wrap gap-2">
            {(detail.invitees || []).map((i) => (
              <span key={i.userId} className="chip bg-surface-soft text-ink-soft">
                {i.user.fullName}
                {i.role === 'HOST' ? ' · میزبان' : ''}
              </span>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 text-sm font-bold">
            آنلاین الان ({detail.online?.length || detail.liveParticipants || 0})
          </h2>
          <div className="flex flex-wrap gap-2">
            {(detail.online || []).map((o) => (
              <span key={o.userId} className="chip bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                {o.user.fullName}
              </span>
            ))}
            {!detail.online?.length && (
              <span className="text-sm text-ink-mute">کسی از طریق سامانه وارد نشده</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {detail.status !== 'CANCELLED' && detail.status !== 'ENDED' && (detail.meetingUrl || jitsiAvailable) && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => joinMeeting(detail.id)}
            >
              ورود به جلسه
            </button>
          )}
          {isHost && detail.status === 'SCHEDULED' && (
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => startMeeting(detail.id)}
            >
              اعلام شروع
            </button>
          )}
          {isHost && detail.status === 'LIVE' && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => endMeeting(detail.id)}>
              پایان جلسه
            </button>
          )}
          {isHost && detail.status !== 'CANCELLED' && detail.status !== 'ENDED' && (
            <button
              type="button"
              className="btn-danger"
              disabled={busy}
              onClick={() => cancelMeeting(detail.id)}
            >
              لغو جلسه
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">جلسات</h1>
          <p className="page-sub">
            {jitsiAvailable
              ? 'جیتسی خودمیزبان + لینک خارجی · حضور آنلاین'
              : 'لینک گوگل میت / زوم (جیتسی پیکربندی نشده)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/meetings?new=instant" className="btn-primary">
            جلسه فوری
          </Link>
          <Link to="/meetings?new=1" className="btn-ghost">
            جلسه زمان‌بندی‌شده
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <span className="label">فیلتر روز (شمسی)</span>
          <JalaliDatePicker value={filterDay} onChange={setFilterDay} />
        </div>
        {filterDay && (
          <button type="button" className="btn-ghost" onClick={() => setFilterDay('')}>
            پاک کردن فیلتر
          </button>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">پیش‌رو و فعال</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {upcoming.map((m) => (
            <Link
              key={m.id}
              to={`/meetings/${m.id}`}
              className="panel block p-4 transition hover:border-[color:rgb(var(--brand-rgb)/0.4)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold text-ink">{m.title}</div>
                  <div className="mt-1 text-xs text-ink-mute">{formatDate(m.startsAt)}</div>
                  <div className="mt-1 text-xs text-ink-faint">
                    میزبان: {m.host.fullName}
                    {m.recurrence !== 'NONE' ? ` · ${recurrenceLabel[m.recurrence]}` : ''}
                    {m.meetingUrl ? ' · دارای لینک' : ''}
                  </div>
                </div>
                <span className={`chip shrink-0 ${statusChip(m.status)}`}>{statusLabel[m.status]}</span>
              </div>
            </Link>
          ))}
          {!upcoming.length && (
            <div className="panel p-6 text-center text-sm text-ink-mute md:col-span-2">
              جلسه‌ای در پیش نیست — یک جلسه جیتسی یا با لینک خارجی بسازید.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">گذشته</h2>
        <div className="panel divide-y divide-line overflow-hidden">
          {past.map((m) => (
            <Link
              key={m.id}
              to={`/meetings/${m.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-soft"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{m.title}</div>
                <div className="text-xs text-ink-mute">{formatDate(m.startsAt)}</div>
              </div>
              <span className={`chip ${statusChip(m.status)}`}>{statusLabel[m.status]}</span>
            </Link>
          ))}
          {!past.length && <div className="p-4 text-center text-sm text-ink-mute">سابقه‌ای نیست</div>}
        </div>
      </section>
    </div>
  );
}
