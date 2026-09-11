import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import BeltBadge from './BeltBadge';

/** Portrait card for a person directory (Staff, Arbitri, club coaches).
 * Shows the full photo (never cropped) inside a fixed-height placeholder,
 * then name, the belt graphic, and role/title/club underneath. Wraps the
 * whole card in a Link to the athlete's public profile when `person.id`
 * is present, so it degrades gracefully for lists that don't expose an
 * id. Styled like the rest of the site's card grids (NewsCard, EventCard)
 * rather than the generic shadcn Card, for a consistent look. */
export default function PersonCard({ person }) {
  const initials = person.full_name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  const card = (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#dce0e5] bg-white p-2 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#0a4c75] hover:shadow-lg">
      <div className="relative flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e9ecef]">
        {person.profile_image ? (
          <img
            src={person.profile_image}
            alt={person.full_name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="text-2xl font-display font-bold text-[#00334d]/40">{initials}</span>
        )}
        {person.club?.logo && (
          <img
            src={person.club.logo}
            alt={person.club.name}
            title={person.club.name}
            className="absolute right-1.5 top-1.5 h-12 w-12 rounded-full object-contain drop-shadow-md"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col items-center gap-2 px-4 py-6">
        <p className="font-display text-base font-bold text-[#00334d]">{person.full_name}</p>
        {person.grade && (
          <div className="flex justify-center">
            <BeltBadge grade={person.grade} />
          </div>
        )}
        {person.federation_role && (
          <span className="text-xs font-bold uppercase tracking-wide text-brand-red">
            {person.federation_role}
          </span>
        )}
        {person.title && (
          <span className="flex items-start gap-1 text-sm font-medium italic text-[#00334d]/70">
            <Award className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#edb654]" />
            {person.title}
          </span>
        )}
      </div>
    </div>
  );

  return person.id ? <Link to={`/sportivi/${person.id}`} className="block h-full">{card}</Link> : card;
}

/** Responsive grid of `PersonCard`s, shared by Staff/Arbitri pages. Grid
 * cells stretch by default, so each card fills equal height per row. */
export function PersonGrid({ people }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {people.map((person, i) => <PersonCard key={`${person.full_name}-${i}`} person={person} />)}
    </div>
  );
}
