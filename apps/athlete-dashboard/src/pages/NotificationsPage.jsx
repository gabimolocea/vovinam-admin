import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, notificationAPI, notificationSettingsAPI, newsAPI } from '@shared';
import { CheckCheck, Check, ExternalLink, Newspaper, Send, Settings, TriangleAlert, X } from 'lucide-react';
import {
  Alert, Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Skeleton,
} from '../components/ui';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

// Where each notification type routes within "Profilul meu" - this app only
// ever shows the logged-in athlete's own profile, so every notification
// deep-links there, just to a different tab. Visa is special-cased below -
// it splits across two tabs (medical vs anuală) depending on
// action_data.visa_type.
const TAB_FOR_PREFIX = {
  result: 'rezultate',
  grade: 'grade',
  seminar: 'seminarii',
};

function linkFor(notification) {
  const type = notification.notification_type;
  if (type.startsWith('visa')) {
    const tab = notification.action_data?.visa_type === 'medical' ? 'medical' : 'vize';
    return `/profile?tab=${tab}`;
  }
  const prefix = Object.keys(TAB_FOR_PREFIX).find((p) => type.startsWith(p));
  return prefix ? `/profile?tab=${TAB_FOR_PREFIX[prefix]}` : '/profile';
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

const NOTIFICATION_FIELDS = [
  {
    group: 'Email',
    items: [
      ['email_on_result_status_change', 'Schimbarea stării unui rezultat'],
      ['email_on_grade_status_change', 'Schimbarea stării unui examen de grad'],
      ['email_on_seminar_status_change', 'Schimbarea stării unei participări la seminar'],
      ['email_on_visa_status_change', 'Schimbarea stării unei vize'],
      ['email_on_competition_updates', 'Actualizări ale competițiilor'],
      ['email_on_system_announcements', 'Anunțuri de sistem'],
    ],
  },
  {
    group: 'WhatsApp',
    items: [
      ['notify_via_whatsapp', 'Trimite-mi și un mesaj WhatsApp la schimbarea stării unei cereri'],
    ],
  },
  {
    group: 'În aplicație',
    items: [
      ['notify_result_submitted', 'Rezultat trimis'],
      ['notify_result_approved', 'Rezultat aprobat'],
      ['notify_result_rejected', 'Rezultat respins'],
      ['notify_result_revision_required', 'Rezultat cu completări solicitate'],
      ['notify_grade_submitted', 'Examen de grad trimis'],
      ['notify_grade_approved', 'Examen de grad aprobat'],
      ['notify_grade_rejected', 'Examen de grad respins'],
      ['notify_grade_revision_required', 'Examen de grad cu completări solicitate'],
      ['notify_seminar_submitted', 'Participare la seminar trimisă'],
      ['notify_seminar_approved', 'Participare la seminar aprobată'],
      ['notify_seminar_rejected', 'Participare la seminar respinsă'],
      ['notify_seminar_revision_required', 'Participare la seminar cu completări solicitate'],
      ['notify_competition_created', 'Competiție nouă'],
      ['notify_competition_updated', 'Competiție actualizată'],
      ['notify_system_announcements', 'Anunțuri de sistem'],
    ],
  },
];

/** Notification preferences, opened from the gear icon next to the page
 * title - moved here (out of the deleted "Setări" page) since these
 * settings are specifically about this list. */
function NotificationSettingsDialog({ open, onOpenChange }) {
  const [settings, setSettings] = useState(null);
  const [busyField, setBusyField] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    notificationSettingsAPI.get().then((res) => setSettings(res.data)).catch(() => setError('Nu am putut încărca setările de notificare.'));
  }, [open]);

  async function toggle(field) {
    if (!settings) return;
    const next = !settings[field];
    setSettings((prev) => ({ ...prev, [field]: next }));
    setBusyField(field);
    setError('');
    try {
      await notificationSettingsAPI.update(settings.id, { [field]: next });
    } catch {
      setSettings((prev) => ({ ...prev, [field]: !next }));
      setError('Nu am putut salva preferința. Încearcă din nou.');
    } finally {
      setBusyField(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setări notificări</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {error && <Alert variant="destructive">{error}</Alert>}
          {!settings && !error && <p className="text-sm text-muted-foreground">Se încarcă…</p>}
          {settings && NOTIFICATION_FIELDS.map(({ group, items }) => (
            <div key={group} className="flex flex-col gap-2">
              <span className="text-sm font-medium">{group}</span>
              {items.map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!settings[field]} disabled={busyField === field} onCheckedChange={() => toggle(field)} />
                  {label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    let isMounted = true;

    Promise.all([
      notificationAPI.list(),
      newsAPI.myMentions().catch(() => ({ data: [] })),
    ])
      .then(([notifRes, mentionsRes]) => {
        if (!isMounted) return;
        setNotifications(notifRes.data?.results ?? notifRes.data ?? []);
        setMentions(mentionsRes.data ?? []);
      })
      .catch(() => { if (isMounted) setError('Nu am putut încărca notificările.'); })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [authLoading, user]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Merge in news-post mentions ("cineva te-a etichetat") alongside the
  // actual notifications, newest first - they're a small addition, not
  // worth a separate page (the "Feed" page this replaced did the same).
  const mentionItems = mentions.map((post) => ({
    type: 'mention',
    key: `news-${post.id}`,
    date: post.created_at,
    title: 'Ai fost menționat într-o noutate',
    message: post.title,
    href: `${PUBLIC_SITE_URL}/noutati/${post.slug}`,
  }));
  const notificationItems = notifications.map((n) => ({ type: 'notification', key: n.id, date: n.created_at, notification: n }));
  const feedItems = [...notificationItems, ...mentionItems].sort((a, b) => new Date(b.date) - new Date(a.date));

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
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Notificări</h1>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-4 w-4" /> Marchează toate ca citite
            </button>
          )}
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Setări notificări">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      )}

      {!loading && error && <p className="text-center text-sm text-destructive">{error}</p>}

      {!loading && !error && feedItems.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Nu ai notificări.</p>
      )}

      {!loading && !error && feedItems.length > 0 && (
        <div className="flex flex-col gap-2">
          {feedItems.map((item) => {
            if (item.type === 'mention') {
              return (
                <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className="flex gap-3 rounded-lg border border-border p-4 transition hover:bg-muted/50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <Newspaper className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm">
                    <span className="block font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block text-muted-foreground">{item.message}</span>
                  </span>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              );
            }
            const notification = item.notification;
            const { Icon, className } = styleFor(notification.notification_type);
            const resolved = notification.resolved_status;
            const isApproved = resolved === 'approved';
            return (
              <Link
                key={item.key}
                to={linkFor(notification)}
                onClick={() => handleItemClick(notification)}
                className={`relative flex gap-3 rounded-lg border border-border p-4 transition hover:bg-muted/50 ${
                  notification.is_read ? '' : 'bg-primary/5'
                } ${resolved ? 'opacity-50' : ''}`}
              >
                {resolved && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {isApproved ? (
                      <Check className="h-16 w-16 text-green-600" strokeWidth={3} />
                    ) : (
                      <X className="h-16 w-16 text-red-600" strokeWidth={3} />
                    )}
                  </span>
                )}
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm">
                  <span className="block font-medium text-foreground">{notification.title}</span>
                  <span className="mt-0.5 block text-muted-foreground">{notification.message}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{notification.time_since_created}</span>
                </span>
                {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
