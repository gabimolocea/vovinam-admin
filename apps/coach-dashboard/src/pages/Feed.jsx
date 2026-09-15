import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, notificationAPI, newsAPI, athleteAPI, gradeHistoryAPI } from '@shared';
import { Button, Skeleton } from '../components/ui';
import {
  Trophy, Award, Users, ShieldCheck, Camera, Newspaper, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, UserPlus, ShieldAlert, CalendarClock, GraduationCap,
} from 'lucide-react';

const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL || 'http://localhost:5183';

const STATUS_ICON = { approved: CheckCircle2, rejected: XCircle, revision_required: AlertTriangle };
const STATUS_CLASS = {
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  revision_required: 'bg-amber-100 text-amber-700',
};
const KIND_META = {
  result: { tab: 'rezultate', icon: Trophy, className: 'bg-amber-100 text-amber-700' },
  grade: { tab: 'grade', icon: Award, className: 'bg-blue-100 text-blue-700' },
  seminar: { tab: 'seminarii', icon: Users, className: 'bg-purple-100 text-purple-700' },
  visa: { tab: 'vize', icon: ShieldCheck, className: 'bg-emerald-100 text-emerald-700' },
};

// Notification types that belong in the roster-activity feed: something a
// club athlete submitted, or the outcome of that submission (even when an
// admin, not this coach, was the one who reviewed it).
const ROSTER_TYPES = {};
for (const [kind, meta] of Object.entries(KIND_META)) {
  ROSTER_TYPES[`${kind}_submitted`] = { icon: meta.icon, className: meta.className, tab: meta.tab };
  for (const [suffix, statusIcon] of Object.entries(STATUS_ICON)) {
    ROSTER_TYPES[`${kind}_${suffix}`] = { icon: statusIcon, className: STATUS_CLASS[suffix], tab: meta.tab };
  }
}
ROSTER_TYPES.profile_image_submitted = { icon: Camera, className: 'bg-pink-100 text-pink-700', tab: null };
ROSTER_TYPES.athlete_registered = { icon: UserPlus, className: 'bg-indigo-100 text-indigo-700', tab: null };

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

export default function Feed() {
  const { loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [reminders, setReminders] = useState({ expiring_visas: [], competition_deadlines: [], upcoming_exams: [] });
  const [pendingGrades, setPendingGrades] = useState([]);
  const [reviewBusyId, setReviewBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return undefined;
    let isMounted = true;
    Promise.all([
      notificationAPI.list(),
      newsAPI.myMentions(),
      athleteAPI.coachReminders(),
      gradeHistoryAPI.submissions.pendingReview().catch(() => ({ data: [] })),
    ])
      .then(([notifRes, mentionsRes, remindersRes, pendingGradesRes]) => {
        if (!isMounted) return;
        setNotifications(notifRes.data?.results ?? notifRes.data ?? []);
        setMentions(mentionsRes.data ?? []);
        setReminders(remindersRes.data ?? { expiring_visas: [], competition_deadlines: [], upcoming_exams: [] });
        setPendingGrades(pendingGradesRes.data?.results ?? pendingGradesRes.data ?? []);
      })
      .catch(() => { if (isMounted) setError('Nu am putut încărca activitatea recentă.'); })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [authLoading]);

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

  const rosterItems = notifications
    .filter((n) => ROSTER_TYPES[n.notification_type])
    .map((n) => {
      // Visa notifications split across two tabs (medical vs anuală) - every
      // other type maps to a single fixed tab.
      const tab = n.notification_type.startsWith('visa')
        ? (n.action_data?.visa_type === 'medical' ? 'medical' : 'vize')
        : ROSTER_TYPES[n.notification_type].tab;
      return {
        key: `notif-${n.id}`,
        date: n.created_at,
        isRead: n.is_read,
        icon: ROSTER_TYPES[n.notification_type].icon,
        className: ROSTER_TYPES[n.notification_type].className,
        title: n.title,
        message: n.message,
        timeLabel: n.time_since_created,
        to: n.action_data?.athlete_id ? `/athletes/${n.action_data.athlete_id}${tab ? `?tab=${tab}` : ''}` : undefined,
        onOpen: () => handleItemClick(n),
      };
    });

  const mentionItems = mentions.map((post) => ({
    key: `news-${post.id}`,
    date: post.created_at,
    isRead: true,
    icon: Newspaper,
    className: 'bg-sky-100 text-sky-700',
    title: 'Ai fost menționat într-o noutate',
    message: post.title,
    timeLabel: timeAgo(post.created_at),
    href: `${PUBLIC_SITE_URL}/noutati/${post.slug}`,
  }));

  const feedItems = [...rosterItems, ...mentionItems].sort((a, b) => new Date(b.date) - new Date(a.date));

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
      to: '/exams',
    })),
  ].sort((a, b) => new Date(a.sortDate) - new Date(b.sortDate));

  function renderItem(item) {
    const Icon = item.icon;
    const content = (
      <>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.className}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm">
          <span className="block font-medium text-foreground">{item.title}</span>
          <span className="mt-0.5 block text-muted-foreground">{item.message}</span>
          {item.timeLabel && <span className="mt-1 block text-xs text-muted-foreground">{item.timeLabel}</span>}
        </span>
        {item.href && <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {item.isRead === false && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />}
      </>
    );
    const rowClass = `flex gap-3 rounded-lg border border-border p-4 transition hover:bg-muted/50 ${item.isRead === false ? 'bg-primary/5' : ''}`;

    if (item.href) {
      return (
        <li key={item.key}>
          <a href={item.href} target="_blank" rel="noopener noreferrer" className={rowClass}>{content}</a>
        </li>
      );
    }
    if (item.to) {
      return (
        <li key={item.key}>
          <Link to={item.to} onClick={item.onOpen} className={rowClass}>{content}</Link>
        </li>
      );
    }
    return <li key={item.key} className={rowClass}>{content}</li>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Feed</h1>
        <p className="text-sm text-muted-foreground">Ce se întâmplă în clubul tău - rezultate, grade, poze și vize noi, trimise de sportivi.</p>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <>
          {pendingGrades.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-semibold text-foreground">Examene de grad în așteptare ({pendingGrades.length})</h2>
              <ul className="flex flex-col gap-2">
                {pendingGrades.map((g) => (
                  <li key={g.id} className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{g.athlete_name || '—'}</p>
                      <p className="text-sm text-muted-foreground">{g.grade_name || '—'} {g.event_name ? `· ${g.event_name}` : ''}</p>
                      {g.certificate_image && (
                        <a href={g.certificate_image} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Vezi certificatul</a>
                      )}
                    </div>
                    <div className="flex gap-2">
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
                {reminderItems.map(renderItem)}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            {reminderItems.length > 0 && <h2 className="font-display text-lg font-semibold text-foreground">Activitate recentă</h2>}
            {feedItems.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Niciun eveniment recent. Aici vei vedea activitatea sportivilor din clubul tău.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {feedItems.map(renderItem)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
