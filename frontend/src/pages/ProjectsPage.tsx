import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function ProjectsPage() {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [gitlabProjects, setGitlabProjects] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gitlabProjectId, setGitlabProjectId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setProjects(await api('/projects'));
  }

  useEffect(() => {
    load().catch(console.error);
    if (isAdmin) {
      api('/gitlab/projects')
        .then(setGitlabProjects)
        .catch(() => undefined);
    }
  }, [isAdmin]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/projects', {
        method: 'POST',
        body: {
          name: name || undefined,
          description: description || undefined,
          gitlabProjectId: gitlabProjectId ? Number(gitlabProjectId) : undefined,
        } as any,
      });
      setName('');
      setDescription('');
      setGitlabProjectId('');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="page-title">پروژه‌ها</h2>
        <p className="mt-1 text-sm text-ink-mute">پروژه‌های داخلی متصل به مخزن گیت‌لب</p>
      </div>

      {isAdmin && (
        <form onSubmit={onSubmit} className="panel grid gap-4 p-5 md:grid-cols-2">
          <div>
            <label className="label">نام پروژه</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">پروژه گیت‌لب</label>
            <select
              className="input"
              value={gitlabProjectId}
              onChange={(e) => setGitlabProjectId(e.target.value)}
            >
              <option value="">اختیاری</option>
              {gitlabProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.path_with_namespace || p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">توضیحات</label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && <div className="md:col-span-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary">افزودن پروژه</button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="panel p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-ink">
                <Link to={`/projects/${p.id}`} className="hover:text-brand">
                  {p.name}
                </Link>
              </h3>
              <span className={`chip ${p.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>
                {p.isActive ? 'فعال' : 'غیرفعال'}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{p.description || 'بدون توضیح'}</p>
            <div className="mt-4 space-y-1 text-xs text-ink-mute">
              <div>تعداد وظایف: {p._count?.tasks ?? 0}</div>
              <div>مراحل گردش‌کار: {p.steps?.length || p._count?.steps || 0}</div>
              {p.gitlabPath && (
                <a className="text-brand hover:underline" href={p.gitlabWebUrl} target="_blank" rel="noreferrer">
                  {p.gitlabPath}
                </a>
              )}
            </div>
            <div className="mt-4">
              <Link to={`/projects/${p.id}`} className="btn-primary w-full">
                {isAdmin ? 'مراحل و جزئیات' : 'جزئیات'}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
