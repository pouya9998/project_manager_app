import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../lib/settings';
import {
  detectInstallPlatform,
  getDeferredInstallPrompt,
  isStandaloneDisplay,
  promptNativeInstall,
  shouldOfferInstall,
  subscribeInstallAvailability,
} from '../lib/pwa-install';

type Variant = 'button' | 'icon' | 'banner';

type Props = {
  variant?: Variant;
  className?: string;
};

export default function PwaInstallButton({ variant = 'button', className = '' }: Props) {
  const { settings } = useSettings();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [platform, setPlatform] = useState(detectInstallPlatform());

  useEffect(() => {
    const sync = () => {
      setAvailable(shouldOfferInstall() && !isStandaloneDisplay());
      setPlatform(detectInstallPlatform());
    };
    sync();
    const unsub = subscribeInstallAvailability(sync);
    const mq = window.matchMedia('(display-mode: standalone)');
    const onMq = () => sync();
    mq.addEventListener?.('change', onMq);
    return () => {
      unsub();
      mq.removeEventListener?.('change', onMq);
    };
  }, []);

  if (!available) return null;

  async function onInstallClick() {
    setHint('');
    const hasNative = Boolean(getDeferredInstallPrompt());
    if (hasNative) {
      setBusy(true);
      try {
        const outcome = await promptNativeInstall();
        if (outcome === 'accepted') {
          setOpen(false);
          setAvailable(false);
        } else if (outcome === 'dismissed') {
          setHint('نصب لغو شد — هر زمان بخواهید می‌توانید دوباره تلاش کنید.');
        } else {
          setOpen(true);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    setOpen(true);
  }

  const label = 'نصب اپلیکیشن';

  return (
    <>
      {variant === 'banner' ? (
        <button
          type="button"
          onClick={onInstallClick}
          disabled={busy}
          className={`flex w-full items-center gap-3 rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3 text-right transition hover:bg-brand/10 ${className}`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
            <InstallIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{label}</span>
            <span className="mt-0.5 block text-xs text-ink-mute">
              دسترسی سریع مثل اپ واقعی — بدون فروشگاه
            </span>
          </span>
          <span className="text-xs font-semibold text-brand">{busy ? '...' : 'نصب'}</span>
        </button>
      ) : variant === 'icon' ? (
        <button
          type="button"
          onClick={onInstallClick}
          disabled={busy}
          className={`grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-muted text-ink hover:bg-brand-soft hover:text-brand ${className}`}
          aria-label={label}
          title={label}
        >
          <InstallIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={onInstallClick}
          disabled={busy}
          className={`btn-ghost flex w-full items-center justify-center gap-2 ${className}`}
        >
          <InstallIcon />
          <span>{busy ? 'در حال نصب...' : label}</span>
        </button>
      )}

      {open && (
        <InstallGuideModal
          appName={settings.appName}
          platform={platform}
          busy={busy}
          hint={hint}
          onClose={() => {
            setOpen(false);
            setHint('');
          }}
          onNative={async () => {
            setBusy(true);
            setHint('');
            try {
              const outcome = await promptNativeInstall();
              if (outcome === 'accepted') {
                setOpen(false);
                setAvailable(false);
              } else if (outcome === 'dismissed') {
                setHint('نصب لغو شد.');
              } else {
                setHint('مرورگر شما نصب مستقیم را پشتیبانی نکرد. از راهنمای زیر استفاده کنید.');
              }
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function InstallIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v10m0 0l3.5-3.5M12 13L8.5 9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5V18a2 2 0 002 2h10a2 2 0 002-2v-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InstallGuideModal({
  appName,
  platform,
  busy,
  hint,
  onClose,
  onNative,
}: {
  appName: string;
  platform: ReturnType<typeof detectInstallPlatform>;
  busy: boolean;
  hint: string;
  onClose: () => void;
  onNative: () => void;
}) {
  const canNative = Boolean(getDeferredInstallPrompt());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel w-full max-w-md space-y-4 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="pwa-install-title" className="text-lg font-bold text-ink">
              نصب {appName}
            </h3>
            <p className="mt-1 text-sm text-ink-mute">
              روی صفحه اصلی گوشی یا دسکتاپ، مثل یک اپلیکیشن باز می‌شود.
            </p>
          </div>
          <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onClose} aria-label="بستن">
            ✕
          </button>
        </div>

        {canNative && (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={onNative}>
            {busy ? 'در حال باز کردن پنجره نصب...' : 'نصب با یک لمس'}
          </button>
        )}

        {platform === 'ios' && <IosSteps />}
        {platform === 'android-other' && <AndroidManualSteps />}
        {platform === 'desktop-other' && !canNative && <DesktopSteps />}
        {platform === 'chromium' && !canNative && <DesktopSteps />}

        {hint && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            {hint}
          </div>
        )}

        <p className="text-xs leading-5 text-ink-faint">
          نکته: در iOS فقط از Safari می‌توانید به Home Screen اضافه کنید. در اندروید Chrome / Edge معمولاً
          دکمه نصب مستقیم را نشان می‌دهند.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-6 text-ink-soft">{children}</span>
    </li>
  );
}

function IosSteps() {
  return (
    <ol className="space-y-3 rounded-2xl border border-line bg-surface-muted p-4">
      <Step n={1}>
        در نوار پایین Safari روی دکمه <strong>Share</strong> (مربع با فلش بالا) بزنید.
      </Step>
      <Step n={2}>
        گزینه <strong>Add to Home Screen</strong> / <strong>افزودن به صفحه اصلی</strong> را انتخاب کنید.
      </Step>
      <Step n={3}>
        روی <strong>Add</strong> تأیید کنید — آیکون اپ روی صفحه اصلی ظاهر می‌شود.
      </Step>
    </ol>
  );
}

function AndroidManualSteps() {
  return (
    <ol className="space-y-3 rounded-2xl border border-line bg-surface-muted p-4">
      <Step n={1}>
        منوی مرورگر (⋮) را باز کنید.
      </Step>
      <Step n={2}>
        <strong>Install app</strong> یا <strong>Add to Home screen</strong> را بزنید.
      </Step>
      <Step n={3}>نصب را تأیید کنید.</Step>
    </ol>
  );
}

function DesktopSteps() {
  return (
    <ol className="space-y-3 rounded-2xl border border-line bg-surface-muted p-4">
      <Step n={1}>
        در نوار آدرس Chrome/Edge، آیکون <strong>نصب</strong> (مانیتور با فلش) را بزنید.
      </Step>
      <Step n={2}>
        یا از منوی ⋮ → <strong>Install / نصب برنامه</strong> استفاده کنید.
      </Step>
    </ol>
  );
}
