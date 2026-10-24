import { FormEvent, useEffect, useState } from 'react';
import { api, uploadsUrl } from '../lib/api';
import { roleLabel } from '../lib/labels';

const emptyForm = {
  fullName: '',
  email: '',
  password: '',
  role: 'USER',
  jobPositionId: '',
  isActive: true,
};

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [u, p] = await Promise.all([api('/users'), api('/positions')]);
    setUsers(u);
    setPositions(p);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function startEdit(u: any) {
    setEditId(u.id);
    setForm({
      fullName: u.fullName,
      email: u.email,
      password: '',
      role: u.role,
      jobPositionId: u.jobPositionId ? String(u.jobPositionId) : '',
      isActive: u.isActive,
    });
    setError('');
    setMsg('');
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ ...emptyForm });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const body: any = {
        fullName: form.fullName,
        email: form.email,
        role: form.role,
        jobPositionId: form.jobPositionId ? Number(form.jobPositionId) : null,
        isActive: form.isActive,
      };
      if (form.password) body.password = form.password;

      if (editId) {
        await api(`/users/${editId}`, { method: 'PATCH', body });
        setMsg('کاربر به‌روزرسانی شد');
        cancelEdit();
      } else {
        if (!form.password) {
          setError('رمز عبور برای کاربر جدید الزامی است');
          return;
        }
        await api('/users', {
          method: 'POST',
          body: { ...body, password: form.password },
        });
        setForm({ ...emptyForm });
        setMsg('کاربر افزوده شد');
      }
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function deactivate(id: number) {
    if (!confirm('غیرفعال کردن این کاربر؟')) return;
    await api(`/users/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">کاربران</h2>
        <p className="mt-1 text-sm text-ink-mute">افزودن و ویرایش اعضای تیم</p>
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2">
        <div className="md:col-span-2 text-sm font-semibold text-ink">
          {editId ? `ویرایش کاربر #${editId}` : 'افزودن کاربر جدید'}
        </div>
        <div>
          <label className="label">نام کامل</label>
          <input
            className="input"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">ایمیل</label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">{editId ? 'رمز جدید (اختیاری)' : 'رمز عبور'}</label>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required={!editId}
            minLength={editId ? undefined : 4}
          />
        </div>
        <div>
          <label className="label">نقش</label>
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="USER">کاربر</option>
            <option value="ADMIN">مدیر</option>
          </select>
        </div>
        <div>
          <label className="label">سمت شغلی</label>
          <select
            className="input"
            value={form.jobPositionId}
            onChange={(e) => setForm({ ...form, jobPositionId: e.target.value })}
          >
            <option value="">بدون سمت</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        {editId && (
          <div>
            <label className="label">وضعیت حساب</label>
            <select
              className="input"
              value={form.isActive ? '1' : '0'}
              onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}
            >
              <option value="1">فعال</option>
              <option value="0">غیرفعال</option>
            </select>
          </div>
        )}
        {error && (
          <div className="md:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {msg && (
          <div className="md:col-span-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {msg}
          </div>
        )}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className="btn-primary">{editId ? 'ذخیره تغییرات' : 'افزودن کاربر'}</button>
          {editId && (
            <button type="button" className="btn-ghost" onClick={cancelEdit}>
              انصراف
            </button>
          )}
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-mute">
              <th className="px-4 py-3 text-right font-medium">کاربر</th>
              <th className="px-4 py-3 text-right font-medium">ایمیل</th>
              <th className="px-4 py-3 text-right font-medium">نقش</th>
              <th className="px-4 py-3 text-right font-medium">سمت</th>
              <th className="px-4 py-3 text-right font-medium">وضعیت</th>
              <th className="px-4 py-3 text-right font-medium">اقدام</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-surface-muted">
                      {u.avatarFile ? (
                        <img
                          src={uploadsUrl(`avatars/${u.avatarFile}`)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-xs font-bold text-ink-mute">
                          {u.fullName?.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-ink">{u.fullName}</div>
                      {u.statusMessage && (
                        <div className="text-xs text-ink-mute">{u.statusMessage}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{roleLabel[u.role]}</td>
                <td className="px-4 py-3">{u.jobPosition?.title || '—'}</td>
                <td className="px-4 py-3">{u.isActive ? 'فعال' : 'غیرفعال'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="btn-ghost py-1 text-xs" onClick={() => startEdit(u)}>
                      ویرایش
                    </button>
                    {u.isActive && (
                      <button
                        type="button"
                        className="btn-danger py-1 text-xs"
                        onClick={() => deactivate(u.id)}
                      >
                        غیرفعال
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
