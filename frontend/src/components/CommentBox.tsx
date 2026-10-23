import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/labels';
import { useAuth } from '../lib/auth';

type UserOpt = { id: number; fullName: string };
type Comment = {
  id: number;
  content: string;
  createdAt: string;
  user: { id: number; fullName: string };
  mentions?: { user: { id: number; fullName: string } }[];
};

function renderContent(content: string, mentions: { user: { id: number; fullName: string } }[] = []) {
  if (!mentions.length) return content;
  const names = mentions.map((m) => m.user.fullName).sort((a, b) => b.length - a.length);
  const parts: Array<string | React.ReactNode> = [];
  let remaining = content;
  let key = 0;
  while (remaining.length) {
    let hit: { name: string; index: number } | null = null;
    for (const name of names) {
      const token = `@${name}`;
      const idx = remaining.indexOf(token);
      if (idx >= 0 && (hit == null || idx < hit.index)) {
        hit = { name, index: idx };
      }
    }
    if (!hit) {
      parts.push(remaining);
      break;
    }
    if (hit.index > 0) parts.push(remaining.slice(0, hit.index));
    parts.push(
      <span key={key++} className="rounded bg-[color:var(--brand-soft)] px-1 font-semibold text-[color:var(--brand-dark)]">
        @{hit.name}
      </span>,
    );
    remaining = remaining.slice(hit.index + hit.name.length + 1);
  }
  return parts;
}

export default function CommentBox({
  taskId,
  comments,
  onAdded,
}: {
  taskId: number;
  comments: Comment[];
  onAdded: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [content, setContent] = useState('');
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<UserOpt[]>('/users')
      .then((list) => setUsers(list.filter((u) => u.id !== user?.id)))
      .catch(() => undefined);
  }, [user?.id]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !q || u.fullName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [users, query]);

  function onChange(value: string) {
    setContent(value);
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@([^\s@]*)$/);
    if (match) {
      setQuery(match[1] || '');
      setShowSuggest(true);
    } else {
      setShowSuggest(false);
      setQuery('');
    }
  }

  function insertMention(u: UserOpt) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? content.length;
    const before = content.slice(0, caret);
    const after = content.slice(caret);
    const replaced = before.replace(/@([^\s@]*)$/, `@${u.fullName} `);
    setContent(replaced + after);
    setMentionIds((ids) => (ids.includes(u.id) ? ids : [...ids, u.id]));
    setShowSuggest(false);
    setQuery('');
    requestAnimationFrame(() => {
      el?.focus();
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      const mentioned = users
        .filter((u) => content.includes(`@${u.fullName}`))
        .map((u) => u.id);
      await api(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: {
          content: content.trim(),
          mentionIds: [...new Set([...mentionIds, ...mentioned])],
        } as any,
      });
      setContent('');
      setMentionIds([]);
      await onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-5">
      <h3 className="font-bold text-ink">نظرات</h3>
      <div className="mt-3 space-y-3">
        {comments?.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{c.user.fullName}</span>
              {c.mentions?.length ? (
                <span className="text-[11px] text-ink-mute">
                  منشن: {c.mentions.map((m) => m.user.fullName).join('، ')}
                </span>
              ) : null}
            </div>
            <div className="mt-1 whitespace-pre-wrap text-ink-soft">
              {renderContent(c.content, c.mentions)}
            </div>
            <div className="mt-1 text-xs text-ink-faint">{formatDate(c.createdAt)}</div>
          </div>
        ))}
        {!comments?.length && (
          <div className="text-sm text-ink-faint">هنوز نظری ثبت نشده است</div>
        )}
      </div>

      <form onSubmit={submit} className="relative mt-4 space-y-2">
        <textarea
          ref={textareaRef}
          className="input min-h-[90px]"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="نظر بنویسید... برای منشن کردن @ را تایپ کنید"
          required
        />
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute bottom-full z-20 mb-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {suggestions.map((u) => (
              <button
                key={u.id}
                type="button"
                className="block w-full px-3 py-2 text-right text-sm hover:bg-surface-muted"
                onClick={() => insertMention(u)}
              >
                @{u.fullName}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-ink-mute">با @ می‌توانید کاربر را منشن کنید</div>
          <button className="btn-primary" disabled={busy}>
            {busy ? '...' : 'ارسال نظر'}
          </button>
        </div>
      </form>
    </section>
  );
}
