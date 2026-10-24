import { FormEvent, useEffect, useState } from 'react';
import { api, uploadsUrl } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function ProfilePage() {
  const { user, setUser, refreshUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [statusMessage, setStatusMessage] = useState(user?.statusMessage || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName || '');
    setStatusMessage(user?.statusMessage || '');
  }, [user]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const updated = await api('/auth/profile', {
        method: 'PATCH',
        body: { fullName, statusMessage } as any,
      });
      setUser(updated as any);
      setMsg('پروفایل ذخیره شد');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/auth/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword } as any,
      });
      setCurrentPassword('');
      setNewPassword('');
      setMsg('رمز عبور تغییر کرد');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(file?: File | null) {
    if (!file) return;
    setError('');
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const updated = await api('/auth/avatar', { method: 'POST', formData: fd });
      setUser(updated as any);
      await refreshUser();
      setMsg('تصویر پروفایل به‌روزرسانی شد');
    } catch (err: any) {
      setError(err.message);
    }
  }

  const avatarUrl = user?.avatarFile ? uploadsUrl(`avatars/${user.avatarFile}`) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="page-title">پروفایل من</h2>
        <p className="page-sub">وضعیت، نام، رمز و تصویر پروفایل</p>
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

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <section className="panel flex flex-col items-center gap-4 p-6">
          <div className="h-28 w-28 overflow-hidden rounded-full border border-line bg-surface-muted">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-2xl font-bold text-ink-mute">
                {(user?.fullName || '?').slice(0, 1)}
              </div>
            )}
          </div>
          <label className="btn-primary cursor-pointer text-sm">
            تغییر تصویر
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onAvatar(e.target.files?.[0])}
            />
          </label>
          {user?.statusMessage && (
            <p className="text-center text-sm text-ink-soft">«{user.statusMessage}»</p>
          )}
        </section>

        <div className="space-y-5">
          <form onSubmit={saveProfile} className="panel space-y-4 p-6">
            <h3 className="font-bold text-ink">اطلاعات</h3>
            <div>
              <label className="label">ایمیل</label>
              <input className="input bg-surface-muted" value={user?.email || ''} disabled />
            </div>
            <div>
              <label className="label">نام کامل</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="label">وضعیت / استاتوس</label>
              <input
                className="input"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                placeholder="مثلاً در جلسه هستم / مشغول توسعه"
                maxLength={200}
              />
            </div>
            <button className="btn-primary" disabled={busy}>
              ذخیره پروفایل
            </button>
          </form>

          <form onSubmit={changePassword} className="panel space-y-4 p-6">
            <h3 className="font-bold text-ink">تغییر رمز عبور</h3>
            <div>
              <label className="label">رمز فعلی</label>
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">رمز جدید</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button className="btn-primary" disabled={busy}>
              تغییر رمز
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
