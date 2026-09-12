import { Timer, Hourglass, Users, CheckCircle2, Star, Award, Flag } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui';

const SCORING_ONE_POINT = [
  { title: 'Lovitură eficientă (Corp)', text: 'Pumn sau picior.', decis: 'CoRe' },
  { title: 'Lovitură eficientă (Cap)', text: 'Pumn.', decis: 'CoRe' },
  { title: 'Doborâre (Takedown)', text: 'Cauzarea căderii adversarului prin atingerea solului cu orice parte a corpului (exceptând picioarele). Fără prinderea picioarelor.', decis: 'CeRe' },
  { title: 'DCTC Simplu', text: 'Executarea cu succes a tehnicilor Đòn Chân Tấn Công #3 sau #6.', decis: 'CeRe' },
];

const SCORING_TWO_POINTS = [
  { title: 'Picior la Cap', text: 'Lovitură eficientă.', decis: 'CoRe' },
  { title: 'Atac Serial', text: 'Combo eficient pumn + picior.', decis: 'CoRe' },
  { title: 'Contra-atac (Phản Đòn/Chém Quét)', text: 'Tehnici care duc la căderea adversarului, sportivul rămânând în picioare.', decis: 'CeRe' },
  { title: 'Knockdown', text: 'Adversarul este doborât pentru numărătoare.', decis: 'CeRe' },
  { title: 'DCTC Avansat', text: 'Execuție superioară a tehnicilor #3, #6, #7, #8, #9, #10.', decis: 'CeRe' },
];

const DCTC_TIERS = [
  { points: '+2 puncte', color: 'bg-[#0a4c75] text-white', text: ["Tehnici #3 sau #6 → Adversarul cade pe spate.", "Tehnici #7-10 → Adversarul cade sau „zboară” > 1 metru."] },
  { points: '+1 punct', color: 'bg-[#5b9bd5]/30 text-[#00334d]', text: ["Tehnici #3 sau #6 executate „aproape corect”. Adversarul cade pe o parte."] },
  { points: '0 puncte', color: 'bg-[#e9ecef] text-[#00334d]', text: ['Corect tehnic, dar fără putere suficientă.'] },
  { points: 'Neconsiderat', color: 'bg-[#dce0e5] text-[#00334d]/70', text: ['Execuție greșită sau ineficientă.'] },
];

const NEUTRAL_SITUATIONS = [
  { title: 'Eșec DCTC', text: 'Sportivul cade sau iese din zonă încercând un DCTC.', image: 'esec_dctc' },
  { title: 'Împingere', text: 'Ieșire din zonă cauzată de împingerea intenționată a adversarului.', image: 'impingere' },
  { title: 'Ieșire/cădere simultană', text: 'Ambii sportivi ies sau cad împreună în atac.', image: 'iesire_cadere' },
  { title: 'Clinch', text: 'Lovituri în timp ce sportivii sunt în clinch.', image: 'clinch' },
];

const FORBIDDEN_GROUPS = [
  {
    title: 'Violență și Pericol',
    image: 'violenta_icon',
    items: [
      'Atacuri la articulații, gât, zona inghinală.',
      'Lovire cu cotul, genunchiul sau „Topor” (Đá Búa).',
      'Atac asupra adversarului căzut la sol.',
    ],
  },
  {
    title: 'Încălcări Tehnice',
    image: 'incalcari_icon',
    items: [
      'Prinderea piciorului „afară-înăuntru”.',
      'Utilizarea tehnicilor de luptă (Vặt) sau DCTC interzise (#1, 2, 4, 5, 11-21).',
    ],
  },
  {
    title: 'Comportament',
    image: 'comportament_icon',
    items: [
      'Comportament nesportiv, simularea accidentării, pasivitate.',
      'Utilizarea drogurilor.',
    ],
  },
];

const SUMMARY_ROWS = [
  ['Runde', '3x2min (Seniori) / 2x2min (Juniori)'],
  ['Punctaj maxim', '2 puncte (atacuri cap / combo / DCTC)'],
  ['Lovituri interzise', 'Cot, genunchi, topor'],
  ['DCTC interzis', 'Runda 3 și Extra'],
  ['Descalificare', 'La 3 avertismente'],
];

