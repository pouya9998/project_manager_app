import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CompleteSoftwareTaskModal from '../components/CompleteSoftwareTaskModal';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { taskStatusColor, taskStatusLabel, taskStatuses } from '../lib/labels';

type Task = {
  id: number;
  title: string;
  status: string;
  priority: number;
  stepId?: number | null;
  step?: { id: number; title: string; color: string } | null;
  project?: { id: number; name: string; type?: string; steps?: Step[] } | null;
  assignees: { user: { id: number; fullName: string } }[];
  dueDate?: string | null;
};

type Step = { id: number; title: string; color: string; sortOrder: number };
type User = { id: number; fullName: string; role: string };
type Project = {
  id: number;
  name: string;
  isActive: boolean;
  type?: string;
  gitlabProjectId?: number;
  steps?: Step[];
};

type BoardColumn = {
  key: string;
  title: string;
  color?: string;
  statusClass?: string;
  count: number;
  tasks: Task[];
  kind: 'status' | 'step';
  status?: string;
  stepId?: number;
};

const defaultColumns = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

const priorityMeta: Record<number, { label: string; className: string }> = {
  1: { label: 'بالا', className: 'prio-high' },
  2: { label: 'متوسط', className: 'prio-mid' },
  3: { label: 'پایین', className: 'prio-low' },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).slice(0, 2);
}

function useIsTouchBoard() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 767px)');
    const apply = () => setTouch(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);
  return touch;
}

