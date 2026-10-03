import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import BeltBadge from './BeltBadge';

/** Portrait card for a person directory (Staff, Arbitri, club coaches).
 * Shows the photo inside a fixed-ratio box, then name, the belt graphic,
 * and role/title/club underneath. Wraps the
 * whole card in a Link to the athlete's public profile when `person.id`
 * is present, so it degrades gracefully for lists that don't expose an
 * id. Styled like the rest of the site's card grids (NewsCard, EventCard)
 * rather than the generic shadcn Card, for a consistent look. */
// Fundalul care umple caseta: aceeasi poza, estompata si putin marita.
//
// `scale(1.12)`, nu 1: `filter: blur()` face transparente chiar marginile
// elementului, iar transparenta aia lasa sa se vada fundalul casetei - adica
// patru dungi verticale. Marita, marginile estompate cad in afara cadrului,
// si nu mai exista nicio cusatura de vazut.
const FUNDAL = { filter: 'blur(14px)', transform: 'scale(1.12)' };

// Marginile laterale ale fotografiei, topite in fundal.
//
// Fara asta, poza clara se termina brusc si se vede exact unde - doua muchii
// verticale. Masca o face sa se stinga spre transparent pe ultimii 12% din
// latime, deci trecerea spre fundalul neclar nu mai are un loc anume.
// Numai pe orizontala: sus si jos poza atinge oricum marginea casetei.
//
// Prefixul -webkit- nu e de prisos: Safari inca nu accepta `mask-image`
// nici azi fara el, iar fara masca marginile ar reaparea exact pe
// telefoanele pe care au fost reclamate.
const TOPIRE = (() => {
  const gradient = 'linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)';
  return { maskImage: gradient, WebkitMaskImage: gradient };
})();

export default function PersonCard({ person }) {
  const initials = person.full_name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  const card = (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#dce0e5] bg-white p-2 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#0a4c75] hover:shadow-lg">
      <div className="relative flex aspect-[15/8] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e9ecef]">
        {person.profile_image ? (
          // Poza intreaga, pe un fundal facut din ea insasi.
          //
          // Caseta e lata (15/8), pozele de profil sunt aproape toate
          // portret. Taiata ca sa umple, se pierde capul sau bustul; lasata
          // sa incapa, raman doua benzi goale care arata a greseala. Asa,
          // poza se vede intreaga, iar restul casetei il umple o copie a ei,
          // estompata - deci marginile se continua din fotografie, nu dintr-o
          // culoare inventata.
          //
          // Au fost intai doua copii oglindite, cate una de fiecare parte.
          // Mergea, dar se vedea ca atare: la cusatura, umarul aparea a doua
          // oara, intors - iar ochiul citeste imediat dublura. Un singur
          // fundal intins peste toata caseta n-are nici cusatura, nici
          // simetrie de observat.
          //
          // `absolute inset-0`, nu `h-full`: altfel inaltimea se sprijina pe
          // un lant de procente care se prabuseste. Prima versiune a ajuns
          // in productie cu poze de 3241x2937 px, fiindca parintele isi lua
          // inaltimea din continut iar copilul cerea 100% din ea - circular.
          // Pozitionata absolut, cutia are inaltime proprie, iar continutul
          // n-o mai poate umfla.
          //
          // Oglindirea si neclaritatea sunt scrise ca stil, nu ca utilitare
          // Tailwind. Tot prima versiune le-a pierdut pe drum: markup-ul nou
          // a ajuns in productie cu CSS care nu continea clasele, si atunci
          // `transform` si `filter` erau pur si simplu `none`. Scrise aici,
          // nu depind de ce a apucat sa fie generat.
          //
          // Daca fotografia e mai lata decat caseta, cea din mijloc o umple
          // singura si oglinzile ies din cadru - adica exact purtarea de
          // dinainte, fara nimic in plus.
          <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
            <img src={person.profile_image} alt="" aria-hidden="true" style={FUNDAL} className="absolute inset-0 h-full w-full object-cover" />
            <img src={person.profile_image} alt={person.full_name} style={TOPIRE} className="relative mx-auto h-full w-auto max-w-none" />
          </div>
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
        {person.referee_category && (
          <span className="text-xs font-bold uppercase tracking-wide text-brand-red">
            {person.referee_category}
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
