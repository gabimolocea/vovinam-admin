import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import { CheckCheck, Check, Send, TriangleAlert, X } from 'lucide-react';
import { Skeleton } from '../components/ui';
import Breadcrumbs from '../components/Breadcrumbs';
import Seo from '../components/Seo';

// A notification is the *reviewer's* copy ("X a trimis ...") rather than the
// submitter's own confirmation/decision notice when it carries an
// `athlete_id` (see notification_utils.py: only the admin/coach-facing copy
// includes it). Those route straight to that athlete's own page, where a
// reviewer (admin/coach) sees the extra status info and approve/reject
// controls inline - the submitter's own copy just goes to /cont instead,
// which redirects to their dashboard (results/grades/etc are managed there
// now, not on the public site).
function linkFor(notification) {
  const athleteId = notification.action_data?.athlete_id;
  return athleteId ? `/sportivi/${athleteId}` : '/cont';
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

/** Dedicated /cont/notificari page - was a header dropdown, moved to a
 * real page so the notification icon can just be a plain link like the
 * account one, instead of managing open/close state itself. */
export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user) return undefined;
    let isMounted = true;

    notificationAPI.list()
      .then((res) => { if (isMounted) setNotifications(res.data?.results ?? res.data ?? []); })
      .catch(() => { if (isMounted) setError('Nu am putut încărca notificările.'); })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [authLoading, user]);

  if (!authLoading && !user) return <Navigate to="/cont" replace />;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleItemClick(notification) {
    if (!notification.is_read) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
      try {
        await notificationAPI.markRead(notification.id);
      } catch {
        // the list will resync next visit
      }
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await notificationAPI.markAllRead();
    } catch {
      // best-effort
    }
  }

  return (
    <div className="flex flex-col">
      <Seo title="Notificări" path="/cont/notificari" noindex />

      <Breadcrumbs items={[{ label: 'Contul meu', to: '/cont' }, { label: 'Notificări' }]} showCurrent />

      <div className="site-full-bleed bg-[#e9ecef]">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-16">
          <h1 className="text-fluid-h2 font-display font-bold text-[#00334d]">Notificări</h1>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:py-10">
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="flex w-fit items-center gap-1.5 self-end text-sm font-medium text-[#0a4c75] hover:underline"
          >
            <CheckCheck className="h-4 w-4" /> Marchează toate ca citite
          </button>
        )}

        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}

        {!loading && error && <p className="text-center text-sm text-destructive">{error}</p>}

        {!loading && !error && notifications.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Nu ai notificări.</p>
        )}

        {!loading && !error && notifications.length > 0 && (
          <div className="flex flex-col gap-2">
            {notifications.map((notification) => {
              const { Icon, className } = styleFor(notification.notification_type);
              return (
                <Link
                  key={notification.id}
                  to={linkFor(notification)}
                  onClick={() => handleItemClick(notification)}
                  className={`flex gap-3 rounded-lg border border-border p-4 transition hover:bg-muted/50 ${
                    notification.is_read ? '' : 'bg-[#0a4c75]/5'
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm">
                    <span className="block font-medium text-foreground">{notification.title}</span>
                    <span className="mt-0.5 block text-muted-foreground">{notification.message}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{notification.time_since_created}</span>
                  </span>
                  {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#da3b26]" />}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
