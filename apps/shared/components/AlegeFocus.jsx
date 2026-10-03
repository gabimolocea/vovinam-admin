import { useRef, useState } from 'react';
import { FOCUS_IMPLICIT, stilFocus } from '../lib/profileImage';

/**
 * Alegerea punctului de focus al unei poze de profil: omul apasa pe fata.
 *
 * Nu e un decupator. Un decupator taie o data, pentru o forma - dar aceeasi
 * fotografie apare pe site in patru forme diferite, si ce incadreaza bine
 * cardul lat iese gresit in bulina rotunda. Aici nu se taie nimic: se
 * retine un punct, iar fiecare loc de afisare il da lui `object-position`.
 *
 * De-asta previzualizarile de dedesubt sunt tocmai formele adevarate, cu
 * dimensiunile din pagini. Omul nu trebuie sa-si imagineze rezultatul, si
 * nici sa afle abia dupa aprobare ca intr-una din ele e taiat.
 *
 * Se poate apasa si cu tastatura: sagetile mut punctul din 2 in 2 procente,
 * fiindca o poza de profil e, pentru multi, singurul lucru din aplicatie pe
 * care tin sa-l aranjeze ei insisi.
 */

// Formele in care ajunge aceeasi poza, cu rapoartele din pagini.
const FORME = [
  { nume: 'Card arbitru', clasa: 'w-32', raport: '15 / 8' },
  { nume: 'Pagina de sportiv', clasa: 'w-24', raport: '3 / 2' },
  { nume: 'Meniu', clasa: 'w-10 rounded-full', raport: '1 / 1' },
];

export default function AlegeFocus({ src, focus, onChange, alt = 'Poza aleasă' }) {
  const refImagine = useRef(null);
  const [tras, setTras] = useState(false);

  const punct = {
    x: focus?.x ?? FOCUS_IMPLICIT.x,
    y: focus?.y ?? FOCUS_IMPLICIT.y,
  };

  function dinEveniment(e) {
    const nod = refImagine.current;
    if (!nod) return null;
    const cadru = nod.getBoundingClientRect();
    if (!cadru.width || !cadru.height) return null;
    const x = Math.round(((e.clientX - cadru.left) / cadru.width) * 100);
    const y = Math.round(((e.clientY - cadru.top) / cadru.height) * 100);
    return {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    };
  }

  function muta(e) {
    const nou = dinEveniment(e);
    if (nou) onChange(nou);
  }

  function laTasta(e) {
    const pas = 2;
    const mutari = {
      ArrowLeft: { x: -pas, y: 0 },
      ArrowRight: { x: pas, y: 0 },
      ArrowUp: { x: 0, y: -pas },
      ArrowDown: { x: 0, y: pas },
    };
    const mutare = mutari[e.key];
    if (!mutare) return;
    e.preventDefault();
    onChange({
      x: Math.min(100, Math.max(0, punct.x + mutare.x)),
      y: Math.min(100, Math.max(0, punct.y + mutare.y)),
    });
  }

  const persoana = { profile_image_focus_x: punct.x, profile_image_focus_y: punct.y };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Apasă pe față</p>
        <p className="text-xs text-muted-foreground">
          Poza nu se taie. Doar ținem minte unde să se uite, ca să fie bine încadrată peste tot.
        </p>
      </div>

      {/* Cadrul se strange pe poza, nu invers.
          Daca ar fi fost o caseta lata cu poza `object-contain` inauntru,
          socoteala procentelor s-ar fi facut pe caseta - si atunci un clic
          pe marginea fotografiei ar fi dat alt procent decat cel adevarat,
          cu atat mai gresit cu cat benzile laterale sunt mai late. Asa,
          dreptunghiul masurat e chiar poza. */}
      <div className="flex justify-center">
        <div
          ref={refImagine}
          role="slider"
          tabIndex={0}
          aria-label="Punctul pe care se încadrează poza"
          aria-valuetext={`${punct.x}% de la stânga, ${punct.y}% de sus`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={punct.y}
          onKeyDown={laTasta}
          onPointerDown={(e) => { setTras(true); e.currentTarget.setPointerCapture(e.pointerId); muta(e); }}
          onPointerMove={(e) => { if (tras) muta(e); }}
          onPointerUp={() => setTras(false)}
          onPointerCancel={() => setTras(false)}
          className="relative inline-block cursor-crosshair touch-none overflow-hidden rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-brand-red"
        >
          <img src={src} alt={alt} draggable={false} className="block max-h-80 max-w-full" />
          <span
            aria-hidden="true"
            style={{ left: `${punct.x}%`, top: `${punct.y}%` }}
            className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-red/30 shadow-[0_0_0_2px_rgba(0,0,0,.35)]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Așa va arăta</p>
        <div className="flex flex-wrap items-end gap-4">
          {FORME.map((forma) => (
            <figure key={forma.nume} className="m-0 flex flex-col items-center gap-1">
              <div className={`overflow-hidden rounded-lg bg-muted ${forma.clasa}`} style={{ aspectRatio: forma.raport }}>
                <img
                  src={src}
                  alt=""
                  style={stilFocus(persoana)}
                  className={`h-full w-full object-cover ${forma.clasa.includes('rounded-full') ? 'rounded-full' : ''}`}
                />
              </div>
              <figcaption className="text-[11px] text-muted-foreground">{forma.nume}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
