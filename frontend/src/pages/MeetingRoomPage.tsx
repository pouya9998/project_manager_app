import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useRoomContext,
  useLocalParticipant,
  VideoTrack,
  isTrackReference,
} from '@livekit/components-react';
import { Track, RoomEvent } from 'livekit-client';
import '@livekit/components-styles';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type JoinPayload = {
  token: string;
  url: string;
  roomName: string;
  meetingId: number;
  isHost: boolean;
  title: string;
};

const REACTION_EMOJIS = ['👍', '👏', '❤️', '😂', '🎉', '👋', '🔥', '✅'];

type FloatingEmoji = { id: number; emoji: string; name: string };

function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function AloneHomeArt() {
  return (
    <svg
      className="meet-alone-art"
      viewBox="0 0 240 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ellipse cx="120" cy="148" rx="78" ry="8" fill="#1e293b" opacity="0.7" />
      <path
        d="M48 108V62l72-36 72 36v46H48Z"
        fill="#334155"
        stroke="#64748b"
        strokeWidth="2"
      />
      <path d="M70 108V78h40v30H70Z" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M130 108V72h42v36h-42Z" fill="#1e3a5f" stroke="#64748b" strokeWidth="1.5" />
      <circle cx="162" cy="90" r="4" fill="#38bdf8" opacity="0.85" />
      <rect x="84" y="92" width="12" height="16" rx="2" fill="#475569" />
      <path d="M120 26l78 40H42l78-40Z" fill="#475569" stroke="#94a3b8" strokeWidth="2" />
      <rect x="108" y="48" width="24" height="14" rx="2" fill="#0ea5e9" opacity="0.55" />
      <circle cx="188" cy="52" r="14" fill="#fbbf24" opacity="0.35" />
      <path
        d="M52 118c8-18 22-28 40-28s32 10 40 28"
        stroke="#64748b"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <g transform="translate(168 100)">
        <ellipse cx="18" cy="28" rx="16" ry="5" fill="#1e293b" />
        <path
          d="M6 26c0-10 5-18 12-18s12 8 12 18v2H6v-2Z"
          fill="#f8fafc"
          stroke="#94a3b8"
          strokeWidth="1.2"
        />
        <path d="M10 12c2-8 8-12 14-10" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        <path d="M16 8c1-5 4-8 8-7" stroke="#fcd34d" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function RoomInner({
  title,
  meetingId,
  onLeave,
}: {
  title: string;
  meetingId: number;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [elapsed, setElapsed] = useState(0);
  const [sidebar, setSidebar] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [remoteCount, setRemoteCount] = useState(() => room.remoteParticipants.size);
  const emojiId = useRef(0);
  const alone = remoteCount === 0;

  useEffect(() => {
    const sync = () => setRemoteCount(room.remoteParticipants.size);
    sync();
    room.on(RoomEvent.ParticipantConnected, sync);
    room.on(RoomEvent.ParticipantDisconnected, sync);
    return () => {
      room.off(RoomEvent.ParticipantConnected, sync);
      room.off(RoomEvent.ParticipantDisconnected, sync);
    };
  }, [room]);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const participants = useMemo(() => {
    const map = new Map<string, { identity: string; name: string }>();
    for (const p of room.remoteParticipants.values()) {
      map.set(p.identity, { identity: p.identity, name: p.name || p.identity });
    }
    if (localParticipant) {
      map.set(localParticipant.identity, {
        identity: localParticipant.identity,
        name: localParticipant.name || 'شما',
      });
    }
    return [...map.values()];
  }, [room.remoteParticipants, localParticipant, tracks]);

  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pushEmoji = useCallback((emoji: string, name: string) => {
    const id = ++emojiId.current;
    setFloating((prev) => [...prev, { id, emoji, name }]);
    window.setTimeout(() => {
      setFloating((prev) => prev.filter((x) => x.id !== id));
    }, 2400);
  }, []);

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: { identity: string; name?: string },
    ) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg?.type === 'emoji' && msg.emoji) {
          pushEmoji(msg.emoji, participant?.name || participant?.identity || 'کاربر');
        }
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, pushEmoji]);

  async function toggleMic() {
    const next = !micOn;
    await localParticipant?.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const next = !camOn;
    await localParticipant?.setCameraEnabled(next);
    setCamOn(next);
  }

  async function toggleShare() {
    const next = !sharing;
    await localParticipant?.setScreenShareEnabled(next);
    setSharing(next);
  }

  async function sendEmoji(emoji: string) {
    const data = new TextEncoder().encode(JSON.stringify({ type: 'emoji', emoji }));
    await localParticipant?.publishData(data, { reliable: true, destinationIdentities: [] });
    pushEmoji(emoji, 'شما');
    setShowEmoji(false);
  }

  const screenTracks = tracks.filter(
    (t) => isTrackReference(t) && t.source === Track.Source.ScreenShare,
  );
  // Include placeholders so local tile still shows when cam is off / not yet published
  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);

  return (
    <div className="meet-room">
      <header className="meet-topbar">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-white">{title}</div>
          <div className="text-[11px] text-white/60">
            {formatElapsed(elapsed)} · {participants.length} نفر · #{meetingId}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="meet-icon-btn" onClick={() => setSidebar((v) => !v)}>
            افراد
          </button>
          <Link to={`/meetings/${meetingId}`} className="meet-icon-btn">
            جزئیات
          </Link>
        </div>
      </header>

      <div className={`meet-body ${sidebar ? 'with-side' : ''}`}>
        <div className="meet-stage">
          {screenTracks.length > 0 && (
            <div className="meet-screenshare">
              {screenTracks.map((t) =>
                isTrackReference(t) ? (
                  <VideoTrack key={t.publication.trackSid} trackRef={t} className="meet-video" />
                ) : null,
              )}
            </div>
          )}

          {alone && (
            <div className="meet-alone">
              <AloneHomeArt />
              <div className="meet-alone-title">فقط شما اینجا هستید</div>
              <div className="meet-alone-sub">لینک جلسه را با دیگران به اشتراک بگذارید تا بپیوندند</div>
            </div>
          )}

          <div
            className={`meet-grid count-${Math.min(cameraTracks.length || 1, 6)}${
              alone ? ' meet-grid-alone' : ''
            }`}
          >
            {cameraTracks.map((t) => {
              if (!isTrackReference(t)) {
                return (
                  <div key={String(t.participant.identity)} className="meet-tile placeholder">
                    <div className="meet-avatar-letter">
                      {(t.participant.name || t.participant.identity || '?').slice(0, 1)}
                    </div>
                    <div className="meet-tile-name">{t.participant.name || t.participant.identity}</div>
                  </div>
                );
              }
              const hasVideo = t.publication?.track && !t.publication.isMuted;
              return (
                <div key={t.publication.trackSid} className="meet-tile">
                  {hasVideo ? (
                    <VideoTrack trackRef={t} className="meet-video" />
                  ) : (
                    <div className="meet-avatar-letter">
                      {(t.participant.name || t.participant.identity || '?').slice(0, 1)}
                    </div>
                  )}
                  <div className="meet-tile-name">{t.participant.name || t.participant.identity}</div>
                </div>
              );
            })}
          </div>

          <div className="meet-floating-emojis">
            {floating.map((f) => (
              <div key={f.id} className="meet-float-emoji">
                <span>{f.emoji}</span>
                <span className="meet-float-name">{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        {sidebar && (
          <aside className="meet-sidebar">
            <div className="mb-2 text-xs font-bold text-white/80">شرکت‌کنندگان ({participants.length})</div>
            <ul className="space-y-1">
              {participants.map((p) => (
                <li key={p.identity} className="rounded-lg bg-white/5 px-2 py-1.5 text-sm text-white/90">
                  {p.name}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      <footer className="meet-controls">
        {showEmoji && (
          <div className="meet-emoji-bar">
            {REACTION_EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => sendEmoji(e)} title={e}>
                {e}
              </button>
            ))}
          </div>
        )}
        <div className="meet-controls-row">
          <button
            type="button"
            className={`meet-ctrl ${micOn ? '' : 'off'}`}
            onClick={toggleMic}
            title={micOn ? 'قطع میکروفون' : 'روشن کردن میکروفون'}
            aria-label={micOn ? 'قطع میکروفون' : 'روشن کردن میکروفون'}
          >
            <span aria-hidden>{micOn ? '🎤' : '🔇'}</span>
          </button>
          <button
            type="button"
            className={`meet-ctrl ${camOn ? '' : 'off'}`}
            onClick={toggleCam}
            title={camOn ? 'خاموش کردن دوربین' : 'روشن کردن دوربین'}
            aria-label={camOn ? 'خاموش کردن دوربین' : 'روشن کردن دوربین'}
          >
            <span aria-hidden>{camOn ? '📷' : '🚫'}</span>
          </button>
          <button
            type="button"
            className={`meet-ctrl ${sharing ? 'active' : ''}`}
            onClick={toggleShare}
            title={sharing ? 'توقف اشتراک صفحه' : 'اشتراک صفحه'}
            aria-label={sharing ? 'توقف اشتراک صفحه' : 'اشتراک صفحه'}
          >
            <span aria-hidden>🖥️</span>
          </button>
          <button
            type="button"
            className={`meet-ctrl ${showEmoji ? 'active' : ''}`}
            onClick={() => setShowEmoji((v) => !v)}
            title="ایموجی"
            aria-label="ایموجی"
          >
            <span aria-hidden>😊</span>
          </button>
          <button
            type="button"
            className="meet-ctrl leave"
            onClick={onLeave}
            title="خروج از جلسه"
            aria-label="خروج از جلسه"
          >
            <span aria-hidden>📞</span>
          </button>
        </div>
      </footer>
      <RoomAudioRenderer />
    </div>
  );
}

export default function MeetingRoomPage() {
  const { id } = useParams();
  const meetingId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [join, setJoin] = useState<JoinPayload | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(true);
  const leftRef = useRef(false);
  const intentionalLeave = useRef(false);

  useEffect(() => {
    if (!meetingId || !user) return;
    let cancelled = false;
    leftRef.current = false;
    intentionalLeave.current = false;
    (async () => {
      try {
        const payload = await api<JoinPayload>(`/meetings/${meetingId}/join-token`, {
          method: 'POST',
          body: {} as any,
        });
        if (!cancelled) {
          setJoin(payload);
          setError('');
          setConnecting(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'ورود به جلسه ممکن نشد');
          setConnecting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId, user?.id]);

  async function flushLeave() {
    if (leftRef.current || !meetingId) return;
    leftRef.current = true;
    try {
      await api(`/meetings/${meetingId}/leave`, { method: 'POST', body: {} as any });
    } catch {
      /* ignore */
    }
  }

  // Only flush on tab close — NOT on React StrictMode remount cleanup
  useEffect(() => {
    const onUnload = () => {
      if (leftRef.current || !meetingId) return;
      leftRef.current = true;
      const token = localStorage.getItem('pmo_token');
      if (!token) return;
      fetch(`/api/meetings/${meetingId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [meetingId]);

  async function leave() {
    intentionalLeave.current = true;
    await flushLeave();
    navigate(`/meetings/${meetingId}`);
  }

  if (connecting) {
    return (
      <div className="meet-boot">
        <div className="text-sm text-white/80">در حال اتصال به اتاق جلسه...</div>
      </div>
    );
  }

  if (error && !join) {
    return (
      <div className="meet-boot">
        <div className="max-w-md space-y-3 text-center">
          <div className="text-sm text-rose-300">{error}</div>
          <Link to={meetingId ? `/meetings/${meetingId}` : '/meetings'} className="btn-primary inline-flex">
            بازگشت
          </Link>
        </div>
      </div>
    );
  }

  if (!join) {
    return (
      <div className="meet-boot">
        <div className="text-sm text-rose-300">ورود به جلسه ممکن نشد</div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={join.token}
      serverUrl={join.url}
      connect
      video
      audio
      className="meet-lk-root"
      options={{
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          videoCodec: 'vp8',
          simulcast: false,
        },
        // Help ICE succeed on local Docker / Firefox
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
          iceTransportPolicy: 'all',
        },
      }}
      onConnected={() => setError('')}
      onDisconnected={() => {
        // Ignore StrictMode remount disconnects; only leave when user asked
        if (!intentionalLeave.current) return;
        flushLeave().finally(() => navigate(`/meetings/${meetingId}`));
      }}
      onError={(e) => {
        const msg = e?.message || String(e);
        // LiveKit emits this on intentional/StrictMode teardown — not a real failure
        if (/client initiated disconnect/i.test(msg)) return;
        if (/connectionError/i.test(msg) && intentionalLeave.current) return;
        setError(msg);
      }}
    >
      {error && (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-xl bg-rose-600/90 px-3 py-2 text-xs text-white">
          {error}
        </div>
      )}
      <RoomInner title={join.title} meetingId={meetingId} onLeave={leave} />
    </LiveKitRoom>
  );
}
