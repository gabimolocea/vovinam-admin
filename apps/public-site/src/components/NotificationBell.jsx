import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import { Bell, Check, CheckCheck, Send, TriangleAlert, X } from 'lucide-react';

// Where each notification type routes to within the athlete's own profile -
// keyed by the notification_type prefix (before the last "_verb").
const TAB_FOR_PREFIX = {
  result: 'rezultate',
  grade: 'grade',
  seminar: 'seminarii',
  visa: 'vize',
};

function linkFor(notification) {
  const prefix = Object.keys(TAB_FOR_PREFIX).find((p) => notification.notification_type.startsWith(p));
  return prefix ? `/cont/profil?tab=${TAB_FOR_PREFIX[prefix]}` : '/cont/profil';
}

const STATUS_STYLE = {
  approved: { Icon: Check, className: 'bg-green-100 text-green-700' },
  rejected: { Icon: X, className: 'bg-red-100 text-red-700' },
  revision_required: { Icon: TriangleAlert, className: 'bg-amber-100 text-amber-700' },
  submitted: { Icon: Send, className: 'bg-blue-100 text-blue-700' },
};

function styleFor(type) {
  const suffix = Object.keys(STATUS_STYLE).find((s) => type.endsWith(s));
  return STATUS_STYLE[suffix] || STATUS_STYLE.submitted;
}

const POLL_INTERVAL_MS = 60000;

/** Header notification bell - polls the unread count while logged in, and
 * fetches the recent list on open. Mirrors the site's other header popovers
 * (AccountNavItem) for open/close and outside-click/Escape behavior. */
export default function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let isMounted = true;
    async function refreshCount() {
      try {
        const response = await notificationAPI.unreadCount();
        if (isMounted) setUnreadCount(response.data.unread_count);
      } catch {
        // silent - the bell just won't show a badge this cycle
      }
    }

    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const response = await notificationAPI.list();
        setNotifications(response.data?.results ?? response.data ?? []);
      } catch {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleItemClick(notification) {
    setOpen(false);
    if (!notification.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await notificationAPI.markRead(notification.id);
      } catch {
        // the list will resync next time it's opened
      }
    }
  }

  async function handleMarkAllRead(e) {
    e.stopPropagation();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await notificationAPI.markAllRead();
    } catch {
      // best-effort
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#172642] transition hover:bg-[#e9ecef]"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Notificări"
        onClick={handleOpen}
      >
        <Bell className="h-3.5 w-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#da3b26] px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="site-submenu absolute right-0 top-full z-50 mt-2 w-80 shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-white/15 px-4 py-3">
            <span
              className="text-sm font-bold uppercase tracking-wide text-white"
              style={{ fontFamily: "'Roboto Condensed', sans-serif" }}
            >
              Notificări
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-white/70 hover:text-[#edb654] hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marchează toate ca citite
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-white/60">Se încarcă…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-white/60">Nu ai notificări.</p>
            ) : (
              notifications.map((notification) => {
                const { Icon, className } = styleFor(notification.notification_type);
                return (
                  <Link
                    key={notification.id}
                    to={linkFor(notification)}
                    onClick={() => handleItemClick(notification)}
                    className={`flex gap-3 border-b border-white/10 px-4 py-3 transition last:border-0 hover:bg-white/5 ${
                      notification.is_read ? '' : 'bg-white/[0.06]'
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm">
                      <span className="block font-medium text-white">{notification.title}</span>
                      <span className="mt-0.5 block text-white/70">{notification.message}</span>
                      <span className="mt-1 block text-xs text-white/50">{notification.time_since_created}</span>
                    </span>
                    {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#da3b26]" />}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
