import { Link } from 'react-router-dom';
import { Badge } from './ui';
import BeltBadge from './BeltBadge';
import ResponsiveTable from './ResponsiveTable';
import { ATHLETE_STATUS_LABELS, medalSummary } from '../lib/athletes';

/** Athlete photo in the same wide (3:2) format used on the athlete's own
 * profile hero, with the club crest overlaid top-right - rather than a
 * small circular avatar - so the table/cards read consistently with the
 * profile page. `className` sets the size (a fixed width; height follows
 * from the aspect ratio). */
function AthletePhoto({ athlete, className }) {
  return (
    <div className={`relative aspect-[3/2] shrink-0 bg-muted ${className}`}>
      {athlete.profile_image ? (
        <img src={athlete.profile_image} alt={athlete.full_name} className="h-full w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg text-xs font-semibold text-muted-foreground">
          {athlete.first_name?.[0]}{athlete.last_name?.[0]}
        </div>
      )}
      {athlete.club?.logo && (
        <img
          src={athlete.club.logo}
          alt={athlete.club.name}
          title={athlete.club.name}
          className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full object-contain drop-shadow-md"
        />
      )}
    </div>
  );
}

/**
 * Reusable athletes table used by both the standalone "Sportivi" list page
 * and the "Sportivi" tab on a club detail page. Pass `showClub={false}`
 * when the athletes are already scoped to a single club, and `showStatus`/
 * `showResults={false}` to drop those columns. Renders as a real table
 * from `sm:` up and a stacked list of cards on mobile.
 */
export default function AthletesTable({ athletes, showClub = true, showStatus = true, showResults = true }) {
  return (
    <ResponsiveTable
      head={
        <>
          <th className="px-4 py-3 font-medium">Nume</th>
          {showStatus && <th className="px-4 py-3 font-medium">Status</th>}
          <th className="px-4 py-3 font-medium">Grad</th>
          {showClub && <th className="px-4 py-3 font-medium">Club</th>}
          {showResults && <th className="px-4 py-3 font-medium">Rezultate</th>}
        </>
      }
      rows={athletes.map((athlete) => (
        <tr key={athlete.id} className="transition hover:bg-muted/30">
          <td className="px-4 py-3">
            <Link to={`/sportivi/${athlete.id}`} className="flex items-center gap-3 font-medium hover:underline">
              <AthletePhoto athlete={athlete} className="w-16" />
              {athlete.full_name}
            </Link>
          </td>
          {showStatus && (
            <td className="px-4 py-3">
              <Badge variant="outline">{ATHLETE_STATUS_LABELS[athlete.status] || athlete.status}</Badge>
            </td>
          )}
          <td className="px-4 py-3 text-muted-foreground">
            {athlete.current_grade?.name ? <BeltBadge grade={athlete.current_grade.name} /> : '—'}
          </td>
          {showClub && <td className="px-4 py-3 text-muted-foreground">{athlete.club?.name || '—'}</td>}
          {showResults && <td className="px-4 py-3 text-muted-foreground">{medalSummary(athlete.medals)}</td>}
        </tr>
      ))}
      cards={athletes.map((athlete) => (
        <li key={athlete.id} className="rounded-lg border border-[#dce0e5] p-3">
          <Link to={`/sportivi/${athlete.id}`} className="flex gap-3">
            <AthletePhoto athlete={athlete} className="w-24" />
            <div className="flex flex-1 flex-col gap-1.5">
              <p className="font-medium">{athlete.full_name}</p>
              {showStatus && (
                <Badge variant="outline" className="w-fit">{ATHLETE_STATUS_LABELS[athlete.status] || athlete.status}</Badge>
              )}
              {athlete.current_grade?.name && <BeltBadge grade={athlete.current_grade.name} />}
              {showClub && athlete.club?.name && <p className="text-sm text-muted-foreground">{athlete.club.name}</p>}
              {showResults && <p className="text-sm text-muted-foreground">{medalSummary(athlete.medals)}</p>}
            </div>
          </Link>
        </li>
      ))}
    />
  );
}