export default function BoardPage() {
  const { isAdmin } = useAuth();
  const isTouch = useIsTouchBoard();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [gitlabProjects, setGitlabProjects] = useState<any[]>([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCol, setActiveCol] = useState(0);
  const [form, setForm] = useState({
    title: '',
    description: '',
    projectId: '',
    gitlabProjectId: '',
    assigneeIds: [] as number[],
    priority: '2',
    dueDate: '',
  });
  const [files, setFiles] = useState<FileList | null>(null);
  const [completeTarget, setCompleteTarget] = useState<Task | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => String(p.id) === filterProjectId),
    [projects, filterProjectId],
  );
  const customSteps = selectedProject?.steps?.length ? selectedProject.steps : null;

  async function load() {
    setLoading(true);
    try {
      const qs = filterProjectId ? `?projectId=${filterProjectId}` : '';
      const [t, u, p] = await Promise.all([
        api<Task[]>(`/tasks${qs}`),
        api<User[]>('/users'),
        api<Project[]>('/projects'),
      ]);
      setTasks(t);
      setUsers(u);
      setProjects(p.filter((x) => x.isActive !== false));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => {
      console.error(e);
      setLoading(false);
    });
  }, [isAdmin, filterProjectId]);

  const grouped = useMemo(() => {
    if (customSteps) {
      const map: Record<string, Task[]> = {};
      customSteps.forEach((s) => {
        map[String(s.id)] = [];
      });
      map.none = [];
      tasks.forEach((t) => {
        const key = t.stepId ? String(t.stepId) : 'none';
        if (!map[key]) map[key] = [];
        map[key].push(t);
      });
      return map;
    }
    const map: Record<string, Task[]> = {};
    defaultColumns.forEach((c) => (map[c] = []));
    tasks.forEach((t) => {
      if (!map[t.status]) map[t.status] = [];
      map[t.status].push(t);
    });
    return map;
  }, [tasks, customSteps]);

  const columns: BoardColumn[] = useMemo(() => {
    const cols: BoardColumn[] = customSteps
      ? customSteps.map((step) => ({
          key: String(step.id),
          title: step.title,
          color: step.color,
          count: grouped[String(step.id)]?.length || 0,
          tasks: grouped[String(step.id)] || [],
          kind: 'step',
          stepId: step.id,
        }))
      : defaultColumns.map((status) => ({
          key: status,
          title: taskStatusLabel[status],
          statusClass: taskStatusColor[status],
          count: grouped[status]?.length || 0,
          tasks: grouped[status] || [],
          kind: 'status',
          status,
        }));

    if (customSteps && (grouped.none || []).length > 0) {
      cols.push({
        key: 'none',
        title: 'بدون مرحله',
        statusClass: 'bg-surface-soft text-ink-soft',
        count: grouped.none.length,
        tasks: grouped.none,
        kind: 'step',
      });
    }
    return cols;
  }, [customSteps, grouped]);

  useEffect(() => {
    setActiveCol(0);
  }, [filterProjectId, customSteps?.length, columns.length]);

  useEffect(() => {
    if (!isTouch || !scrollerRef.current) return;
    const el = scrollerRef.current.children[activeCol] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCol, isTouch, columns.length]);

  function isSoftwareTask(taskId: number) {
    const t = tasks.find((x) => x.id === taskId);
    if (t?.project?.type === 'SOFTWARE') return true;
    const p = projects.find((x) => x.id === t?.project?.id);
    return p?.type === 'SOFTWARE';
  }

  async function moveStatus(taskId: number, status: string) {
    if (status === 'DONE' && isSoftwareTask(taskId)) {
      const t = tasks.find((x) => x.id === taskId);
      if (t) setCompleteTarget(t);
      return;
    }
    try {
      const updated = await api<Task>(`/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: { status } as any,
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function moveStep(taskId: number, stepId: number) {
    const updated = await api<Task>(`/tasks/${taskId}/step`, {
      method: 'PATCH',
      body: { stepId } as any,
    });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
  }

  async function loadGitlab() {
    try {
      const list = await api<any[]>('/gitlab/projects');
      setGitlabProjects(list);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createTask(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      let projectId = form.projectId;

      // HTML "required" on the PMO project select used to block submit when only
      // a GitLab repo was chosen (it clears projectId). Resolve GitLab → PMO project here.
      if (isAdmin && form.gitlabProjectId && !projectId) {
        const gitlabId = Number(form.gitlabProjectId);
        const existing = projects.find((p) => p.gitlabProjectId === gitlabId);
        if (existing) {
          projectId = String(existing.id);
        } else {
          const created = await api<Project>('/projects', {
            method: 'POST',
            body: {
              type: 'SOFTWARE',
              gitlabProjectId: gitlabId,
            } as any,
          });
          projectId = String(created.id);
          setProjects((p) => [created, ...p]);
        }
      }

      if (!projectId) {
        setError(
          isAdmin
            ? 'یک پروژه داخلی یا یک مخزن گیت‌لب را انتخاب کنید'
            : 'انتخاب پروژه الزامی است',
        );
        return;
      }

      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('priority', form.priority);
      fd.append('status', 'TODO');
      fd.append('projectId', projectId);
      if (form.dueDate) fd.append('dueDate', new Date(form.dueDate).toISOString());
      fd.append('assigneeIds', JSON.stringify(form.assigneeIds));
      if (files) Array.from(files).forEach((f) => fd.append('files', f));

      await api('/tasks', { method: 'POST', formData: fd });
      setShowForm(false);
      setForm({
        title: '',
        description: '',
        projectId: filterProjectId || '',
        gitlabProjectId: '',
        assigneeIds: [],
        priority: '2',
        dueDate: '',
      });
      setFiles(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const hasNoProjects = !loading && projects.length === 0;
  const boardEmpty = !loading && tasks.length === 0;
  const current = columns[activeCol] || columns[0];

  return (
    <div className="board-page space-y-4">
      <header className="board-toolbar">
        <div className="min-w-0">
          <h2 className="page-title">تابلو وظایف</h2>
          <p className="page-sub">
            {isTouch
              ? 'ستون را عوض کنید و با منوی کارت، وضعیت را جابه‌جا کنید'
              : selectedProject
                ? `مراحل پروژه «${selectedProject.name}»`
                : 'برای مراحل سفارشی، یک پروژه را فیلتر کنید'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <select
            className="input board-filter"
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
          >
            <option value="">همه پروژه‌ها</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.steps?.length ? ` · ${p.steps.length} مرحله` : ''}
              </option>
            ))}
          </select>
          <button
            className="btn-primary w-full sm:w-auto"
            onClick={() => {
              setShowForm((v) => !v);
              setForm((f) => ({ ...f, projectId: filterProjectId || f.projectId }));
              if (isAdmin) loadGitlab();
            }}
          >
            {showForm ? 'بستن' : 'وظیفه جدید'}
          </button>
        </div>
      </header>

      {showForm && (
        <form onSubmit={createTask} className="panel space-y-4 p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">عنوان</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">توضیحات</label>
              <textarea
                className="input min-h-[90px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className={isAdmin ? '' : 'md:col-span-2'}>
              <label className="label">پروژه داخلی *</label>
              <select
                className="input"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value, gitlabProjectId: '' })}
              >
                <option value="">انتخاب پروژه</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.gitlabProjectId ? ' · گیت‌لب' : ''}
                  </option>
                ))}
              </select>
              {isAdmin && (
                <p className="mt-1 text-xs text-ink-mute">
                  اتصال گیت‌لب فقط تنظیمات توکن است؛ وظیفه باید به یک پروژه داخلی وصل شود. اگر هنوز پروژه‌ای نساخته‌اید، از لیست گیت‌لب بسازید.
                </p>
              )}
            </div>
            {isAdmin && (
              <div>
                <label className="label">یا ساخت/انتخاب از گیت‌لب</label>
                <select
                  className="input"
                  value={form.gitlabProjectId}
                  onChange={(e) =>
                    setForm({ ...form, gitlabProjectId: e.target.value, projectId: '' })
                  }
                >
                  <option value="">انتخاب از گیت‌لب</option>
                  {gitlabProjects.map((p) => {
                    const linked = projects.some((x) => x.gitlabProjectId === p.id);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.path_with_namespace || p.name}
                        {linked ? ' (متصل)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <div>
              <label className="label">اولویت</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="1">بالا</option>
                <option value="2">متوسط</option>
                <option value="3">پایین</option>
              </select>
            </div>
            <div>
              <label className="label">مهلت</label>
              <input
                className="input"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">مسئولان</label>
              {users.length === 0 ? (
                <div className="text-sm text-ink-mute">کاربری برای انتخاب نیست</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {users.map((u) => {
                    const active = form.assigneeIds.includes(u.id);
                    return (
                      <button
                        type="button"
                        key={u.id}
                        className={`chip ${active ? 'bg-brand text-white' : 'bg-surface-soft text-ink-soft'}`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            assigneeIds: active
                              ? f.assigneeIds.filter((id) => id !== u.id)
                              : [...f.assigneeIds, u.id],
                          }))
                        }
                      >
                        {u.fullName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="label">پیوست</label>
              <input className="input" type="file" multiple onChange={(e) => setFiles(e.target.files)} />
            </div>
          </div>
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button className="btn-primary w-full sm:w-auto">ثبت وظیفه</button>
        </form>
      )}

      {loading && (
        <div className="board-empty">
          <div className="board-empty-title">در حال بارگذاری تابلو...</div>
        </div>
      )}

      {!loading && hasNoProjects && (
        <div className="board-empty">
          <div className="board-empty-mark" aria-hidden />
          <div className="board-empty-title">هنوز پروژه‌ای نیست</div>
          <p className="board-empty-text">
            اول یک پروژه بسازید؛ بعد می‌توانید روی تابلو وظیفه ثبت کنید.
          </p>
          {isAdmin ? (
            <Link to="/projects" className="btn-primary">
              رفتن به پروژه‌ها
            </Link>
          ) : (
            <p className="text-sm text-ink-mute">از مدیر بخواهید پروژه تعریف کند.</p>
          )}
        </div>
      )}

      {!loading && !hasNoProjects && (
        <>
          {boardEmpty && (
            <div className="board-empty board-empty-soft">
              <div className="board-empty-mark" aria-hidden />
              <div className="board-empty-title">وظیفه‌ای در این تابلو نیست</div>
              <p className="board-empty-text">با دکمه «وظیفه جدید» اولین کار را اضافه کنید.</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowForm(true);
                  setForm((f) => ({ ...f, projectId: filterProjectId || f.projectId }));
                }}
              >
                ایجاد اولین وظیفه
              </button>
            </div>
          )}

          {isTouch && columns.length > 0 && (
            <div className="board-mobile-nav">
              <div className="board-mobile-tabs">
                {columns.map((col, idx) => (
                  <button
                    key={col.key}
                    type="button"
                    className={`board-mobile-tab ${idx === activeCol ? 'active' : ''}`}
                    onClick={() => setActiveCol(idx)}
                  >
                    <span className="truncate">{col.title}</span>
                    <span className="board-mobile-tab-count">{col.count}</span>
                  </button>
                ))}
              </div>
              <div className="board-mobile-pager">
                <button
                  type="button"
                  className="btn-ghost board-pager-btn"
                  disabled={activeCol <= 0}
                  onClick={() => setActiveCol((v) => Math.max(0, v - 1))}
                >
                  قبلی
                </button>
                <span className="board-pager-label">
                  {current?.title} · {activeCol + 1}/{columns.length}
                </span>
                <button
                  type="button"
                  className="btn-ghost board-pager-btn"
                  disabled={activeCol >= columns.length - 1}
                  onClick={() => setActiveCol((v) => Math.min(columns.length - 1, v + 1))}
                >
                  بعدی
                </button>
              </div>
            </div>
          )}

          <div
            ref={scrollerRef}
            className={`board-scroller ${isTouch ? 'is-mobile' : 'is-desktop'}`}
          >
            {columns.map((col, idx) => (
              <section
                key={col.key}
                className={`board-column ${isTouch && idx === activeCol ? 'is-active' : ''} ${
                  isTouch && idx !== activeCol ? 'is-hidden-mobile' : ''
                }`}
                onDragOver={(e) => {
                  if (!isTouch) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (isTouch) return;
                  const id = Number(e.dataTransfer.getData('taskId'));
                  if (!id) return;
                  if (col.kind === 'step' && col.stepId) moveStep(id, col.stepId);
                  else if (col.kind === 'status' && col.status) moveStatus(id, col.status);
                }}
              >
                <div className="board-column-head">
                  {col.color ? (
                    <span className="board-col-chip" style={{ backgroundColor: col.color }}>
                      {col.title}
                    </span>
                  ) : (
                    <span className={`board-col-chip soft ${col.statusClass || ''}`}>{col.title}</span>
                  )}
                  <span className="board-col-count">{col.count}</span>
                </div>

                <div className="board-column-body">
                  {col.tasks.length === 0 ? (
                    <div className="board-col-empty">خالی — وظیفه را از منوی کارت منتقل کنید</div>
                  ) : (
                    col.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        mode={col.kind}
                        steps={customSteps || undefined}
                        enableDrag={!isTouch}
                        onMoveStatus={moveStatus}
                        onMoveStep={moveStep}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {completeTarget && (
        <CompleteSoftwareTaskModal
          taskId={completeTarget.id}
          taskTitle={completeTarget.title}
          open={Boolean(completeTarget)}
          onClose={() => setCompleteTarget(null)}
          onCompleted={() => {
            setCompleteTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  mode,
  steps,
  enableDrag,
  onMoveStatus,
  onMoveStep,
}: {
  task: Task;
  mode: 'status' | 'step';
  steps?: Step[];
  enableDrag: boolean;
  onMoveStatus?: (id: number, status: string) => void;
  onMoveStep?: (id: number, stepId: number) => void;
}) {
  const prio = priorityMeta[task.priority] || priorityMeta[2];

  return (
    <article
      draggable={enableDrag}
      onDragStart={(e) => {
        if (!enableDrag) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('taskId', String(task.id));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`board-card ${enableDrag ? 'can-drag' : 'no-drag'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/tasks/${task.id}`}
          className="board-card-title"
          onClick={(e) => e.stopPropagation()}
        >
          {task.title}
        </Link>
        <span className={`board-prio ${prio.className}`}>{prio.label}</span>
      </div>

      <div className="board-card-meta">{task.project?.name || 'بدون پروژه'}</div>

      <div className="board-card-foot">
        <div className="board-avatars">
          {task.assignees.slice(0, 3).map((a) => (
            <span key={a.user.id} className="board-avatar" title={a.user.fullName}>
              {initials(a.user.fullName)}
            </span>
          ))}
          {task.assignees.length > 3 && (
            <span className="board-avatar more">+{task.assignees.length - 3}</span>
          )}
          {!task.assignees.length && <span className="text-[11px] text-ink-faint">بدون مسئول</span>}
        </div>
      </div>

      {mode === 'status' ? (
        <select
          className="board-move"
          value={task.status}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onMoveStatus?.(task.id, e.target.value)}
          aria-label="تغییر وضعیت"
        >
          {taskStatuses.map((s) => (
            <option key={s} value={s}>
              {taskStatusLabel[s]}
            </option>
          ))}
        </select>
      ) : (
        <select
          className="board-move"
          value={task.stepId || ''}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v) onMoveStep?.(task.id, v);
          }}
          aria-label="تغییر مرحله"
        >
          <option value="">انتقال به مرحله</option>
          {steps?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
