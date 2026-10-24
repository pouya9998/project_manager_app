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
  type: 'INSTANT' | 'SCHEDULED' | 'RECURRING';
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  recurrence: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startsAt: string;
  endsAt?: string | null;
  hostId: number;
  host: UserLite;
  invitees?: { userId: number; role: string; user: UserLite }[];
  project?: { id: number; name: string } | null;
  liveParticipants?: number;
  startedAt?: string | null;
  endedAt?: string | null;
};

type Stats = {
  participants: {
    user: UserLite;
    joinedAt: string;
    leftAt: string | null;
    durationSec: number;
    sessions: number;
  }[];
  totalDurationSec: number;
  avgDurationSec: number;
  uniqueParticipants: number;
};

const statusLabel: Record<string, string> = {
  SCHEDULED: 'زمان‌بندی‌شده',
  LIVE: 'در حال برگزاری',
  ENDED: 'پایان‌یافته',
  CANCELLED: 'لغو شده',
};

function openMeetingRoom(meetingId: number) {
  window.open(`/meetings/${meetingId}/room`, '_blank', 'noopener,noreferrer');
}

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

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${s}ث`;
  return `${s}ث`;
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterDay, setFilterDay] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 3600000).toISOString()),
  );
  const [recurrence, setRecurrence] = useState<'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('NONE');
  const [inviteeIds, setInviteeIds] = useState<number[]>([]);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [startNow, setStartNow] = useState(wantInstant);

  async function loadCalendar() {
    const from = new Date(Date.now() - 14 * 86400000).toISOString();
    const to = new Date(Date.now() + 90 * 86400000).toISOString();
    const list = await api<Meeting[]>(`/meetings/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    setMeetings(list);
  }

  useEffect(() => {
    loadCalendar().catch((e) => setError(e.message));
    api<UserLite[]>('/users')
      .then((u) => setUsers(u.filter((x) => x.id !== user?.id)))
      .catch(() => {});
    api<{ id: number; name: string }[]>('/projects')
      .then(setProjects)
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    setStartNow(wantInstant);
  }, [wantInstant]);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await api<Meeting>(`/meetings/${id}`);
        if (cancelled) return;
        setDetail(m);
        if (m.status === 'ENDED' || m.status === 'LIVE') {
          const s = await api<Stats>(`/meetings/${id}/stats`);
          if (!cancelled) setStats(s);
        } else {
          setStats(null);
        }
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
      if (startNow || created.status === 'LIVE') {
        openMeetingRoom(created.id);
        navigate(`/meetings/${created.id}`);
      } else {
        navigate(`/meetings/${created.id}`);
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
      await api(`/meetings/${meetingId}/start`, { method: 'POST', body: {} as any });
      openMeetingRoom(meetingId);
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

  function toggleInvitee(uid: number) {
    setInviteeIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  if (creating) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="page-title">جلسه جدید</h1>
            <p className="page-sub">فوری، زمان‌بندی‌شده یا تکراری — مثل گوگل میت داخل سامانه</p>
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
            شروع فوری (همین الان وارد اتاق شوید)
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
              {busy ? '...' : startNow ? 'شروع جلسه' : 'ایجاد جلسه'}
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

        <div className="flex flex-wrap gap-2">
          {(detail.status === 'LIVE' || detail.status === 'SCHEDULED') && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                detail.status === 'LIVE'
                  ? openMeetingRoom(detail.id)
                  : startMeeting(detail.id)
              }
            >
              {detail.status === 'LIVE' ? 'ورود به اتاق' : 'شروع جلسه'}
            </button>
          )}
          {detail.status === 'LIVE' && (
            <Link
              to={`/meetings/${detail.id}/room`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              باز کردن اتاق جلسه
            </Link>
          )}
          {isHost && detail.status !== 'CANCELLED' && detail.status !== 'ENDED' && (
            <button type="button" className="btn-danger" disabled={busy} onClick={() => cancelMeeting(detail.id)}>
              لغو جلسه
            </button>
          )}
        </div>

        {stats && (
          <div className="panel space-y-3 p-5">
            <h2 className="text-sm font-bold">آمار حضور</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-muted px-2 py-3">
                <div className="text-lg font-bold">{stats.uniqueParticipants}</div>
                <div className="text-[11px] text-ink-mute">نفر</div>
              </div>
              <div className="rounded-xl bg-surface-muted px-2 py-3">
                <div className="text-lg font-bold">{formatDuration(stats.totalDurationSec)}</div>
                <div className="text-[11px] text-ink-mute">مجموع</div>
              </div>
              <div className="rounded-xl bg-surface-muted px-2 py-3">
                <div className="text-lg font-bold">{formatDuration(stats.avgDurationSec)}</div>
                <div className="text-[11px] text-ink-mute">میانگین</div>
              </div>
            </div>
            <div className="divide-y divide-line">
              {stats.participants.map((p) => (
                <div key={p.user.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-semibold">{p.user.fullName}</span>
                  <span className="text-ink-mute">{formatDuration(p.durationSec)}</span>
                </div>
              ))}
              {!stats.participants.length && (
                <div className="py-3 text-center text-sm text-ink-mute">هنوز کسی وارد نشده</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">جلسات</h1>
          <p className="page-sub">تقویم، دعوت، و اتاق تصویری داخل سامانه</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/meetings?new=instant" className="btn-primary">
            شروع فوری
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
            <Link key={m.id} to={`/meetings/${m.id}`} className="panel block p-4 transition hover:border-[color:rgb(var(--brand-rgb)/0.4)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-bold text-ink">{m.title}</div>
                  <div className="mt-1 text-xs text-ink-mute">{formatDate(m.startsAt)}</div>
                  <div className="mt-1 text-xs text-ink-faint">
                    میزبان: {m.host.fullName}
                    {m.recurrence !== 'NONE' ? ` · ${recurrenceLabel[m.recurrence]}` : ''}
                  </div>
                </div>
                <span className={`chip shrink-0 ${statusChip(m.status)}`}>{statusLabel[m.status]}</span>
              </div>
            </Link>
          ))}
          {!upcoming.length && (
            <div className="panel p-6 text-center text-sm text-ink-mute md:col-span-2">
              جلسه‌ای در پیش نیست — یک جلسه فوری بسازید.
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
