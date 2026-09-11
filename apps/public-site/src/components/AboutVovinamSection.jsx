import { Link } from 'react-router-dom';
import { Button } from './ui';

const COMPETITIONS = [
  'Tehnica (copii/juniori)',
  'Lupta light-contact (copii/juniori)',
  'Lupta full-contact (seniori)',
];

/** "Compete" pitch band for the homepage, matching the equivalent section on
 * the old vovinam.ro site (same photo, copy and "Găsește club" CTA) instead
 * of the earlier generic "Ce este Vovinam?" pillars band. */
export default function AboutVovinamSection() {
  return (
    <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
      <img
        src="/compete-section.webp"
        alt="Sportivi de Vovinam Việt Võ Đạo în timpul unui meci de luptă"
        className="aspect-[640/420] w-full rounded-2xl object-cover"
      />
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#da3b26]">Fii cel mai bun</p>
        <h2 className="text-fluid-h2 font-display mt-1 font-semibold">
          Concurează în Federația Română de Vovinam Viet-Vo-Dao.
        </h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Nu există nimic ca sentimentul de a face parte dintr-o echipă. Indiferent dacă câștigi sau pierzi, nu vei
          uita niciodată prieteniile create în timp ce practici arte marțiale vietnameze. Găsiți un club în
          apropierea dvs. și creați legături de durată cu colegii de echipă pe și în afara terenului.
        </p>
        <p className="mt-4 font-semibold">Competițiile în Federația Română de Vovinam Viet-Vo-Dao:</p>
        <ul className="mt-2 max-w-xl list-disc space-y-1 pl-5 text-muted-foreground">
          {COMPETITIONS.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <Button
          as={Link}
          to="/cluburi"
          className="mt-6 h-auto rounded-lg bg-[#da3b26] px-6 py-3 text-base font-bold uppercase tracking-wide text-white hover:bg-[#da3b26]/90"
        >
          Găsește club
        </Button>
      </div>
    </section>
  );
}
