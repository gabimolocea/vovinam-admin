import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { athleteAPI, gradeHistoryAPI, scoreAPI, seminarAPI, visaAPI } from '@shared/lib/api';
import { Alert, Badge, Button, EmptyState, Skeleton } from '../components/ui';
import { Check, Eye, X } from 'lucide-react';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

/** One row linking into the athlete's own page, where the actual
 * approve/reject controls already live (AthleteDetail.jsx's ReviewButtons)
 * - this page is a cross-club index into that, not a second copy of the
 * review UI. Only the "Conturi noi" section below is self-contained, since
 * account-registration approval has no equivalent surface elsewhere. */
function PendingRow({ athleteId, athleteName, tab, detail, date }) {
  const content = (
    <>
      <div>
        <p className="font-medium">{athleteName || '—'}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      <span className="text-xs text-muted-foreground">{fmtDate(date)}</span>
    </>
  );
  // A team result has no single athlete to link to (see team_members
  // instead) - render it as a plain, non-clickable row rather than a
  // broken link.
  if (!athleteId) {
    return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm">{content}</div>;
  }
  return (
    <Link
      to={`/athletes/${athleteId}${tab ? `?tab=${tab}` : ''}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm transition hover:bg-accent"
    >
      {content}
    </Link>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title} {count > 0 && <Badge className="border-transparent bg-amber-100 text-amber-800">{count}</Badge>}
      </h2>
      {count === 0 ? <p className="text-sm text-muted-foreground">Nimic în așteptare.</p> : <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

/** Admin-only: everything pending review across every club in one place -
 * new account registrations, profile photos, grades, results, seminar
 * participations, visas. Replaces the equivalent Django admin views. */
export default function AdminApprovals() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [grades, setGrades] = useState([]);
  const [results, setResults] = useState([]);
  const [seminars, setSeminars] = useState([]);
  const [visas, setVisas] = useState([]);
  const [accountBusyId, setAccountBusyId] = useState(null);
  const [accountError, setAccountError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [accountsRes, photosRes, gradesRes, resultsRes, seminarsRes, visasRes] = await Promise.all([
        athleteAPI.pendingApprovals(),
        athleteAPI.pendingImageApprovals(),
        gradeHistoryAPI.submissions.pendingReview(),
        scoreAPI.pendingReview(),
        seminarAPI.submissions.pendingReview(),
        visaAPI.submissions.pendingReview(),
      ]);
      setAccounts(accountsRes.data?.profiles ?? []);
      setPhotos(photosRes.data ?? []);
      setGrades(gradesRes.data ?? []);
      setResults(resultsRes.data ?? []);
      setSeminars(seminarsRes.data ?? []);
      setVisas(visasRes.data ?? []);
    } catch {
      setError('Nu am putut încărca lista de aprobări.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function processAccount(id, action) {
    setAccountBusyId(id);
    setAccountError('');
    try {
      // The backend requires a reason for a rejection - same fixed default
      // note used for every other reject action in the app (see
      // AthleteDetail.jsx's REVIEW_REJECT_NOTE) rather than prompting for
      // free text here.
      const payload = action === 'reject' ? { action, notes: 'Cererea de înregistrare nu a fost aprobată.' } : { action };
      await athleteAPI.process(id, payload);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setAccountError('Nu am putut procesa cererea.');
    } finally {
      setAccountBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="destructive">{error}</Alert>;
  }

  const totalCount = accounts.length + photos.length + grades.length + results.length + seminars.length + visas.length;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-bold">Aprobări</h1>

      {totalCount === 0 ? (
        <EmptyState title="Totul e la zi" message="Nu există nimic în așteptarea aprobării, în niciun club." />
      ) : (
        <>
          <Section title="Conturi noi" count={accounts.length}>
            {accountError && <Alert variant="destructive">{accountError}</Alert>}
            {accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{a.first_name} {a.last_name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(a.submitted_date)}</p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/athletes/${a.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium transition hover:bg-accent"
                  >
                    <Eye className="h-4 w-4" /> Vezi detalii
                  </Link>
                  <Button type="button" size="sm" disabled={accountBusyId === a.id} onClick={() => processAccount(a.id, 'approve')}>
                    <Check className="h-4 w-4" /> Aprobă
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={accountBusyId === a.id} onClick={() => processAccount(a.id, 'reject')}>
                    <X className="h-4 w-4" /> Respinge
                  </Button>
                </div>
              </div>
            ))}
          </Section>

          <Section title="Poze de profil" count={photos.length}>
            {photos.map((a) => (
              <PendingRow key={a.id} athleteId={a.id} athleteName={a.full_name || `${a.first_name} ${a.last_name}`} date={a.profile_image_submitted_date} />
            ))}
          </Section>

          <Section title="Grade" count={grades.length}>
            {grades.map((g) => (
              <PendingRow key={g.id} athleteId={g.athlete} athleteName={g.athlete_name} tab="grade" detail={g.grade_name} date={g.submitted_date} />
            ))}
          </Section>

          <Section title="Rezultate" count={results.length}>
            {results.map((r) => (
              <PendingRow key={r.id} athleteId={r.athlete?.id} athleteName={r.athlete?.name} tab="rezultate" detail={r.competition_name} date={r.submitted_date} />
            ))}
          </Section>

          <Section title="Stagii" count={seminars.length}>
            {seminars.map((s) => (
              <PendingRow key={s.id} athleteId={s.athlete} athleteName={s.athlete_name} tab="seminarii" detail={s.seminar_name || s.event_name} date={s.submitted_date} />
            ))}
          </Section>

          <Section title="Vize" count={visas.length}>
            {visas.map((v) => (
              <PendingRow
                key={v.id}
                athleteId={v.athlete}
                athleteName={v.athlete_name}
                tab={v.visa_type === 'medical' ? 'medical' : 'vize'}
                detail={v.visa_type === 'medical' ? 'Viză medicală' : 'Viză anuală'}
                date={v.submitted_date}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
