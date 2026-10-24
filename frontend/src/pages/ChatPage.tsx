import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uploadsUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getChatSocket } from '../lib/socket';
import ChatImage from '../components/chat/ChatImage';
import UserAvatar from '../components/chat/UserAvatar';
import VoicePlayer from '../components/chat/VoicePlayer';

type Mention = { type: 'USER' | 'TASK' | 'PROJECT'; refId: number; label: string };

type ChatUser = {
  id: number;
  fullName: string;
  email?: string;
  avatarFile?: string | null;
};

type ChatMessage = {
  id: number;
  roomId?: number;
  type: 'TEXT' | 'VOICE' | 'FILE' | 'IMAGE' | 'POLL' | 'SYSTEM';
  content?: string | null;
  originalName?: string | null;
  storedName?: string | null;
  mimeType?: string | null;
  durationSec?: number | null;
  createdAt: string;
  editedAt?: string | null;
  sender: ChatUser;
  replyTo?: {
    id: number;
    content?: string | null;
    type: string;
    sender: ChatUser;
  } | null;
  mentions?: Mention[];
  receipts?: {
    userId: number;
    deliveredAt?: string | null;
    readAt?: string | null;
    user: ChatUser;
  }[];
  poll?: {
    id: number;
    question: string;
    multipleChoice: boolean;
    options: {
      id: number;
      text: string;
      votes: { userId: number; user: ChatUser }[];
    }[];
  } | null;
  reactions?: { id: number; emoji: string; userId: number; user: ChatUser }[];
};

type Room = {
  id: number;
  type: 'DIRECT' | 'GROUP';
  name?: string | null;
  title: string;
  unread: number;
  lastMessage?: ChatMessage | null;
  members?: { userId: number; role: string; user: ChatUser }[];
  myRole?: string;
};

function roomPeer(room: Room | null | undefined, myId?: number) {
  if (!room || room.type !== 'DIRECT' || !myId) return null;
  return room.members?.find((m) => m.userId !== myId)?.user || null;
}

function replyPreview(msg: ChatMessage) {
  if (msg.type === 'VOICE') return '🎤 پیام صوتی';
  if (msg.type === 'IMAGE') return '🖼 تصویر';
  if (msg.type === 'FILE') return `📎 ${msg.originalName || 'فایل'}`;
  if (msg.type === 'POLL') return `📊 ${msg.poll?.question || msg.content || 'نظرسنجی'}`;
  return msg.content || 'پیام';
}

const EMOJIS = ['😀', '😂', '😍', '👍', '👎', '❤️', '🔥', '🎉', '🙏', '👌', '😅', '🤔', '✅', '❌', '📌', '🚀'];
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function Tick({ mine, message }: { mine: boolean; message: ChatMessage }) {
  if (!mine || message.type === 'SYSTEM') return null;
  const receipts = message.receipts || [];
  const allRead = receipts.length > 0 && receipts.every((r) => r.readAt);
  const anyDelivered = receipts.some((r) => r.deliveredAt);
  if (allRead) {
    return <span className="chat-ticks read" title="خوانده شد">✓✓</span>;
  }
  if (anyDelivered || receipts.length) {
    return <span className="chat-ticks delivered" title="تحویل داده شد">✓✓</span>;
  }
  return <span className="chat-ticks sent" title="ارسال شد">✓</span>;
}

function SeenBy({ message, mine }: { message: ChatMessage; mine: boolean }) {
  if (!mine) return null;
  const readers = (message.receipts || []).filter((r) => r.readAt).map((r) => r.user.fullName);
  if (!readers.length) return null;
  return (
    <div className="mt-1 text-[10px] text-ink-faint">
      دیده شده توسط: {readers.slice(0, 4).join('، ')}
      {readers.length > 4 ? ` و ${readers.length - 4} نفر دیگر` : ''}
    </div>
  );
}

function renderContent(msg: ChatMessage) {
  if (!msg.content) return null;
  const content = msg.content;
  const linked = [...(msg.mentions || [])].sort((a, b) => b.label.length - a.label.length);
  if (!linked.length) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }

  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < content.length) {
    let best: { m: Mention; token: string } | null = null;
    for (const m of linked) {
      const token = `@${m.label}`;
      if (content.startsWith(token, i) && (!best || token.length > best.token.length)) {
        best = { m, token };
      }
    }
    if (best) {
      if (best.m.type === 'TASK') {
        parts.push(
          <Link key={`m-${key++}`} to={`/tasks/${best.m.refId}`} className="chat-mention task">
            #{best.m.refId} {best.m.label}
          </Link>,
        );
      } else if (best.m.type === 'PROJECT') {
        parts.push(
          <Link key={`m-${key++}`} to={`/projects/${best.m.refId}`} className="chat-mention">
            @{best.m.label}
          </Link>,
        );
      } else {
        parts.push(
          <span key={`m-${key++}`} className="chat-mention">
            @{best.m.label}
          </span>,
        );
      }
      i += best.token.length;
      continue;
    }
    let j = i + 1;
    while (j < content.length) {
      let hit = false;
      for (const m of linked) {
        if (content.startsWith(`@${m.label}`, j)) {
          hit = true;
          break;
        }
      }
      if (hit) break;
      j += 1;
    }
    parts.push(content.slice(i, j));
    i = j;
  }

  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}

