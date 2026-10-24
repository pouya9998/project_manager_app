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

/** Jira-like link types (from current task → other task) */
export const taskLinkTypeLabel: Record<string, string> = {
  BLOCKS: 'مسدود می‌کند',
  BLOCKED_BY: 'مسدود شده توسط',
  RELATES_TO: 'مرتبط است با',
  DUPLICATES: 'تکراری از',
  IS_DUPLICATED_BY: 'تکرار شده توسط',
};

export const taskLinkTypes = Object.keys(taskLinkTypeLabel);

/** How the link reads when viewing from the "to" side */
export const taskLinkTypeInverseLabel: Record<string, string> = {
  BLOCKS: 'مسدود شده توسط',
  BLOCKED_BY: 'مسدود می‌کند',
  RELATES_TO: 'مرتبط است با',
  DUPLICATES: 'تکرار شده توسط',
  IS_DUPLICATED_BY: 'تکراری از',
};

const jalaliDateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tehran',
});

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Tehran',
});

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return jalaliDateTime.format(new Date(value));
}

export function formatDateOnly(value?: string | null) {
  if (!value) return '—';
  return jalaliDate.format(new Date(value));
}
