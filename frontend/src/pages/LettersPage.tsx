import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateOnly } from '../lib/labels';
import UserAvatar from '../components/chat/UserAvatar';

type UserLite = {
  id: number;
  fullName: string;
  email?: string;
  avatarFile?: string | null;
};

type Letter = {
  id: number;
  subject: string;
  body: string;
  status: 'DRAFT' | 'SENT';
  sentAt?: string | null;
  createdAt: string;
  sender: UserLite;
  recipients: { id: number; userId: number; readAt?: string | null; user: UserLite }[];
};

type Template = {
  id: number;
  title: string;
  subject: string;
  body: string;
  isShared: boolean;
  createdBy?: { id: number; fullName: string };
};

type Box = 'inbox' | 'sent' | 'drafts' | 'compose' | 'templates';

export default function LettersPage() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [box, setBox] = useState<Box>('inbox');
  const [letters, setLetters] = useState<Letter[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState('');

  const [tplTitle, setTplTitle] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState(
    'با سلام\n\n{{fullName}} عزیز،\n\n\n\nبا احترام\n{{senderName}}\n{{date}}',
  );

  async function loadBox(next: Box = box) {
    if (next === 'compose' || next === 'templates') return;
    const list = await api<Letter[]>(`/letters?box=${next === 'inbox' ? 'inbox' : next}`);
    setLetters(list);
  }

  async function loadTemplates() {
    setTemplates(await api<Template[]>('/letters/templates'));
  }

  useEffect(() => {
    api<UserLite[]>('/users')
      .then((list) => setUsers(list.filter((u) => u.id !== user?.id)))
      .catch(() => {});
    loadTemplates().catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    setError('');
    setMsg('');
    if (box === 'templates') {
      loadTemplates().catch((e) => setError(e.message));
      return;
    }
    if (box === 'compose') return;
    loadBox(box).catch((e) => setError(e.message));
  }, [box]);

  useEffect(() => {
    if (!idParam) return;
    api<Letter>(`/letters/${idParam}`)
      .then((l) => {
        setSelected(l);
        setBox(l.sender.id === user?.id ? 'sent' : 'inbox');
      })
      .catch((e) => setError(e.message));
  }, [idParam, user?.id]);

  const unreadIds = useMemo(() => {
    if (box !== 'inbox') return new Set<number>();
    return new Set(
      letters
        .filter((l) => l.recipients.some((r) => r.userId === user?.id && !r.readAt))
        .map((l) => l.id),
    );
  }, [letters, box, user?.id]);

  function toggleRecipient(id: number) {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function openLetter(l: Letter) {
    try {
      const full = await api<Letter>(`/letters/${l.id}`);
      setSelected(full);
      navigate(`/letters/${l.id}`, { replace: true });
      if (box === 'inbox') loadBox('inbox').catch(() => {});
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function applyTemplate(id: number) {
    setError('');
    try {
      const preview = await api<{ subject: string; body: string }>(
        `/letters/templates/${id}/preview${
          recipientIds[0] ? `?recipientId=${recipientIds[0]}` : ''
        }`,
      );
      setSubject(preview.subject);
      setBody(preview.body);
      setTemplateId(String(id));
      setMsg('قالب اعمال شد — در صورت نیاز متن را ویرایش کنید');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function sendLetter(e: FormEvent, asDraft = false) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const letter = await api<Letter>('/letters', {
        method: 'POST',
        body: {
          subject,
          body,
          recipientIds,
          send: !asDraft,
        } as any,
      });
      setMsg(asDraft ? 'پیش‌نویس ذخیره شد' : 'نامه ارسال شد');
      setSubject('');
      setBody('');
      setRecipientIds([]);
      setTemplateId('');
      if (!asDraft) {
        setBox('sent');
        setSelected(letter);
        navigate(`/letters/${letter.id}`);
      } else {
        setBox('drafts');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendDraft(id: number) {
    setBusy(true);
    setError('');
    try {
      const letter = await api<Letter>(`/letters/${id}/send`, { method: 'POST', body: {} as any });
      setMsg('نامه ارسال شد');
      setSelected(letter);
      setBox('sent');
      navigate(`/letters/${letter.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLetter(id: number) {
    if (!confirm('حذف این نامه؟')) return;
    await api(`/letters/${id}`, { method: 'DELETE' });
    setSelected(null);
    navigate('/letters');
    await loadBox(box === 'compose' || box === 'templates' ? 'inbox' : box);
  }

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/letters/templates', {
        method: 'POST',
        body: {
          title: tplTitle,
          subject: tplSubject,
          body: tplBody,
          isShared: true,
        } as any,
      });
      setTplTitle('');
      setTplSubject('');
      setTplBody('با سلام\n\n{{fullName}} عزیز،\n\n\n\nبا احترام\n{{senderName}}\n{{date}}');
      setMsg('قالب ذخیره شد');
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTemplate(id: number) {
    if (!confirm('حذف قالب؟')) return;
    await api(`/letters/templates/${id}`, { method: 'DELETE' });
    await loadTemplates();
  }

  const tabs: { id: Box; label: string }[] = [
    { id: 'inbox', label: 'صندوق ورودی' },
    { id: 'sent', label: 'ارسال‌شده' },
    { id: 'drafts', label: 'پیش‌نویس' },
    { id: 'compose', label: 'نامه جدید' },
    { id: 'templates', label: 'قالب‌ها' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">نامه‌نگاری</h2>
          <p className="page-sub">ارسال نامه رسمی داخل سامانه با قالب و اعلان خودکار</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setBox('compose');
            setSelected(null);
            navigate('/letters');
          }}
        >
          نامه جدید
        </button>
      </div>

      {(msg || error) && (
        <div
          className={`rounded-xl px-3 py-2 text-sm ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || msg}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              box === t.id ? 'bg-brand text-white' : 'text-ink-soft hover:bg-surface-soft'
            }`}
            onClick={() => {
              setBox(t.id);
              setSelected(null);
              navigate('/letters');
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {box === 'compose' && (
        <form onSubmit={(e) => sendLetter(e, false)} className="panel space-y-4 p-5">
          <div>
            <label className="label">قالب آماده (اختیاری)</label>
            <div className="flex flex-wrap gap-2">
              <select
                className="input max-w-sm"
                value={templateId}
                onChange={(e) => {
                  const v = e.target.value;
                  setTemplateId(v);
                  if (v) applyTemplate(Number(v));
                }}
              >
                <option value="">بدون قالب</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <span className="self-center text-xs text-ink-mute">
                متغیرها: {'{{fullName}} {{senderName}} {{appName}} {{date}}'}
              </span>
            </div>
          </div>

          <div>
            <label className="label">گیرندگان</label>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border border-line bg-surface-muted p-3">
              {users.map((u) => {
                const active = recipientIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`chip ${active ? 'bg-brand text-white' : 'bg-surface text-ink-soft'}`}
                    onClick={() => toggleRecipient(u.id)}
                  >
                    {u.fullName}
                  </button>
                );
              })}
              {!users.length && <span className="text-sm text-ink-faint">کاربری نیست</span>}
            </div>
          </div>

          <div>
            <label className="label">موضوع</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">متن نامه</label>
            <textarea
              className="input min-h-[200px] font-body leading-7"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? '...' : 'ارسال نامه'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={(e) => sendLetter(e as any, true)}
            >
              ذخیره پیش‌نویس
            </button>
          </div>
        </form>
      )}

      {box === 'templates' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={saveTemplate} className="panel space-y-3 p-5">
            <h3 className="font-bold text-ink">قالب جدید</h3>
            <p className="text-xs text-ink-mute">
              برای ارسال خودکار از متغیرهای {'{{fullName}}'}، {'{{senderName}}'}، {'{{appName}}'} و{' '}
              {'{{date}}'} استفاده کنید.
            </p>
            <div>
              <label className="label">عنوان قالب</label>
              <input
                className="input"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">موضوع</label>
              <input
                className="input"
                value={tplSubject}
                onChange={(e) => setTplSubject(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">متن</label>
              <textarea
                className="input min-h-[160px]"
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary" disabled={busy}>
              ذخیره قالب
            </button>
          </form>

          <div className="panel space-y-3 p-5">
            <h3 className="font-bold text-ink">قالب‌های موجود</h3>
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-line bg-surface-muted px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-ink">{t.title}</div>
                    <div className="text-xs text-ink-mute">{t.subject}</div>
                  </div>
                  {(t.createdBy?.id === user?.id || isAdmin) && (
                    <button
                      type="button"
                      className="btn-danger py-1 text-xs"
                      onClick={() => removeTemplate(t.id)}
                    >
                      حذف
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-ghost mt-2 text-xs"
                  onClick={() => {
                    setBox('compose');
                    applyTemplate(t.id);
                  }}
                >
                  استفاده در نامه جدید
                </button>
              </div>
            ))}
            {!templates.length && (
              <div className="text-sm text-ink-faint">هنوز قالبی ثبت نشده</div>
            )}
          </div>
        </div>
      )}

      {(box === 'inbox' || box === 'sent' || box === 'drafts') && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
          <div className="panel max-h-[70vh] overflow-y-auto">
            {letters.map((l) => {
              const unread = unreadIds.has(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => openLetter(l)}
                  className={`flex w-full gap-3 border-b border-line/70 px-3 py-3 text-right transition hover:bg-surface-soft ${
                    selected?.id === l.id ? 'bg-brand-soft' : ''
                  }`}
                >
                  <UserAvatar
                    name={box === 'inbox' ? l.sender.fullName : l.recipients[0]?.user.fullName}
                    avatarFile={
                      box === 'inbox'
                        ? l.sender.avatarFile
                        : l.recipients[0]?.user.avatarFile
                    }
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`truncate text-sm ${
                          unread ? 'font-bold text-ink' : 'font-semibold text-ink'
                        }`}
                      >
                        {l.subject}
                      </div>
                      {unread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-mute">
                      {box === 'inbox'
                        ? l.sender.fullName
                        : l.recipients.map((r) => r.user.fullName).join('، ') || 'بدون گیرنده'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">
                      {formatDate(l.sentAt || l.createdAt)}
                    </div>
                  </div>
                </button>
              );
            })}
            {!letters.length && (
              <div className="p-6 text-center text-sm text-ink-mute">نامه‌ای نیست</div>
            )}
          </div>

          <div className="panel min-h-[320px] p-5">
            {!selected ? (
              <div className="grid h-full min-h-[280px] place-items-center text-ink-mute">
                یک نامه را انتخاب کنید
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-ink">{selected.subject}</h3>
                    <div className="mt-1 text-sm text-ink-mute">
                      از: {selected.sender.fullName}
                      {' · '}
                      {selected.sentAt
                        ? formatDate(selected.sentAt)
                        : `پیش‌نویس ${formatDateOnly(selected.createdAt)}`}
                    </div>
                    <div className="mt-1 text-sm text-ink-mute">
                      به:{' '}
                      {selected.recipients.map((r) => r.user.fullName).join('، ') || '—'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'DRAFT' && selected.sender.id === user?.id && (
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={busy}
                        onClick={() => sendDraft(selected.id)}
                      >
                        ارسال
                      </button>
                    )}
                    {(selected.sender.id === user?.id || isAdmin) && (
                      <button
                        type="button"
                        className="btn-danger text-sm"
                        onClick={() => removeLetter(selected.id)}
                      >
                        حذف
                      </button>
                    )}
                    <Link to="/letters" className="btn-ghost text-sm" onClick={() => setSelected(null)}>
                      بستن
                    </Link>
                  </div>
                </div>
                <div className="whitespace-pre-wrap rounded-2xl border border-line bg-surface-muted px-4 py-4 text-sm leading-7 text-ink">
                  {selected.body}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
