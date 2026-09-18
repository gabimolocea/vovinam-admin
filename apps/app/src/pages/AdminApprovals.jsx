import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { athleteAPI } from '@shared/lib/api';
import {
  Alert, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui';
import {
  Calendar, FileCheck, GraduationCap, Image, Trophy, UserPlus,
} from 'lucide-react';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

// Same icon per domain everywhere on this page (row icon + category
// filter), so it all reads as one consistent picture.
const DOMAIN_ICONS = {
  account: UserPlus,
  photo: Image,
  grade: GraduationCap,
  result: Trophy,
  seminar: Calendar,
  visa: FileCheck,
};
const DOMAIN_LABELS = {
  account: 'Conturi noi',
  photo: 'Poze de profil',
  grade: 'Grade',
  result: 'Rezultate',
  seminar: 'Stagii',
  visa: 'Vize',
};

/** A short description of what was actually submitted, per domain - just
 * showing the raw detail value ("Viză anuală") read like a label, not a
 * sentence, so this phrases it as an action instead ("A adăugat viza
 * anuală"). The reviewer's note (e.g. a rejection reason) still takes
 * priority when there is one, since that's the more relevant thing to
 * see at that point. */
function subtitleFor(item) {
  if (item.admin_notes) return item.admin_notes;
  switch (item.domain) {
    case 'account': return 'S-a înregistrat';
    case 'photo': return 'A adăugat poza de profil';
    case 'grade': return item.detail ? `A trimis examenul de grad: ${item.detail}` : null;
    case 'result': return item.detail ? `A trimis rezultatul: ${item.detail}` : null;
    case 'seminar': return item.detail ? `A trimis participarea: ${item.detail}` : null;
    case 'visa': return item.detail ? `A adăugat ${item.detail.toLowerCase()}` : null;
    default: return item.detail || null;
  }
}

/** One row - the athlete's own avatar (not a generic domain icon) with a
 * status badge on its corner: a solid green check or red X once decided
 * (mirrors the coach panel's own NotificationsPage.jsx STATUS_STYLE), or
 * an amber clock while still pending - so "who" and "what happened" both
 * read at a glance without opening the row. */
function ApprovalRow({ item }) {
  const DomainIcon = DOMAIN_ICONS[item.domain] || FileCheck;
  // Every domain shows the athlete's club the same way - "Nume (Club)" -
  // rather than only the account domain doing it, so every row reads
  // with the same structure regardless of what it's about.
  const displayName = item.club ? `${item.athlete_name || '—'} (${item.club})` : (item.athlete_name || '—');
  const subtitle = subtitleFor(item);
  const content = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <DomainIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{displayName}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <p className="shrink-0 pl-[52px] text-left text-xs text-muted-foreground sm:pl-0 sm:text-right">
        {fmtDate(item.date)}{item.reviewed_by && ` – ${item.reviewed_by}`}
      </p>
    </>
  );
  if (!item.athlete_id) {
    return <div className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">{content}</div>;
  }
  return (
    <Link
      to={`/athletes/${item.athlete_id}${item.tab ? `?tab=${item.tab}` : ''}`}
      className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      {content}
    </Link>
  );
}

const EMPTY_MESSAGES = {
  pending: 'Nu există nimic în așteptarea aprobării, în niciun club.',
  approved: 'Nu există încă nicio aprobare înregistrată.',
  rejected: 'Nu există încă nicio respingere înregistrată.',
};

/** One tab's worth of the list (pending/approved/rejected) - fetches once
 * for that status and filters by category client-side, since the whole
 * set is small enough that refetching per filter click would just add
 * latency for no benefit. */
function ApprovalsTab({ status, domain }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    athleteAPI.approvalsList({ status })
      .then((r) => { if (active) setItems(r.data ?? []); })
      .catch(() => { if (active) setError('Nu am putut încărca lista.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status]);

  if (loading) return <Skeleton className="h-64" />;
  if (error) return <Alert variant="destructive">{error}</Alert>;

  const filtered = domain ? items.filter((item) => item.domain === domain) : items;
  if (filtered.length === 0) {
    return <EmptyState title="Nimic aici" message={domain ? `Nimic în categoria „${DOMAIN_LABELS[domain]}”.` : EMPTY_MESSAGES[status]} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {filtered.map((item) => <ApprovalRow key={`${item.domain}-${item.id}`} item={item} />)}
    </div>
  );
}

/** Admin-only: every approval-workflow item across every club, split into
 * "În așteptare" / "Aprobate" / "Respinse", each filterable by category -
 * new account registrations, profile photos, grades, results, seminar
 * participations, visas. Replaces the equivalent Django admin views. */
export default function AdminApprovals() {
  const [domain, setDomain] = useState('');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Aprobări</h1>
        <Select value={domain || 'all'} onValueChange={(v) => setDomain(v === 'all' ? '' : v)}>
          <SelectTrigger aria-label="Filtrează după categorie" className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate categoriile</SelectItem>
            {Object.keys(DOMAIN_LABELS).map((d) => (
              <SelectItem key={d} value={d}>{DOMAIN_LABELS[d]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">În așteptare</TabsTrigger>
          <TabsTrigger value="approved">Aprobate</TabsTrigger>
          <TabsTrigger value="rejected">Respinse</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="pt-4">
          <ApprovalsTab status="pending" domain={domain} />
        </TabsContent>
        <TabsContent value="approved" className="pt-4">
          <ApprovalsTab status="approved" domain={domain} />
        </TabsContent>
        <TabsContent value="rejected" className="pt-4">
          <ApprovalsTab status="rejected" domain={domain} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
