import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function PositionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  async function load() {
    setItems(await api('/positions'));
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await api('/positions', {
      method: 'POST',
      body: { title, description } as any,
    });
    setTitle('');
    setDescription('');
    await load();
  }

  async function remove(id: number) {
    if (!confirm('حذف این سمت؟')) return;
    await api(`/positions/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">سمت‌های شغلی</h2>
        <p className="mt-1 text-sm text-ink-mute">تعریف جایگاه‌های سازمانی کاربران</p>
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2">
        <div>
          <label className="label">عنوان سمت</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">توضیحات</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button className="btn-primary">افزودن</button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p) => (
          <div key={p.id} className="panel flex items-start justify-between gap-3 p-5">
            <div>
              <div className="font-bold text-ink">{p.title}</div>
              <div className="mt-1 text-sm text-ink-mute">{p.description || '—'}</div>
              <div className="mt-2 text-xs text-ink-faint">{p._count?.users || 0} کاربر</div>
            </div>
            <button className="btn-danger" onClick={() => remove(p.id)}>حذف</button>
          </div>
        ))}
      </div>
    </div>
  );
}
