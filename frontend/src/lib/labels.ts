export const taskStatusLabel: Record<string, string> = {
  BACKLOG: 'بک‌لاگ',
  TODO: 'انجام‌نشده',
  IN_PROGRESS: 'در حال انجام',
  IN_REVIEW: 'در حال بررسی',
  DONE: 'انجام‌شده',
  CANCELLED: 'لغوشده',
};

export const taskStatusColor: Record<string, string> = {
  BACKLOG: 'bg-surface-soft text-ink-soft',
  TODO: 'bg-sky-50 text-sky-800',
  IN_PROGRESS: 'bg-amber-50 text-amber-800',
  IN_REVIEW: 'bg-indigo-50 text-indigo-800',
  DONE: 'bg-brand-soft text-brand-dark',
  CANCELLED: 'bg-rose-50 text-rose-700',
};

export const effortStatusLabel: Record<string, string> = {
  PENDING: 'در انتظار',
  APPROVED: 'تأییدشده',
  ADJUSTED: 'اصلاح‌شده',
  REJECTED: 'ردشده',
};

export const roleLabel: Record<string, string> = {
  ADMIN: 'مدیر',
  USER: 'کاربر',
};

export const taskStatuses = Object.keys(taskStatusLabel);

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDateOnly(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(value));
}
