import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { api, uploadsUrl } from '../lib/api';
import { enablePushNotifications } from '../lib/push';
import BrandLogo from './BrandLogo';

const links = [
  { to: '/', label: 'داشبورد', end: true },
  { to: '/board', label: 'تابلو وظایف' },
  { to: '/chat', label: 'گفتگو' },
  { to: '/projects', label: 'پروژه‌ها' },
  { to: '/efforts', label: 'زمان‌ها' },
];

const mobileLinks = [
  { to: '/', label: 'داشبورد', end: true, icon: 'home' as const },
  { to: '/board', label: 'تابلو', icon: 'board' as const },
  { to: '/chat', label: 'گفتگو', icon: 'chat' as const },
  { to: '/projects', label: 'پروژه', icon: 'project' as const },
  { to: '/efforts', label: 'زمان', icon: 'effort' as const },
];

const adminLinks = [
  { to: '/users', label: 'کاربران' },
  { to: '/positions', label: 'سمت‌ها' },
  { to: '/settings', label: 'تنظیمات' },
  { to: '/gitlab', label: 'گیت‌لب' },
];

function TabIcon({ name, active }: { name: (typeof mobileLinks)[number]['icon']; active: boolean }) {
  const stroke = active ? 'var(--brand-dark)' : 'currentColor';
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case 'board':
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="5.5" height="16" rx="1.2" />
          <rect x="9.25" y="4" width="5.5" height="11" rx="1.2" />
          <rect x="15" y="4" width="5.5" height="14" rx="1.2" />
        </svg>
      );
    case 'chat':
      return (
        <svg {...common}>
          <path d="M5 18.5 6.2 15A7.5 7.5 0 1 1 9 19.2L5 18.5z" />
          <path d="M9 10.5h6M9 13.5h4" />
        </svg>
      );
    case 'project':
      return (
        <svg {...common}>
          <path d="M4 8.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-10z" />
          <path d="M8 8.5V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
        </svg>
      );
    case 'effort':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.5l3 2" />
        </svg>
      );
    default:
      return null;
  }
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-4 w-5" aria-hidden>
      <span
        className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition ${
          open ? 'translate-y-[7px] rotate-45' : ''
        }`}
      />
      <span
        className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition ${
          open ? 'opacity-0' : ''
        }`}
      />
      <span
        className={`absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition ${
          open ? '-translate-y-[7px] -rotate-45' : ''
        }`}
      />
    </span>
  );
}

