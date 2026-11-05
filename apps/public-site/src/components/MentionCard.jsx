import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '@shared';
import { athleteAPI } from '@shared/lib/api';
import { stilFocus } from '@shared/lib/profileImage';
import BeltBadge from './BeltBadge';

// One request per athlete per page load, however many times the card opens.
const cache = new Map();

function loadCard(id) {
  if (!cache.has(id)) {
    cache.set(id, athleteAPI.card(id).then(({ data }) => data).catch((error) => {
      cache.delete(id);
      throw error;
    }));
  }
  return cache.get(id);
}

/**
 * Compact preview of an athlete tagged in an article, shown while the
 * pointer rests on their name. Athlete profiles need a sign-in (photos of
 * minors), so a visitor gets the full card only for someone the site
 * already shows publicly - staff, title holders, referees (the backend
 * decides, see athlete_card); for anyone else just the name and a hint.
 */
export default function MentionCard({ athleteId, name, anchor, onMouseEnter, onMouseLeave }) {
  const { isAuthenticated } = useAuth();
  const [card, setCard] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setCard(null);
    setFailed(false);
    loadCard(athleteId)
      .then((data) => { if (active) setCard(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [athleteId, isAuthenticated]);

  // Below the name, flipped above it when there's no room underneath.
  const rect = anchor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom > 220;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 296);
  const style = below ? { top: rect.bottom + 8, left } : { bottom: window.innerHeight - rect.top + 8, left };

  const titles = card ? [card.title, card.federation_role, ...(card.roles || [])].filter(Boolean) : [];

  return (
    <div
      role="tooltip"
      style={style}
      className="fixed z-50 w-72 rounded-lg border border-[#dce0e5] bg-white p-3 text-left text-sm not-italic shadow-lg"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#eef1f4] text-[#8a94a3]">
          {card?.profile_image ? (
            <img src={card.profile_image} alt="" className="h-full w-full object-cover" style={stilFocus(card)} />
          ) : (
            <User className="h-7 w-7" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold leading-tight text-[#00334d]">{card?.full_name || name}</p>
          {card?.club && <p className="truncate text-xs text-[#5b6675]">{card.club}</p>}
          {!card && !failed && <p className="text-xs text-[#5b6675]">Se încarcă…</p>}
          {failed && !isAuthenticated && <p className="text-xs text-[#5b6675]">Autentifică-te ca să vezi profilul sportivului.</p>}
        </div>
      </div>
      {card?.grade && (
        <div className="mt-2">
          <BeltBadge grade={card.grade} />
        </div>
      )}
      {titles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {titles.map((title) => (
            <span key={title} className="rounded-full bg-[#fdf3dd] px-2 py-0.5 text-xs font-medium text-[#7a5410]">{title}</span>
          ))}
        </div>
      )}
    </div>
  );
}
