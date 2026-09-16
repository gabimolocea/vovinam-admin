import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, notificationAPI, notificationSettingsAPI, newsAPI, athleteAPI, gradeHistoryAPI } from '@shared';
import {
  Award, CalendarClock, Check, CheckCheck, ExternalLink, GraduationCap, Newspaper,
  Send, Settings, ShieldAlert, TriangleAlert, X,
} from 'lucide-react';
import {
  Alert, Badge, Button, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Skeleton,
} from '../components/ui';
import Lightbox from '../components/Lightbox';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

// Where each notification type routes within the athlete's reviewer tabs.
// Visa is special-cased below - it splits across two tabs (medical vs
// anuală) depending on action_data.visa_type.
const TAB_FOR_PREFIX = {
  result: 'rezultate',
  grade: 'grade',
  seminar: 'seminarii',
};

// A notification carrying an athlete_id is the reviewer's copy ("X a
// trimis ...") - route straight to that athlete's reviewer page in this
// app, deep-linked to the relevant tab. Anything else is the coach's own
// submitter-side notice, with no dedicated page here, so it falls back to
// the coach's own profile page.
function linkFor(notification) {
  const athleteId = notification.action_data?.athlete_id;
  if (!athleteId) return '/profil';
  if (notification.notification_type.startsWith('visa')) {
    const tab = notification.action_data?.visa_type === 'medical' ? 'medical' : 'vize';
    return `/athletes/${athleteId}?tab=${tab}`;
  }
  const prefix = Object.keys(TAB_FOR_PREFIX).find((p) => notification.notification_type.startsWith(p));
  return prefix ? `/athletes/${athleteId}?tab=${TAB_FOR_PREFIX[prefix]}` : `/athletes/${athleteId}`;
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

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Acum';
  if (minutes < 60) return `Acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Acum ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Acum ${days} zile`;
  return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

const VISA_TYPE_LABELS = { medical: 'medicală', annual: 'anuală' };

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
  const { user, isCoach, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [reminders, setReminders] = useState({ expiring_visas: [], competition_deadlines: [], upcoming_exams: [] });
  const [pendingGrades, setPendingGrades] = useState([]);
  const [reviewBusyId, setReviewBusyId] = useState(null);
  const [certificatePreview, setCertificatePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    let isMounted = true;

    // The grade-review queue and club reminders are a coach-only concept -
    // only fetched for a coach, so a plain athlete or admin never triggers
    // (or accidentally sees stale/empty results from) those calls.
    Promise.all([
      notificationAPI.list(),
      newsAPI.myMentions().catch(() => ({ data: [] })),
      isCoach ? athleteAPI.coachReminders().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      isCoach ? gradeHistoryAPI.submissions.pendingReview().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ])
      .then(([notifRes, mentionsRes, remindersRes, pendingGradesRes]) => {
        if (!isMounted) return;
        setNotifications(notifRes.data?.results ?? notifRes.data ?? []);
        setMentions(mentionsRes.data ?? []);
        setReminders(remindersRes.data ?? { expiring_visas: [], competition_deadlines: [], upcoming_exams: [] });
        setPendingGrades(pendingGradesRes.data?.results ?? pendingGradesRes.data ?? []);
      })
      .catch(() => { if (isMounted) setError('Nu am putut încărca notificările.'); })
      .finally(() => { if (isMounted) setLoading(false); });

    return () => { isMounted = false; };
  }, [authLoading, user, isCoach]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleGradeDecision(id, approve) {
    setReviewBusyId(id);
    try {
      if (approve) await gradeHistoryAPI.submissions.approve(id, {});
      else await gradeHistoryAPI.submissions.reject(id, { notes: 'Examenul de grad nu a fost aprobat.' });
      setPendingGrades((prev) => prev.filter((g) => g.id !== id));
    } catch {
      setError('Nu am putut procesa examenul de grad.');
    } finally {
      setReviewBusyId(null);
    }
  }

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

  const reminderItems = [
    ...reminders.expiring_visas.map((v) => ({
      key: `remind-visa-${v.athlete_id}-${v.visa_type}`,
      sortDate: v.expires_on,
      icon: ShieldAlert,
      className: 'bg-amber-100 text-amber-700',
      title: 'Viză pe cale să expire',
      message: `Viza ${VISA_TYPE_LABELS[v.visa_type] || v.visa_type} a lui ${v.athlete_name} expiră pe ${fmtDate(v.expires_on)}.`,
      to: `/athletes/${v.athlete_id}?tab=${v.visa_type === 'medical' ? 'medical' : 'vize'}`,
    })),
    ...reminders.competition_deadlines.map((c) => ({
      key: `remind-comp-${c.event_id}`,
      sortDate: c.deadline,
      icon: CalendarClock,
      className: 'bg-orange-100 text-orange-700',
      title: 'Termen de înscriere apropiat',
      message: `${c.event_name}: ${c.unregistered_count} sportiv${c.unregistered_count === 1 ? '' : 'i'} din club neînscriși încă (termen: ${fmtDate(c.deadline)}).`,
      to: `/competitions/${c.event_id}`,
    })),
    ...reminders.upcoming_exams.map((e) => ({
      key: `remind-exam-${e.event_id}`,
      sortDate: e.start_date,
      icon: GraduationCap,
      className: 'bg-indigo-100 text-indigo-700',
      title: 'Examen de grad apropiat',
      message: `${e.event_name} are loc pe ${fmtDate(e.start_date)}.`,
      to: '/club?tab=examene',
    })),
  ].sort((a, b) => new Date(a.sortDate) - new Date(b.sortDate));

  function renderReminder(item) {
    const Icon = item.icon;
    return (
      <li key={item.key}>
        <Link to={item.to} className="flex gap-3 rounded-lg border border-border p-4 transition hover:bg-muted/50">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.className}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm">
            <span className="block font-medium text-foreground">{item.title}</span>
            <span className="mt-0.5 block text-muted-foreground">{item.message}</span>
          </span>
        </Link>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-8">
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

      {!loading && !error && (
        <>
          {pendingGrades.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">Examene de grad în așteptare ({pendingGrades.length})</h2>
              <ul className="flex flex-col gap-2">
                {pendingGrades.map((g) => (
                  <li key={g.id} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <Award className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm">
                        <span className="block font-medium text-foreground">{g.athlete_name?.split(',')[0] || '—'}</span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {g.event_name || 'Examen fără eveniment asociat'}
                        </span>
                        {g.grade_name && (
                          <span className="mt-1.5 flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Grad obținut:</span>
                            <Badge>{g.grade_name}</Badge>
                          </span>
                        )}
                        {g.certificate_image ? (
                          <button
                            type="button"
                            onClick={() => setCertificatePreview({ image: g.certificate_image, alt_text: `Certificat de grad - ${g.athlete_name?.split(',')[0] || ''}` })}
                            className="mt-1 block text-left text-xs text-primary underline"
                          >
                            Vezi certificatul
                          </button>
                        ) : (
                          <span className="mt-1 block text-xs text-muted-foreground">Fără certificat atașat</span>
                        )}
                        <span className="mt-1 block text-xs text-muted-foreground">Trimisă {timeAgo(g.submitted_date).replace(/^Acum/, 'acum')}</span>
                      </span>
                    </div>
                    <div className="flex gap-2 sm:shrink-0">
                      <Button size="sm" disabled={reviewBusyId === g.id} onClick={() => handleGradeDecision(g.id, true)}>Aprobă</Button>
                      <Button size="sm" variant="outline" disabled={reviewBusyId === g.id} onClick={() => handleGradeDecision(g.id, false)}>Respinge</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reminderItems.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">De urmărit</h2>
              <ul className="flex flex-col gap-2">
                {reminderItems.map(renderReminder)}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            {(pendingGrades.length > 0 || reminderItems.length > 0) && (
              <h2 className="font-display text-lg font-semibold text-foreground">Toate notificările</h2>
            )}
            {feedItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nu ai notificări.</p>
            ) : (
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
          </section>
        </>
      )}

      <Lightbox image={certificatePreview} onClose={() => setCertificatePreview(null)} />
    </div>
  );
}