function SideNav({
  onNavigate,
  showLogout,
}: {
  onNavigate?: () => void;
  showLogout?: boolean;
}) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            {l.label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div className="mb-1 mt-6 px-3 text-[11px] font-semibold tracking-wider text-ink-faint">
              مدیریت
            </div>
            {adminLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                onClick={onNavigate}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="mt-4 border-t border-line pt-4">
        <NavLink
          to="/profile"
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            `mb-2 flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-muted ${
              isActive ? 'bg-brand-soft' : ''
            }`
          }
        >
          <div className="h-9 w-9 overflow-hidden rounded-full bg-surface-muted">
            {user?.avatarFile ? (
              <img
                src={uploadsUrl(`avatars/${user.avatarFile}`)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-xs font-bold text-ink-mute">
                {(user?.fullName || '?').slice(0, 1)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 px-0.5">
            <div className="truncate text-sm font-semibold text-ink">{user?.fullName}</div>
            <div className="truncate text-xs text-ink-mute">
              {user?.statusMessage ||
                user?.jobPosition?.title ||
                (user?.role === 'ADMIN' ? 'مدیر سیستم' : 'کاربر')}
            </div>
          </div>
        </NavLink>
        {showLogout !== false && (
          <button
            className="btn-ghost w-full"
            onClick={() => {
              onNavigate?.();
              logout();
              navigate('/login');
            }}
          >
            خروج
          </button>
        )}
      </div>
    </>
  );
}

function NotifPanel({
  open,
  items,
  onClose,
}: {
  open: boolean;
  items: any[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute left-0 top-12 z-50 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-sm font-bold">اعلان‌ها</span>
        <button type="button" className="text-ink-mute" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 && (
          <div className="p-4 text-center text-sm text-ink-mute">اعلانی نیست</div>
        )}
        {items.map((n) => (
          <Link
            key={n.id}
            to={n.link || '/'}
            onClick={onClose}
            className="block border-b border-line/60 px-3 py-2.5 hover:bg-surface-soft"
          >
            <div className="text-sm font-semibold text-ink">{n.title}</div>
            <div className="mt-0.5 text-xs text-ink-mute">{n.body}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Layout() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const isChat = location.pathname.startsWith('/chat');

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await api<{ count: number }>('/notifications/unread-count');
        if (alive) setUnread(res.count);
      } catch {
        /* ignore */
      }
    };
    tick();
    const id = window.setInterval(tick, 20000);
    enablePushNotifications().catch(() => {});
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [user]);

  async function openNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) {
      try {
        const list = await api('/notifications');
        setNotifications(list);
        await api('/notifications/read-all', { method: 'PATCH', body: {} as any });
        setUnread(0);
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className={`bg-surface-muted ${isChat ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      <header className="sticky top-0 z-40 shrink-0 border-b border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandLogo size="sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-ink">{settings.appName}</div>
              {settings.tagline && (
                <div className="truncate text-[11px] text-ink-mute">{settings.tagline}</div>
              )}
            </div>
          </div>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-muted text-ink"
              onClick={openNotifications}
              aria-label="اعلان‌ها"
            >
              🔔
              {unread > 0 && (
                <span className="absolute -left-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <NotifPanel open={notifOpen} items={notifications} onClose={() => setNotifOpen(false)} />
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-muted text-ink"
              aria-label={menuOpen ? 'بستن منو' : 'باز کردن منو'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 md:hidden ${menuOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-ink/40 transition-opacity ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label="بستن منو"
          onClick={() => setMenuOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 right-0 flex w-[min(88vw,320px)] flex-col bg-surface shadow-card transition-transform duration-300 ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandLogo size="sm" />
              <div className="min-w-0 truncate font-bold text-ink">{settings.appName}</div>
            </div>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg bg-surface-soft text-ink-soft"
              aria-label="بستن"
              onClick={() => setMenuOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="flex flex-1 flex-col px-3 py-4">
            <SideNav onNavigate={() => setMenuOpen(false)} />
          </div>
        </aside>
      </div>

      <div
        className={`mx-auto flex max-w-[1440px] ${
          isChat
            ? 'h-[calc(100dvh-3.5rem)] min-h-0 md:h-[100dvh]'
            : 'min-h-[calc(100vh-3.5rem)] md:min-h-screen'
        }`}
      >
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-l border-line bg-surface px-4 py-5 md:flex">
          <div className="mb-6 flex items-center gap-3 px-1">
            <BrandLogo size="md" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-bold leading-snug text-ink">
                {settings.appName}
              </h1>
              {settings.tagline && (
                <p className="mt-0.5 truncate text-xs text-ink-mute">{settings.tagline}</p>
              )}
            </div>
          </div>
          <div className="relative mb-4 px-1">
            <button
              type="button"
              className="btn-ghost relative w-full justify-between"
              onClick={openNotifications}
            >
              <span>اعلان‌ها</span>
              {unread > 0 && (
                <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>
            <NotifPanel open={notifOpen} items={notifications} onClose={() => setNotifOpen(false)} />
          </div>
          <SideNav />
        </aside>

        <main
          className={`min-w-0 flex-1 ${
            isChat
              ? 'flex min-h-0 flex-col p-0'
              : 'p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6 md:pb-6 lg:p-8'
          }`}
        >
          <Outlet />
        </main>
      </div>

      {!isChat && (
        <nav className="mobile-tabbar md:hidden" aria-label="منوی پایین">
          <div className="mobile-tabbar-inner">
            {mobileLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
              >
                {({ isActive }) => (
                  <>
                    <span className="mobile-tab-icon">
                      <TabIcon name={l.icon} active={isActive} />
                    </span>
                    <span className="mobile-tab-label">{l.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
