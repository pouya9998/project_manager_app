import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildBars(seed: number, count = 28) {
  const bars: number[] = [];
  let x = seed || 1;
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const n = 0.28 + (x % 1000) / 1000 * 0.72;
    bars.push(n);
  }
  return bars;
}

export default function VoicePlayer({
  src,
  durationSec,
  mine,
  messageId,
}: {
  src: string;
  durationSec?: number | null;
  mine?: boolean;
  messageId: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(durationSec || 0);
  const bars = useMemo(() => buildBars(messageId), [messageId]);

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onMeta = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setTotal(audio.duration);
      }
    };
    const onTime = () => {
      setCurrent(audio.currentTime);
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrent(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audioRef.current = null;
    };
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seek(e: MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // RTL: progress grows from right
    const ratio = Math.min(1, Math.max(0, (rect.right - e.clientX) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
    setCurrent(audio.currentTime);
  }

  const shown = playing || current > 0 ? current : total || durationSec || 0;

  return (
    <div className={`tg-voice ${mine ? 'mine' : 'theirs'}`}>
      <button type="button" className="tg-voice-play" onClick={toggle} aria-label={playing ? 'توقف' : 'پخش'}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M8 5.5v13l11-6.5L8 5.5z" />
          </svg>
        )}
      </button>

      <div className="tg-voice-body">
        <div className="tg-voice-wave" onClick={seek} role="slider" aria-valuenow={Math.round(progress * 100)}>
          {bars.map((h, i) => {
            const filled = i / bars.length <= progress;
            return (
              <span
                key={i}
                className={`tg-voice-bar ${filled ? 'filled' : ''} ${playing ? 'pulse' : ''}`}
                style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 30}ms` }}
              />
            );
          })}
        </div>
        <div className="tg-voice-meta">
          <span>{formatDuration(shown)}</span>
        </div>
      </div>
    </div>
  );
}
