import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function PositionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setItems(await api('/positions'));
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function startEdit(p: any) {
    setEditId(p.id);
    setTitle(p.title);
    setDescription(p.description || '');
    setError('');
  }

  function cancelEdit() {
    setEditId(null);
    setTitle('');
    setDescription('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        await api(`/positions/${editId}`, {
          method: 'PATCH',
          body: { title, description } as any,
        });
        cancelEdit();
      } else {
        await api('/positions', {
          method: 'POST',
          body: { title, description } as any,
        });
        setTitle('');
        setDescription('');
      }
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function remove(id: number) {
    if (!confirm('حذف این سمت؟')) return;
    await api(`/positions/${id}`, { method: 'DELETE' });
    if (editId === id) cancelEdit();
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">سمت‌های شغلی</h2>
        <p className="mt-1 text-sm text-ink-mute">افزودن و ویرایش جایگاه‌های سازمانی</p>
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2">
        <div className="md:col-span-2 text-sm font-semibold text-ink">
          {editId ? `ویرایش سمت #${editId}` : 'افزودن سمت جدید'}
        </div>
        <div>
          <label className="label">عنوان سمت</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label">توضیحات</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {error && (
          <div className="md:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">{editId ? 'ذخیره تغییرات' : 'افزودن'}</button>
          {editId && (
            <button type="button" className="btn-ghost" onClick={cancelEdit}>
              انصراف
            </button>
          )}
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p) => (
          <div key={p.id} className="panel flex items-start justify-between gap-3 p-5">
            <div>
              <div className="font-bold text-ink">{p.title}</div>
              <div className="mt-1 text-sm text-ink-mute">{p.description || '—'}</div>
              <div className="mt-2 text-xs text-ink-faint">{p._count?.users || 0} کاربر</div>
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => startEdit(p)}>
                ویرایش
              </button>
              <button type="button" className="btn-danger py-1.5 text-xs" onClick={() => remove(p.id)}>
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