function TaskMentionCards({ mentions }: { mentions?: Mention[] }) {
  const tasks = (mentions || []).filter((m) => m.type === 'TASK');
  if (!tasks.length) return null;
  return (
    <div className="chat-task-cards">
      {tasks.map((t) => (
        <Link key={`task-card-${t.refId}`} to={`/tasks/${t.refId}`} className="chat-task-card">
          <span className="chat-task-card-id">#{t.refId}</span>
          <span className="chat-task-card-title">{t.label}</span>
          <span className="chat-task-card-go">مشاهده</span>
        </Link>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const { roomId: roomIdParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeRoomId = roomIdParam ? Number(roomIdParam) : null;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionQ, setMentionQ] = useState('');
  const [mentionResults, setMentionResults] = useState<{
    users: any[];
    tasks: any[];
    projects: any[];
  }>({ users: [], tasks: [], projects: [] });
  const [pendingMentions, setPendingMentions] = useState<Mention[]>([]);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [taskPickerQ, setTaskPickerQ] = useState('');
  const [taskPickerResults, setTaskPickerResults] = useState<any[]>([]);
  const [showNew, setShowNew] = useState<'group' | 'dm' | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState(['', '']);
  const [showMembers, setShowMembers] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(!!activeRoomId);
  const [menuMsgId, setMenuMsgId] = useState<number | null>(null);
  const [reactPickerId, setReactPickerId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const attachPanelRef = useRef<HTMLDivElement>(null);
  const attachTriggerRef = useRef<HTMLButtonElement>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAt = useRef(0);
  const typingTimer = useRef<number | null>(null);

  function closeComposerPanels() {
    setShowEmoji(false);
    setShowAttach(false);
    setShowTaskPicker(false);
  }

  function closeMessageOverlays() {
    setMenuMsgId(null);
    setReactPickerId(null);
  }

  useEffect(() => {
    if (
      !showEmoji &&
      !showAttach &&
      !showTaskPicker &&
      menuMsgId == null &&
      reactPickerId == null
    ) {
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeComposerPanels();
      closeMessageOverlays();
    };

    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (showEmoji) {
        if (emojiPanelRef.current?.contains(t) || emojiTriggerRef.current?.contains(t)) {
          /* keep open */
        } else {
          setShowEmoji(false);
        }
      }
      if (showAttach) {
        if (attachPanelRef.current?.contains(t) || attachTriggerRef.current?.contains(t)) {
          /* keep open */
        } else {
          setShowAttach(false);
        }
      }
      if (showTaskPicker) {
        const panel = document.querySelector('.tg-panel.task-picker');
        if (panel && !panel.contains(t)) setShowTaskPicker(false);
      }
    };

    window.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => window.addEventListener('mousedown', onPointer), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [showEmoji, showAttach, showTaskPicker, menuMsgId, reactPickerId]);

  async function loadRooms() {
    const list = await api<Room[]>('/chat/rooms');
    setRooms(list);
  }

  useEffect(() => {
    loadRooms().catch((e) => setError(e.message));
    api('/users')
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMobileShowChat(!!activeRoomId);
    closeComposerPanels();
    closeMessageOverlays();
  }, [activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) {
      setRoom(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api<Room>(`/chat/rooms/${activeRoomId}`);
        const history = await api<ChatMessage[]>(`/chat/rooms/${activeRoomId}/messages`);
        if (cancelled) return;
        setRoom(r);
        setMessages(history);
        const unreadIds = history
          .filter((m) => m.sender.id !== user?.id)
          .map((m) => m.id);
        if (unreadIds.length) {
          await api(`/chat/rooms/${activeRoomId}/read`, {
            method: 'POST',
            body: { messageIds: unreadIds } as any,
          });
        }
        for (const m of history) {
          if (m.sender.id !== user?.id) {
            api(`/chat/messages/${m.id}/delivered`, { method: 'POST', body: {} as any }).catch(
              () => {},
            );
          }
        }
        loadRooms().catch(() => {});
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRoomId, user?.id]);

  useEffect(() => {
    if (!activeRoomId) return;
    const socket = getChatSocket();
    if (!socket) return;

    const onMessage = (msg: ChatMessage) => {
      if (msg.roomId && msg.roomId !== activeRoomId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev.map((m) => (m.id === msg.id ? msg : m))
          : [...prev, msg],
      );
      if (msg.sender?.id !== user?.id) {
        api(`/chat/messages/${msg.id}/delivered`, { method: 'POST', body: {} as any }).catch(() => {});
        api(`/chat/rooms/${activeRoomId}/read`, {
          method: 'POST',
          body: { messageIds: [msg.id] } as any,
        }).catch(() => {});
      }
      loadRooms().catch(() => {});
    };

    const onDeleted = (payload: { roomId: number; messageId: number }) => {
      if (payload.roomId !== activeRoomId) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
      setMenuMsgId((id) => (id === payload.messageId ? null : id));
      setEditingId((id) => (id === payload.messageId ? null : id));
      setReplyTo((r) => (r?.id === payload.messageId ? null : r));
      loadRooms().catch(() => {});
    };

    const onRead = (payload: { userId: number; messageIds: number[] }) => {
      if (payload.userId === user?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (!payload.messageIds?.includes(m.id)) return m;
          const receipts = [...(m.receipts || [])];
          const idx = receipts.findIndex((r) => r.userId === payload.userId);
          if (idx >= 0) {
            receipts[idx] = { ...receipts[idx], readAt: new Date().toISOString() };
          } else {
            receipts.push({
              userId: payload.userId,
              readAt: new Date().toISOString(),
              deliveredAt: new Date().toISOString(),
              user: { id: payload.userId, fullName: 'کاربر' },
            });
          }
          return { ...m, receipts };
        }),
      );
    };

    const onReceipt = (summary: any) => {
      if (!summary?.messageId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === summary.messageId
            ? { ...m, receipts: summary.receipts || m.receipts }
            : m,
        ),
      );
    };

    const onTyping = (p: { roomId: number; userId: number; typing: boolean }) => {
      if (p.roomId !== activeRoomId || p.userId === user?.id) return;
      const name =
        room?.members?.find((m) => m.userId === p.userId)?.user.fullName || 'کسی';
      setTypingUsers((prev) => {
        if (p.typing) return prev.includes(name) ? prev : [...prev, name];
        return prev.filter((n) => n !== name);
      });
    };

    socket.emit('join', { roomId: activeRoomId });
    socket.on('message', onMessage);
    socket.on('message_deleted', onDeleted);
    socket.on('read', onRead);
    socket.on('receipt', onReceipt);
    socket.on('typing', onTyping);

    return () => {
      socket.emit('leave', { roomId: activeRoomId });
      socket.off('message', onMessage);
      socket.off('message_deleted', onDeleted);
      socket.off('read', onRead);
      socket.off('receipt', onReceipt);
      socket.off('typing', onTyping);
    };
  }, [activeRoomId, user?.id, room?.members]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  useEffect(() => {
    if (!showMention) return;
    const t = window.setTimeout(() => {
      api(`/chat/mentions/search?q=${encodeURIComponent(mentionQ)}`)
        .then(setMentionResults)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [mentionQ, showMention]);

  useEffect(() => {
    if (!showTaskPicker) return;
    const t = window.setTimeout(() => {
      api<{ tasks: any[] }>(`/chat/mentions/search?q=${encodeURIComponent(taskPickerQ)}`)
        .then((res) => setTaskPickerResults(res.tasks || []))
        .catch(() => setTaskPickerResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [taskPickerQ, showTaskPicker]);

  function emitTyping(typing: boolean) {
    const socket = getChatSocket();
    if (!socket || !activeRoomId) return;
    socket.emit('typing', { roomId: activeRoomId, typing });
  }

  function onTextChange(value: string) {
    setText(value);
    emitTyping(true);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(false), 1200);

    const at = value.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(value[at - 1] || ''))) {
      const q = value.slice(at + 1);
      // completed mention has a space after the name — keep picker closed
      if (q.length > 0 && !/[\s\n]/.test(q)) {
        setShowMention(true);
        setMentionQ(q);
        return;
      }
    }
    setShowMention(false);
    setMentionQ('');
  }

  function insertMention(m: Mention, display: string, replaceAt = true) {
    let next: string;
    if (replaceAt) {
      const at = text.lastIndexOf('@');
      next = (at >= 0 ? text.slice(0, at) : text) + `@${display} `;
    } else {
      const base = text.trim();
      next = (base ? `${base} ` : '') + `@${display} `;
    }
    setText(next);
    setPendingMentions((prev) => [
      ...prev.filter((x) => !(x.type === m.type && x.refId === m.refId)),
      { ...m, label: display },
    ]);
    setShowMention(false);
    setMentionQ('');
    setMentionResults({ users: [], tasks: [], projects: [] });
    setShowTaskPicker(false);
    setTaskPickerQ('');
    window.requestAnimationFrame(() => {
      const el = composerInputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = next.length;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    });
  }

  function referTask(task: { id: number; title: string }) {
    insertMention({ type: 'TASK', refId: task.id, label: task.title }, task.title, false);
  }

  function focusComposer() {
    window.requestAnimationFrame(() => {
      const el = composerInputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.selectionStart = el.selectionEnd = len;
    });
  }

  async function sendFormData(fd: FormData) {
    if (!activeRoomId) return;
    setBusy(true);
    setError('');
    try {
      const msg = await api<ChatMessage>(`/chat/rooms/${activeRoomId}/messages`, {
        method: 'POST',
        formData: fd,
      });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setText('');
      setReplyTo(null);
      setPendingMentions([]);
      setShowMention(false);
      setMentionQ('');
      setShowEmoji(false);
      setShowPoll(false);
      setPollQ('');
      setPollOpts(['', '']);
      emitTyping(false);
      loadRooms().catch(() => {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendText(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !activeRoomId) return;
    const fd = new FormData();
    fd.append('content', text.trim());
    fd.append('type', 'TEXT');
    if (replyTo) fd.append('replyToId', String(replyTo.id));
    if (pendingMentions.length) fd.append('mentions', JSON.stringify(pendingMentions));
    await sendFormData(fd);
  }

  async function sendPoll() {
    if (!pollQ.trim() || pollOpts.filter((o) => o.trim()).length < 2) {
      setError('سوال و حداقل دو گزینه لازم است');
      return;
    }
    const fd = new FormData();
    fd.append(
      'poll',
      JSON.stringify({
        question: pollQ.trim(),
        options: pollOpts.map((o) => o.trim()).filter(Boolean),
      }),
    );
    await sendFormData(fd);
  }

  async function uploadFile(file: File, type?: string, durationSec?: number) {
    const fd = new FormData();
    fd.append('file', file);
    const inferred =
      type ||
      (file.type.startsWith('image/')
        ? 'IMAGE'
        : file.type.startsWith('audio/')
          ? 'VOICE'
          : undefined);
    if (inferred) fd.append('type', inferred);
    if (durationSec) fd.append('durationSec', String(durationSec));
    if (replyTo) fd.append('replyToId', String(replyTo.id));
    await sendFormData(fd);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      recordStartedAt.current = Date.now();
      mr.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        const durationSec = (Date.now() - recordStartedAt.current) / 1000;
        await uploadFile(file, 'VOICE', durationSec);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setError('دسترسی به میکروفون ممکن نیست');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    try {
      const room = await api('/chat/groups', {
        method: 'POST',
        body: { name: groupName, memberIds: selectedMembers } as any,
      });
      setShowNew(null);
      setGroupName('');
      setSelectedMembers([]);
      await loadRooms();
      navigate(`/chat/${room.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function openDm(userId: number) {
    try {
      const room = await api('/chat/direct', {
        method: 'POST',
        body: { userId } as any,
      });
      setShowNew(null);
      await loadRooms();
      navigate(`/chat/${room.id}`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addMembers() {
    if (!activeRoomId || !addMemberIds.length) return;
    try {
      const r = await api(`/chat/rooms/${activeRoomId}/members`, {
        method: 'POST',
        body: { memberIds: addMemberIds } as any,
      });
      setRoom(r);
      setAddMemberIds([]);
      setShowMembers(false);
      loadRooms().catch(() => {});
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function vote(optionId: number) {
    try {
      const msg = await api<ChatMessage>(`/chat/polls/options/${optionId}/vote`, {
        method: 'POST',
        body: {} as any,
      });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    } catch (err: any) {
      setError(err.message);
    }
  }

  function scrollToMessage(id: number) {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1400);
  }

  function startReply(msg: ChatMessage) {
    setReplyTo(msg);
    setMenuMsgId(null);
    setReactPickerId(null);
    setEditingId(null);
    focusComposer();
  }

  useEffect(() => {
    if (replyTo) focusComposer();
  }, [replyTo?.id]);

  async function toggleReaction(messageId: number, emoji: string) {
    try {
      const updated = await api<ChatMessage>(`/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: { emoji } as any,
      });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setReactPickerId(null);
      setMenuMsgId(null);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function startEdit(msg: ChatMessage) {
    if (msg.type !== 'TEXT' || msg.sender.id !== user?.id) return;
    setEditingId(msg.id);
    setEditText(msg.content || '');
    setMenuMsgId(null);
    setReplyTo(null);
  }

  async function saveEdit(messageId: number) {
    const content = editText.trim();
    if (!content) return;
    try {
      const updated = await api<ChatMessage>(`/chat/messages/${messageId}`, {
        method: 'PATCH',
        body: { content } as any,
      });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingId(null);
      setEditText('');
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function removeMessage(msg: ChatMessage) {
    if (msg.sender.id !== user?.id) return;
    if (!confirm('این پیام حذف شود؟')) return;
    setMenuMsgId(null);
    try {
      await api(`/chat/messages/${msg.id}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (replyTo?.id === msg.id) setReplyTo(null);
      if (editingId === msg.id) setEditingId(null);
      loadRooms().catch(() => {});
    } catch (err: any) {
      setError(err.message);
    }
  }

  const roomTitle = useMemo(() => room?.title || 'گفتگو', [room]);
  const headerPeer = roomPeer(room, user?.id);

  return (
    <div className="chat-shell overflow-hidden">
      <div
        className={`chat-sidebar border-l border-line ${
          mobileShowChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line p-3">
          <h2 className="font-bold text-ink">پیام‌ها</h2>
          <div className="flex gap-1">
            <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setShowNew('dm')}>
              پیام
            </button>
            <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={() => setShowNew('group')}>
              گروه
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rooms.map((r) => {
            const peer = roomPeer(r, user?.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  navigate(`/chat/${r.id}`);
                  setMobileShowChat(true);
                }}
                className={`flex w-full items-start gap-3 border-b border-line/70 px-3 py-3 text-right transition hover:bg-surface-soft ${
                  activeRoomId === r.id ? 'bg-[color:var(--brand-soft)]' : ''
                }`}
              >
                <UserAvatar
                  name={peer?.fullName || r.title}
                  avatarFile={peer?.avatarFile}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-ink">{r.title}</div>
                    {r.unread > 0 && (
                      <span className="rounded-full bg-[color:var(--brand)] px-1.5 text-[10px] font-bold text-white">
                        {r.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-mute">
                    {r.lastMessage
                      ? replyPreview(r.lastMessage)
                      : r.type === 'DIRECT'
                        ? 'شروع گفتگو'
                        : 'گروه'}
                  </div>
                </div>
              </button>
            );
          })}
          {!rooms.length && (
            <div className="p-6 text-center text-sm text-ink-mute">هنوز گفتگویی ندارید</div>
          )}
        </div>
      </div>

      <div className={`chat-main ${mobileShowChat ? 'flex' : 'hidden md:flex'}`}>
        {!activeRoomId ? (
          <div className="grid flex-1 place-items-center text-ink-mute">یک گفتگو را انتخاب کنید</div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost !px-2 md:hidden"
                  onClick={() => {
                    setMobileShowChat(false);
                    navigate('/chat');
                  }}
                >
                  بازگشت
                </button>
                <UserAvatar
                  name={headerPeer?.fullName || roomTitle}
                  avatarFile={headerPeer?.avatarFile}
                  size={40}
                />
                <div className="min-w-0">
                  <div className="truncate font-bold text-ink">{roomTitle}</div>
                  <div className="truncate text-[11px] text-ink-mute">
                    {typingUsers.length
                      ? `${typingUsers.join('، ')} در حال نوشتن...`
                      : room?.type === 'GROUP'
                        ? `${room.members?.length || 0} عضو`
                        : 'پیام خصوصی'}
                  </div>
                </div>
              </div>
              {room?.type === 'GROUP' && (
                <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setShowMembers(true)}>
                  اعضا
                </button>
              )}
            </header>

            <div
              className="chat-messages flex-1 overflow-y-auto px-3 py-4"
              onClick={() => {
                closeMessageOverlays();
                closeComposerPanels();
              }}
            >
              {messages.map((msg, idx) => {
                const mine = msg.sender.id === user?.id;
                if (msg.type === 'SYSTEM') {
                  return (
                    <div key={msg.id} className="my-2 text-center text-xs text-ink-faint">
                      {msg.content}
                    </div>
                  );
                }
                const isMedia = msg.type === 'IMAGE' || msg.type === 'VOICE';
                const isImageFile =
                  msg.type === 'FILE' && !!msg.mimeType?.startsWith('image/') && !!msg.storedName;
                const prev = messages[idx - 1];
                const showAvatar =
                  !mine &&
                  (!prev ||
                    prev.type === 'SYSTEM' ||
                    prev.sender.id !== msg.sender.id);
                const showName = !mine && room?.type === 'GROUP' && showAvatar;
                const isEditing = editingId === msg.id;

                return (
                  <div
                    key={msg.id}
                    ref={(el) => {
                      messageRefs.current[msg.id] = el;
                    }}
                    className={`mb-1.5 flex items-end gap-1.5 ${
                      mine ? 'justify-start' : 'justify-end'
                    } ${highlightId === msg.id ? 'tg-msg-highlight' : ''}`}
                  >
                    {mine && <div className="w-8 shrink-0" />}
                    <div className="relative max-w-[min(82%,440px)]">
                      <div
                        className={`chat-bubble ${mine ? 'mine' : 'theirs'} ${
                          isMedia || isImageFile ? 'media' : ''
                        } ${msg.type === 'IMAGE' || isImageFile ? 'image' : ''} ${
                          msg.type === 'VOICE' ? 'voice' : ''
                        }`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenuMsgId(msg.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {showName && (
                          <div className="mb-1 px-1 text-[11px] font-semibold text-[color:var(--brand-dark)]">
                            {msg.sender.fullName}
                          </div>
                        )}
                        {msg.replyTo && (
                          <button
                            type="button"
                            className="tg-reply-quote"
                            onClick={() => scrollToMessage(msg.replyTo!.id)}
                          >
                            <div className="font-semibold">{msg.replyTo.sender.fullName}</div>
                            <div className="truncate opacity-80">
                              {msg.replyTo.content ||
                                (msg.replyTo.type === 'VOICE'
                                  ? '🎤 پیام صوتی'
                                  : msg.replyTo.type === 'IMAGE'
                                    ? '🖼 تصویر'
                                    : msg.replyTo.type)}
                            </div>
                          </button>
                        )}

                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              className="tg-edit-input"
                              rows={2}
                              value={editText}
                              autoFocus
                              onChange={(e) => setEditText(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn-primary !px-2 !py-1 text-xs"
                                onClick={() => saveEdit(msg.id)}
                              >
                                ذخیره
                              </button>
                              <button
                                type="button"
                                className="btn-ghost !px-2 !py-1 text-xs"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditText('');
                                }}
                              >
                                لغو
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.type === 'TEXT' && renderContent(msg)}
                            <TaskMentionCards mentions={msg.mentions} />
                            {(msg.type === 'IMAGE' || isImageFile) && msg.storedName && (
                              <div className="tg-image-wrap">
                                <ChatImage
                                  src={uploadsUrl(msg.storedName)}
                                  alt={msg.originalName || 'تصویر'}
                                  caption={msg.type === 'IMAGE' ? msg.content : null}
                                />
                                {!msg.content && (
                                  <div className="tg-image-stamp">
                                    {msg.editedAt && <span className="opacity-80">ویرایش‌شده · </span>}
                                    <span>{formatTime(msg.createdAt)}</span>
                                    <Tick mine={mine} message={msg} />
                                  </div>
                                )}
                              </div>
                            )}
                            {msg.type === 'FILE' && !isImageFile && msg.storedName && (
                              <a
                                className="text-sm font-semibold underline"
                                href={uploadsUrl(msg.storedName)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                📎 {msg.originalName || 'فایل'}
                              </a>
                            )}
                            {msg.type === 'VOICE' && msg.storedName && (
                              <VoicePlayer
                                src={uploadsUrl(msg.storedName)}
                                durationSec={msg.durationSec}
                                mine={mine}
                                messageId={msg.id}
                              />
                            )}
                            {msg.type === 'POLL' && msg.poll && (
                              <div className="min-w-[200px] space-y-2">
                                <div className="font-semibold">📊 {msg.poll.question}</div>
                                {msg.poll.options.map((opt) => {
                                  const total =
                                    msg.poll!.options.reduce((s, o) => s + o.votes.length, 0) || 1;
                                  const pct = Math.round((opt.votes.length / total) * 100);
                                  const voted = opt.votes.some((v) => v.userId === user?.id);
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => vote(opt.id)}
                                      className={`relative w-full overflow-hidden rounded-lg border px-2 py-1.5 text-right text-sm ${
                                        voted
                                          ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)]'
                                          : 'border-line bg-surface/60'
                                      }`}
                                    >
                                      <span
                                        className="absolute inset-y-0 right-0 bg-[color:var(--brand)]/15"
                                        style={{ width: `${pct}%` }}
                                      />
                                      <span className="relative flex justify-between gap-2">
                                        <span>{opt.text}</span>
                                        <span className="text-xs text-ink-mute">
                                          {opt.votes.length} · {pct}%
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}

                        {!isEditing && (!(msg.type === 'IMAGE' || isImageFile) || msg.content) && (
                          <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
                            <button
                              type="button"
                              className="text-[10px] text-ink-faint hover:text-ink"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuMsgId((id) => (id === msg.id ? null : msg.id));
                                setReactPickerId(null);
                              }}
                            >
                              ⋯
                            </button>
                            <div className="flex items-center gap-1 text-[10px] text-ink-faint">
                              {msg.editedAt && <span>ویرایش‌شده</span>}
                              <span>{formatTime(msg.createdAt)}</span>
                              <Tick mine={mine} message={msg} />
                            </div>
                          </div>
                        )}

                        {!!msg.reactions?.length && (
                          <div className="tg-reactions">
                            {Object.entries(
                              msg.reactions.reduce(
                                (acc, r) => {
                                  if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
                                  acc[r.emoji].count += 1;
                                  if (r.userId === user?.id) acc[r.emoji].mine = true;
                                  return acc;
                                },
                                {} as Record<string, { count: number; mine: boolean }>,
                              ),
                            ).map(([emoji, info]) => (
                              <button
                                key={emoji}
                                type="button"
                                className={`tg-reaction-pill ${info.mine ? 'mine' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleReaction(msg.id, emoji);
                                }}
                              >
                                <span>{emoji}</span>
                                <span>{info.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <SeenBy mine={mine} message={msg} />
                      </div>

                      {menuMsgId === msg.id && (
                        <div
                          className={`tg-msg-menu ${mine ? 'mine' : 'theirs'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="tg-react-picker">
                            {REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(msg.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => startReply(msg)}>
                            پاسخ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReactPickerId(msg.id);
                              setMenuMsgId(null);
                            }}
                          >
                            واکنش بیشتر
                          </button>
                          {mine && msg.type === 'TEXT' && (
                            <button type="button" onClick={() => startEdit(msg)}>
                              ویرایش
                            </button>
                          )}
                          {mine && (
                            <button type="button" className="danger" onClick={() => removeMessage(msg)}>
                              حذف
                            </button>
                          )}
                        </div>
                      )}

                      {reactPickerId === msg.id && (
                        <div
                          className={`tg-msg-menu ${mine ? 'mine' : 'theirs'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="tg-panel-head px-2">
                            <span className="text-xs font-bold text-ink-soft">واکنش</span>
                            <button
                              type="button"
                              className="tg-panel-close"
                              aria-label="بستن"
                              onClick={() => setReactPickerId(null)}
                            >
                              ✕
                            </button>
                          </div>
                          <div className="tg-react-picker">
                            {EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => toggleReaction(msg.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {!mine ? (
                      showAvatar ? (
                        <UserAvatar
                          name={msg.sender.fullName}
                          avatarFile={msg.sender.avatarFile}
                          size={32}
                        />
                      ) : (
                        <div className="w-8 shrink-0" />
                      )
                    ) : null}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {replyTo && (
              <div className="tg-reply-bar">
                <button
                  type="button"
                  className="tg-reply-bar-body"
                  onClick={() => scrollToMessage(replyTo.id)}
                >
                  <div className="text-[11px] font-bold text-[color:var(--brand-dark)]">
                    پاسخ به {replyTo.sender.fullName}
                  </div>
                  <div className="truncate text-xs text-ink-mute">{replyPreview(replyTo)}</div>
                </button>
                <button type="button" className="tg-reply-bar-close" onClick={() => setReplyTo(null)}>
                  ✕
                </button>
              </div>
            )}

            {error && <div className="bg-rose-50 px-3 py-1 text-xs text-rose-700">{error}</div>}

            <div className="chat-composer relative">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = '';
                  setShowAttach(false);
                }}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f, 'IMAGE');
                  e.target.value = '';
                  setShowAttach(false);
                }}
              />

              {showEmoji && (
                <div ref={emojiPanelRef} className="tg-panel emoji" role="dialog" aria-label="ایموجی">
                  <div className="tg-panel-head">
                    <span>ایموجی</span>
                    <button
                      type="button"
                      className="tg-panel-close"
                      aria-label="بستن"
                      onClick={() => setShowEmoji(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="tg-emoji-grid">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className="tg-emoji-btn"
                        onClick={() => {
                          setText((t) => t + e);
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showAttach && (
                <div ref={attachPanelRef} className="tg-panel attach">
                  <button
                    type="button"
                    className="tg-attach-item"
                    onClick={() => {
                      setShowAttach(false);
                      imageInputRef.current?.click();
                    }}
                  >
                    <span className="tg-attach-ico photo">🖼</span>
                    <span>تصویر / گالری</span>
                  </button>
                  <button
                    type="button"
                    className="tg-attach-item"
                    onClick={() => {
                      setShowAttach(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <span className="tg-attach-ico file">📎</span>
                    <span>فایل</span>
                  </button>
                  <button
                    type="button"
                    className="tg-attach-item"
                    onClick={() => {
                      setShowAttach(false);
                      setShowPoll(true);
                      setShowEmoji(false);
                    }}
                  >
                    <span className="tg-attach-ico poll">📊</span>
                    <span>نظرسنجی</span>
                  </button>
                  <button
                    type="button"
                    className="tg-attach-item"
                    onClick={() => {
                      setShowAttach(false);
                      setShowEmoji(false);
                      setShowMention(false);
                      setShowTaskPicker(true);
                      setTaskPickerQ('');
                    }}
                  >
                    <span className="tg-attach-ico task">✅</span>
                    <span>ارجاع به وظیفه</span>
                  </button>
                </div>
              )}

              {showTaskPicker && (
                <div className="tg-panel mention task-picker" role="dialog" aria-label="ارجاع وظیفه">
                  <div className="tg-panel-head">
                    <span>ارجاع به وظیفه</span>
                    <button
                      type="button"
                      className="tg-panel-close"
                      aria-label="بستن"
                      onClick={() => setShowTaskPicker(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="input mb-2"
                    placeholder="جستجوی عنوان یا شماره وظیفه..."
                    value={taskPickerQ}
                    autoFocus
                    onChange={(e) => setTaskPickerQ(e.target.value)}
                  />
                  <div className="max-h-52 overflow-y-auto">
                    {taskPickerResults.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-ink-mute">
                        وظیفه‌ای پیدا نشد
                      </div>
                    ) : (
                      taskPickerResults.map((t) => (
                        <button
                          key={`pick-t-${t.id}`}
                          type="button"
                          className="tg-mention-item task-pick"
                          onClick={() => referTask(t)}
                        >
                          <span className="chat-task-card-id">#{t.id}</span>
                          <span className="min-w-0 flex-1 text-right">
                            <span className="block truncate font-semibold">{t.title}</span>
                            {t.project?.name && (
                              <span className="block truncate text-[11px] text-ink-mute">
                                {t.project.name}
                              </span>
                            )}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <p className="mt-1 px-1 text-[10px] text-ink-faint">
                    یا در متن پیام با @ عنوان وظیفه را بنویسید
                  </p>
                </div>
              )}

              {showMention && (
                <div className="tg-panel mention">
                  <div className="mb-1 px-1 text-[11px] font-semibold text-ink-mute">منشن</div>
                  {mentionResults.users.map((u) => (
                    <button
                      key={`u-${u.id}`}
                      type="button"
                      className="tg-mention-item"
                      onClick={() =>
                        insertMention(
                          { type: 'USER', refId: u.id, label: u.fullName },
                          u.fullName,
                        )
                      }
                    >
                      👤 {u.fullName}
                    </button>
                  ))}
                  {mentionResults.tasks.map((t) => (
                    <button
                      key={`t-${t.id}`}
                      type="button"
                      className="tg-mention-item task-pick"
                      onClick={() =>
                        insertMention({ type: 'TASK', refId: t.id, label: t.title }, t.title)
                      }
                    >
                      <span className="chat-task-card-id">#{t.id}</span>
                      <span className="min-w-0 flex-1 truncate text-right">
                        وظیفه: {t.title}
                      </span>
                    </button>
                  ))}
                  {mentionResults.projects.map((p) => (
                    <button
                      key={`p-${p.id}`}
                      type="button"
                      className="tg-mention-item"
                      onClick={() =>
                        insertMention({ type: 'PROJECT', refId: p.id, label: p.name }, p.name)
                      }
                    >
                      📁 پروژه: {p.name}
                    </button>
                  ))}
                </div>
              )}

              {!!pendingMentions.filter((m) => m.type === 'TASK').length && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {pendingMentions
                    .filter((m) => m.type === 'TASK')
                    .map((m) => (
                      <span key={`pend-${m.refId}`} className="chat-task-pending">
                        <span className="chat-task-card-id">#{m.refId}</span>
                        <span className="truncate">{m.label}</span>
                        <button
                          type="button"
                          aria-label="حذف ارجاع"
                          onClick={() =>
                            setPendingMentions((prev) =>
                              prev.filter((x) => !(x.type === 'TASK' && x.refId === m.refId)),
                            )
                          }
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              )}

              {showPoll && (
                <div className="mb-2 space-y-2 rounded-2xl border border-line bg-surface-soft p-3">
                  <input
                    className="input"
                    placeholder="سوال نظرسنجی"
                    value={pollQ}
                    onChange={(e) => setPollQ(e.target.value)}
                  />
                  {pollOpts.map((o, i) => (
                    <input
                      key={i}
                      className="input"
                      placeholder={`گزینه ${i + 1}`}
                      value={o}
                      onChange={(e) =>
                        setPollOpts((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                      }
                    />
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => setPollOpts((p) => [...p, ''])}
                    >
                      گزینه بیشتر
                    </button>
                    <button type="button" className="btn-primary text-xs" onClick={sendPoll} disabled={busy}>
                      ارسال نظرسنجی
                    </button>
                    <button type="button" className="btn-ghost text-xs" onClick={() => setShowPoll(false)}>
                      لغو
                    </button>
                  </div>
                </div>
              )}

              {recording ? (
                <div className="tg-record-bar">
                  <button
                    type="button"
                    className="tg-round-btn danger"
                    onClick={() => stopRecording()}
                    aria-label="توقف ضبط"
                  >
                    ■
                  </button>
                  <div className="tg-record-label">
                    <span className="tg-record-dot" />
                    در حال ضبط صدا... روی توقف بزنید
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    setShowEmoji(false);
                    setShowAttach(false);
                    setShowTaskPicker(false);
                    return sendText(e);
                  }}
                  className="tg-composer-row"
                >
                  <button
                    ref={attachTriggerRef}
                    type="button"
                    className={`tg-round-btn attach ${showAttach ? 'active' : ''}`}
                    aria-label="پیوست"
                    aria-expanded={showAttach}
                    onClick={() => {
                      setShowAttach((v) => !v);
                      setShowEmoji(false);
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  <div className="tg-input-shell">
                    <button
                      ref={emojiTriggerRef}
                      type="button"
                      className="tg-emoji-trigger"
                      aria-label="ایموجی"
                      aria-expanded={showEmoji}
                      onClick={() => {
                        setShowEmoji((v) => !v);
                        setShowAttach(false);
                      }}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                        <circle cx="9" cy="10" r="1.1" fill="currentColor" />
                        <circle cx="15" cy="10" r="1.1" fill="currentColor" />
                        <path
                          d="M8.5 14.5c1.2 1.4 2.6 2 3.5 2s2.3-.6 3.5-2"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    <textarea
                      ref={composerInputRef}
                      className="tg-input"
                      rows={1}
                      placeholder="پیام بنویسید..."
                      value={text}
                      onChange={(e) => {
                        onTextChange(e.target.value);
                        const el = e.target;
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (text.trim() && !busy) {
                            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                          }
                        }
                      }}
                    />
                  </div>

                  {text.trim() ? (
                    <button
                      type="submit"
                      className="tg-round-btn send"
                      disabled={busy}
                      aria-label="ارسال"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M3.4 20.6 21 12 3.4 3.4l-.1 6.7L15 12 3.3 13.9l.1 6.7Z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tg-round-btn mic"
                      aria-label="پیام صوتی"
                      onClick={() => {
                        setShowAttach(false);
                        setShowEmoji(false);
                        startRecording();
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect
                          x="9"
                          y="3.5"
                          width="6"
                          height="11"
                          rx="3"
                          stroke="currentColor"
                          strokeWidth="1.9"
                        />
                        <path
                          d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V20"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="panel w-full max-w-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">{showNew === 'group' ? 'گروه جدید' : 'پیام خصوصی'}</h3>
              <button type="button" onClick={() => setShowNew(null)}>
                ✕
              </button>
            </div>
            {showNew === 'group' ? (
              <form onSubmit={createGroup} className="space-y-3">
                <input
                  className="input"
                  placeholder="نام گروه"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                />
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                  {users
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(u.id)}
                          onChange={(e) =>
                            setSelectedMembers((prev) =>
                              e.target.checked
                                ? [...prev, u.id]
                                : prev.filter((id) => id !== u.id),
                            )
                          }
                        />
                        {u.fullName}
                      </label>
                    ))}
                </div>
                <button type="submit" className="btn-primary w-full">
                  ایجاد گروه
                </button>
              </form>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {users
                  .filter((u) => u.id !== user?.id && u.isActive !== false)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="block w-full rounded-lg px-3 py-2 text-right hover:bg-surface-soft"
                      onClick={() => openDm(u.id)}
                    >
                      {u.fullName}
                      <div className="text-xs text-ink-mute">{u.email}</div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showMembers && room && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="panel w-full max-w-md p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">اعضای گروه</h3>
              <button type="button" onClick={() => setShowMembers(false)}>
                ✕
              </button>
            </div>
            <div className="mb-3 space-y-1">
              {room.members?.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <UserAvatar name={m.user.fullName} avatarFile={m.user.avatarFile} size={32} />
                    <span className="truncate">{m.user.fullName}</span>
                  </div>
                  <span className="shrink-0 text-xs text-ink-mute">{m.role}</span>
                </div>
              ))}
            </div>
            {(room.myRole === 'OWNER' || room.myRole === 'ADMIN') && (
              <>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                  {users
                    .filter((u) => !room.members?.some((m) => m.userId === u.id))
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={addMemberIds.includes(u.id)}
                          onChange={(e) =>
                            setAddMemberIds((prev) =>
                              e.target.checked
                                ? [...prev, u.id]
                                : prev.filter((id) => id !== u.id),
                            )
                          }
                        />
                        {u.fullName}
                      </label>
                    ))}
                </div>
                <button type="button" className="btn-primary mt-3 w-full" onClick={addMembers}>
                  افزودن عضو
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
