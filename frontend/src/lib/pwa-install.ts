/** Chromium deferred install event (kept outside React to survive StrictMode remounts) */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type InstallPlatform = 'chromium' | 'ios' | 'android-other' | 'desktop-other' | 'unsupported';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeInstallAvailability(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
  notify();
}

/** Call once at app bootstrap, before React render */
export function initPwaInstallCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try {
      localStorage.setItem('pmo_pwa_installed', '1');
    } catch {
      /* ignore */
    }
    notify();
  });
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as any).standalone === true;
  const twa = document.referrer.startsWith('android-app://');
  return mq || iosStandalone || twa;
}

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'unsupported';
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);

  if (deferredPrompt) return 'chromium';
  if (isIOS) return 'ios';
  if (isAndroid) return 'android-other';
  if (isSafari) return 'ios';
  return 'desktop-other';
}

export function shouldOfferInstall(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneDisplay()) return false;
  try {
    if (localStorage.getItem('pmo_pwa_installed') === '1' && !deferredPrompt) {
      // Still allow show if not actually standalone (cleared storage edge case)
      if (isStandaloneDisplay()) return false;
    }
  } catch {
    /* ignore */
  }
  // Always offer on mobile; on desktop only when Chromium can install
  const platform = detectInstallPlatform();
  if (platform === 'chromium') return true;
  if (platform === 'ios' || platform === 'android-other') return true;
  // Desktop without prompt: still show so users know how (Chrome menu)
  if (platform === 'desktop-other' && 'serviceWorker' in navigator) return true;
  return false;
}

export async function promptNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const promptEvent = deferredPrompt;
  if (!promptEvent) return 'unavailable';
  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    clearDeferredInstallPrompt();
    if (outcome === 'accepted') {
      try {
        localStorage.setItem('pmo_pwa_installed', '1');
      } catch {
        /* ignore */
      }
    }
    return outcome;
  } catch {
    clearDeferredInstallPrompt();
    return 'unavailable';
  }
}
