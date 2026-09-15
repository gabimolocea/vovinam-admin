import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth, notificationAPI } from '@shared';
import { Bell } from 'lucide-react';

const POLL_INTERVAL_MS = 60000;

/** Header notification icon - polls the unread count while logged in and
 * links straight to the notifications page (no dropdown). `mobile` mirrors
 * the mobile header's account icon exactly: a flush, full-height square
 * that turns into a solid red block (site-mobile-toggle) while the
 * notifications page is the active route. Hidden for approved coaches -
 * they get notifications inside the coach dashboard instead, which is
 * where the athlete-review links in those notifications actually lead. */
export default function NotificationBell({ mobile = false }) {
  const { isAuthenticated, isCoach, user } = useAuth();
  const isApprovedCoach = isCoach && user?.athlete?.status === 'approved';
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || isApprovedCoach) return undefined;

    let isMounted = true;
    async function refreshCount() {
      try {
        const response = await notificationAPI.unreadCount();
        if (isMounted) setUnreadCount(response.data.unread_count);
      } catch {
        // silent - the icon just won't show a badge this cycle
      }
    }

    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, isApprovedCoach]);

  if (!isAuthenticated || isApprovedCoach) return null;

  const badge = unreadCount > 0 && (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#da3b26] px-1 text-[10px] font-bold text-white">
      {unreadCount > 9 ? '9+' : unreadCount}
    </span>
  );

  if (mobile) {
    return (
      <NavLink
        to="/cont/notificari"
        aria-label="Notificări"
        className={({ isActive }) =>
          `flex w-14 shrink-0 self-stretch items-center justify-center ${isActive ? 'site-mobile-toggle' : 'text-foreground'}`
        }
      >
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          <Bell className="h-5 w-5" fill="currentColor" />
          {badge}
        </span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to="/cont/notificari"
      aria-label="Notificări"
      className={({ isActive }) => `relative inline-flex items-center justify-center ${isActive ? 'text-[#da3b26]' : 'text-[#172642]'}`}
    >
      <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
        <Bell className="h-3.5 w-3.5" fill="currentColor" />
        {badge}
      </span>
    </NavLink>
  );
}
