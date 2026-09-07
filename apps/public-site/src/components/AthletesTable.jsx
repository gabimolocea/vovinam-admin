import { Link } from 'react-router-dom';
import { Badge } from './ui';
import { ATHLETE_STATUS_LABELS, medalSummary } from '../lib/athletes';

/**
 * Reusable athletes table used by both the standalone "Sportivi" list page
 * and the "Sportivi" tab on a club detail page. Pass `showClub={false}`
 * when the athletes are already scoped to a single club.
 */
export default function AthletesTable({ athletes, showClub = true }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Nume</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Grad</th>
            {showClub && <th className="px-4 py-3 font-medium">Club</th>}
            <th className="px-4 py-3 font-medium">Rezultate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {athletes.map((athlete) => (
            <tr key={athlete.id} className="transition hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link to={`/sportivi/${athlete.id}`} className="flex items-center gap-3 font-medium hover:underline">
                  {athlete.profile_image ? (
                    <img src={athlete.profile_image} alt={athlete.full_name} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                      {athlete.first_name?.[0]}{athlete.last_name?.[0]}
                    </span>
                  )}
                  {athlete.full_name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">{ATHLETE_STATUS_LABELS[athlete.status] || athlete.status}</Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{athlete.current_grade?.name || '—'}</td>
              {showClub && <td className="px-4 py-3 text-muted-foreground">{athlete.club?.name || '—'}</td>}
              <td className="px-4 py-3 text-muted-foreground">{medalSummary(athlete.medals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
