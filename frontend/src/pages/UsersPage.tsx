import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { roleLabel } from '../lib/labels';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'USER',
    jobPositionId: '',
  });
  const [error, setError] = useState('');

  async function load() {
    const [u, p] = await Promise.all([api('/users'), api('/positions')]);
    setUsers(u);
    setPositions(p);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/users', {
        method: 'POST',
        body: {
          ...form,
          jobPositionId: form.jobPositionId ? Number(form.jobPositionId) : undefined,
        } as any,
      });
      setForm({ fullName: '', email: '', password: '', role: 'USER', jobPositionId: '' });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">کاربران</h2>
        <p className="mt-1 text-sm text-ink-mute">مدیریت اعضای تیم و سمت شغلی</p>
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2">
        <div>
          <label className="label">نام کامل</label>
          <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        </div>
        <div>
          <label className="label">ایمیل</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <label className="label">رمز عبور</label>
          <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <div>
          <label className="label">نقش</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="USER">کاربر</option>
            <option value="ADMIN">مدیر</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">سمت شغلی</label>
          <select className="input" value={form.jobPositionId} onChange={(e) => setForm({ ...form, jobPositionId: e.target.value })}>
            <option value="">بدون سمت</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        {error && <div className="md:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary">افزودن کاربر</button>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-ink-mute">
              <th className="px-4 py-3 text-right font-medium">نام</th>
              <th className="px-4 py-3 text-right font-medium">ایمیل</th>
              <th className="px-4 py-3 text-right font-medium">نقش</th>
              <th className="px-4 py-3 text-right font-medium">سمت</th>
              <th className="px-4 py-3 text-right font-medium">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line">
                <td className="px-4 py-3 font-medium text-ink">{u.fullName}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{roleLabel[u.role]}</td>
                <td className="px-4 py-3">{u.jobPosition?.title || '—'}</td>
                <td className="px-4 py-3">{u.isActive ? 'فعال' : 'غیرفعال'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