/** Illustrated "quick rules" landing content for the /regulament page,
 * adapted from the federation's "Reguli pe scurt: Competiții de luptă EVVF
 * 2024" visual guide PDF - recreated as responsive on-brand sections
 * (rather than embedding the flat slide images) so it reflows properly on
 * mobile and matches the rest of the site's look. */
export default function RegulamentLuptaSection() {
  return (
    <div className="flex flex-col gap-16">
      <section className="text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-[#da3b26]">Un ghid vizual pentru sportivi, antrenori și arbitri</p>
        <h1 className="text-fluid-display font-display mt-1 font-bold text-[#00334d]">
          Reguli pe scurt: Competiții de luptă EVVF 2024
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
          Bazat pe reglementările oficiale European Vovinam Việt Võ Đạo Federation (EVVF).
        </p>
      </section>

      {/* Structura temporală */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Structura temporală a meciului</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            { label: 'Seniori', rounds: '3 Runde', duration: '2 Minute per rundă' },
            { label: 'Juniori', rounds: '2 Runde', duration: '2 Minute per rundă' },
          ].map((group) => (
            <Card key={group.label}>
              <CardHeader>
                <CardTitle className="text-2xl">{group.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 shrink-0 text-[#0a4c75]" />
                  <span>{group.rounds}</span>
                </div>
                <div className="flex items-center gap-3 border-t border-border pt-3">
                  <Timer className="h-5 w-5 shrink-0 text-[#0a4c75]" />
                  <span>{group.duration}</span>
                </div>
                <div className="flex items-center gap-3 border-t border-border pt-3">
                  <Hourglass className="h-5 w-5 shrink-0 text-[#0a4c75]" />
                  <span>1 Minut pauză</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-lg border-2 border-[#edb654] bg-[#edb654]/10 px-4 py-3 text-sm">
          <Timer className="h-5 w-5 shrink-0 text-[#edb654]" />
          <span><strong>Egalitate:</strong> Runda de „Aur” (Extra Round) - 2 minute.</span>
        </div>
      </section>

      {/* Oficialii */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Oficialii și rolurile lor</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-center">
          <img
            src="/regulament/arena.webp"
            alt="Diagrama arenei de luptă cu pozițiile celor 4 arbitri de colț (CoRe), arbitrul central (CeRe) și sportivul"
            className="mx-auto w-full min-w-0 max-w-md"
          />
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-sky-600" />
                  <CardTitle className="text-base">CoRe <span className="font-normal text-muted-foreground">(Arbitrii de Colț - 4 persoane)</span></CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Evaluează exclusiv impacturile pentru Punctele 1 și 2.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#da3b26]" />
                  <CardTitle className="text-base">CeRe <span className="font-normal text-muted-foreground">(Arbitrul Central - 1 persoană)</span></CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Gestionează penalități, ieșiri din spațiu, căderi și validează tehnicile Đòn Chân Tấn Công.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#00334d]" />
                  <CardTitle className="text-base">Masa <span className="font-normal text-muted-foreground">(Arbitrul de Masă)</span></CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Înregistrează penalitățile dictate de CeRe.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Zonele de punctaj */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Zonele de punctaj vs. zone interzise</h2>
        <img
          src="/regulament/body.webp"
          alt="Diagramă a corpului sportivului cu zonele de punctaj valide (cap, corp) și zonele interzise (ceafă, spate, sub talie, mâini și picioare)"
          className="mx-auto mt-6 w-full max-w-3xl"
        />
      </section>

      {/* Cum castigi puncte */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Cum câștigi puncte</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 font-display text-lg font-semibold text-[#0a4c75]">1 punct</h3>
            <div className="flex flex-col gap-3">
              {SCORING_ONE_POINT.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-lg border border-border p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                  <div className="text-sm">
                    <p className="font-semibold text-[#00334d]">{item.title}</p>
                    <p className="text-muted-foreground">{item.text} <span className="text-xs">(Decis de {item.decis})</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-semibold text-[#da3b26]">2 puncte (tehnici avansate)</h3>
            <div className="flex flex-col gap-3">
              {SCORING_TWO_POINTS.map((item) => (
                <div key={item.title} className="flex gap-3 rounded-lg border border-border p-4">
                  <Star className="mt-0.5 h-5 w-5 shrink-0 text-[#da3b26]" />
                  <div className="text-sm">
                    <p className="font-semibold text-[#00334d]">{item.title}</p>
                    <p className="text-muted-foreground">{item.text} <span className="text-xs">(Decis de {item.decis})</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Spotlight DCTC */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Spotlight: evaluarea Đòn Chân Tấn Công (DCTC)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Decizii luate exclusiv de Arbitrul Central (CeRe).</p>
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          {DCTC_TIERS.map((tier) => (
            <div key={tier.points} className={`flex flex-col gap-1 px-5 py-4 ${tier.color}`}>
              <p className="font-display text-lg font-bold">{tier.points}</p>
              {tier.text.map((line) => <p key={line} className="text-sm">{line}</p>)}
            </div>
          ))}
        </div>
      </section>

      {/* Situatii neutre */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Situații fără puncte (neutru)</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NEUTRAL_SITUATIONS.map((item) => (
            <Card key={item.title}>
              <CardContent className="flex flex-col items-center gap-2 pt-5 text-center text-sm">
                <img src={`/regulament/${item.image}.webp`} alt="" className="h-20 w-20 object-contain" />
                <p className="font-display font-semibold text-[#00334d]">{item.title}</p>
                <p className="text-muted-foreground">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-sm italic text-muted-foreground">
          Notă: când sportivul cade în afara arenei, nu se dau puncte minus suplimentare.
        </p>
      </section>

      {/* Penalitati */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Matematica penalităților (puncte minus)</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex gap-4 rounded-lg border border-border p-5">
            <span className="font-display text-4xl font-bold text-[#da3b26]">-1</span>
            <p className="self-center text-sm text-muted-foreground">Ieșire din zona de luptă (cu cel puțin o parte a piciorului).</p>
          </div>
          <div className="flex gap-4 rounded-lg border border-border p-5">
            <span className="font-display text-4xl font-bold text-[#da3b26]">-2</span>
            <ul className="list-disc self-center pl-4 text-sm text-muted-foreground">
              <li>Primirea unui Avertisment (Cảnh Cáo).</li>
              <li>Acumularea a 3 Abateri (Nhắc Nhở).</li>
              <li>Executarea unui Đòn Chân Tấn Công în Runda 3 sau în Runda Suplimentară.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Actiuni interzise */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Acțiuni interzise (siguranță și etică)</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {FORBIDDEN_GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <img src={`/regulament/${group.image}.webp`} alt="" className="h-12 w-auto" />
                <CardTitle className="text-base">{group.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
                {group.items.map((item) => <p key={item}>{item}</p>)}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Ierarhia sanctiunilor */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Ierarhia sancțiunilor</h2>
        <img
          src="/regulament/sanctiuni.webp"
          alt="Ierarhia sancțiunilor: Abateri (Nhắc Nhở) pentru încălcări minore, Avertisment (Cảnh Cáo) automat la 3 abateri sau încălcare gravă (cost -2 puncte), Descalificare la 3 avertismente"
          className="mx-auto mt-6 w-full max-w-3xl"
        />
      </section>

      {/* Sumar esential */}
      <section>
        <h2 className="text-fluid-h2 font-display font-bold text-[#00334d]">Sumar esențial</h2>
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody>
              {SUMMARY_ROWS.map(([label, value], i) => (
                <tr key={label} className={i % 2 === 0 ? 'bg-[#e9ecef]/60' : ''}>
                  <th scope="row" className="w-1/3 whitespace-nowrap px-5 py-3 text-left font-semibold text-[#00334d]">{label}</th>
                  <td className="px-5 py-3 text-muted-foreground">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Award className="h-4 w-4 shrink-0" />
          Sursă: European Vovinam Việt Võ Đạo Federation (EVVF) — Registration number W921002086, www.vovinam-evvf.eu
        </p>
      </section>

      <section className="rounded-lg bg-[#0c223d] px-6 py-10 text-center text-white">
        <div className="flex items-center justify-center gap-2 text-lg font-display font-bold uppercase tracking-wide">
          <Flag className="h-5 w-5 text-[#edb654]" />
          Respect. Disciplină. Performanță.
        </div>
      </section>
    </div>
  );
}
