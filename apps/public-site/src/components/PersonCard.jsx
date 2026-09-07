import { Link } from 'react-router-dom';
import { Badge, Card, CardContent, CardHeader, CardTitle } from './ui';

/** Portrait card for a person directory (Staff, Arbitri, club coaches).
 * Shows the full photo (never cropped) inside a fixed-height placeholder,
 * then name/role/title/grade/club underneath. Wraps the whole card in a
 * Link to the athlete's public profile when `person.id` is present, so it
 * degrades gracefully for lists that don't expose an id. */
export default function PersonCard({ person }) {
  const initials = person.full_name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  const card = (
    <Card className="flex h-full flex-col overflow-hidden text-center transition-shadow hover:shadow-lg">
      <div className="flex h-40 w-full shrink-0 items-center justify-center bg-muted">
        {person.profile_image ? (
          <img src={person.profile_image} alt={person.full_name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl font-semibold text-muted-foreground">{initials}</span>
        )}
      </div>
      <CardHeader>
        <CardTitle as="h2" className="text-base">{person.full_name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col items-center gap-2">
        {person.federation_role && <Badge variant="secondary">{person.federation_role}</Badge>}
        {person.title && <span className="text-sm text-muted-foreground">{person.title}</span>}
        {person.grade && <span className="text-xs font-medium uppercase tracking-wide text-brand-navy">{person.grade}</span>}
        {person.club && <span className="text-sm text-muted-foreground">{person.club}</span>}
      </CardContent>
    </Card>
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
