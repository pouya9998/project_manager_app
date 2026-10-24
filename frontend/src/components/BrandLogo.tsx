import { uploadsUrl } from '../lib/api';
import { useSettings } from '../lib/settings';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizes = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-lg',
  lg: 'h-16 w-16 text-2xl',
};

export default function BrandLogo({ size = 'md', className = '' }: Props) {
  const { settings } = useSettings();
  const box = sizes[size];
  const letter = (settings.appName || 'پ').trim().charAt(0);

  if (settings.logoFile) {
    return (
      <img
        src={uploadsUrl(`branding/${settings.logoFile}`)}
        alt={settings.appName}
        className={`${box} rounded-xl object-contain bg-surface ${className}`}
      />
    );
  }

  return (
    <div
      className={`${box} grid place-items-center rounded-xl font-bold text-white ${className}`}
      style={{ backgroundColor: 'var(--brand)' }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
