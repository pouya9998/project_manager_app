import { uploadsUrl } from '../../lib/api';

type Props = {
  name?: string | null;
  avatarFile?: string | null;
  size?: number;
  className?: string;
};

export default function UserAvatar({ name, avatarFile, size = 36, className = '' }: Props) {
  const letter = (name || '?').trim().charAt(0) || '?';
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) };

  if (avatarFile) {
    return (
      <img
        src={uploadsUrl(`avatars/${avatarFile}`)}
        alt={name || ''}
        className={`shrink-0 rounded-full object-cover bg-surface-muted ${className}`}
        style={style}
      />
    );
  }

  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-[color:var(--brand)] font-bold text-white ${className}`}
      style={style}
      aria-hidden
    >
      {letter}
    </div>
  );
}
