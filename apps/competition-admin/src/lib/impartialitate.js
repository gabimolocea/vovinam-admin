// Cat de diferit noteaza un arbitru sportivii propriului club.
//
// ─────────────────────────── CUM SE MASOARA ───────────────────────────
//
// Nu se compara notele intre ele - un sportiv bun ia note mari de la toti, iar
// asta n-ar insemna nimic. Se compara fiecare arbitru cu RESTUL JURIULUI, pe
// aceeasi prestatie:
//
//     abatere(arbitru, sportiv) = nota lui − mediana notelor celorlalti
//
// Mediana, nu media: cu cinci arbitri, un singur coleg iesit din rand ar trage
// reperul dupa el.
//
// Apoi, pentru fiecare arbitru:
//
//     semnal = media abaterilor la sportivii clubului sau
//            − media abaterilor la ceilalti sportivi
//
// Scaderea a doua conteaza: un arbitru poate fi pur si simplu mai sever sau mai
// bland decat colegii lui, cu toata lumea. Aia nu e partinire, e stil - si se
// anuleaza singura in diferenta.
//
// ──────────────────────────── CE NU E ASTA ────────────────────────────
//
// Nu e o dovada si nu e o acuzatie. E un numar care spune unde merita sa se
// uite un om. Cu doi-trei sportivi de club, numarul e zgomot - de aia se
// raporteaza intotdeauna si CATI sportivi stau in spatele lui, iar sub doi nu
// se marcheaza nimic.
//
// De stiut si ca regulamentul apara deja partial: nota cea mai mare si cea mai
// mica se arunca, deci un singur arbitru partinitor rareori schimba rezultatul.
// Ce prinde masuratoarea asta e tiparul, nu o nota anume.

// Sub atatia sportivi de club, numarul nu spune nimic.
const MINIM_SPORTIVI = 2;
// Peste atatea puncte diferenta, merita o privire de om.
const PRAG_SEMNAL = 2;

function mediana(valori) {
  const v = valori.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const medie = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

function rezultat({ arbitru, club, proprii, altii }) {
  const mProprii = medie(proprii);
  const mAltii = medie(altii);
  // Reperul lipsa inseamna zero, nu "nu stim".
  //
  // Abaterea e deja masurata fata de restul juriului, deci un arbitru cinstit
  // iese pe zero prin constructie. Scaderea mediei la ceilalti sportivi e doar
  // ca sa anuleze severitatea uniforma a omului. Cand nu exista "ceilalti" -
  // la un meci unde clubul lui e intr-un colt, toate rundele sunt "ale lui" -
  // nu avem ce anula, iar reperul ramane zero.
  //
  // Scris cum era, numarul masurat se pierdea tocmai in cazul pentru care a
  // fost facuta masuratoarea.
  const diferenta = mProprii == null ? null : mProprii - (mAltii ?? 0);
  return {
    arbitru,
    club: club || '—',
    nProprii: proprii.length,
    nAltii: altii.length,
    medieProprii: mProprii,
    medieAltii: mAltii,
    diferenta,
    // Trei stari, nu doua: "prea putine date" nu e acelasi lucru cu "curat".
    semnal: proprii.length < MINIM_SPORTIVI
      ? 'date putine'
      : (diferenta != null && Math.abs(diferenta) >= PRAG_SEMNAL ? 'de verificat' : 'în regulă'),
  };
}

/**
 * Proba de tehnica sau echipe.
 *
 * `randuri`: [{ clubName, vals }] - vals in ordinea coloanelor.
 * `coloane`: [{ id, name }] - arbitrii, pe pozitii.
 * `clubArbitru`: Map(athleteId -> numele clubului).
 */
export function abateriTehnica({ randuri = [], coloane = [], clubArbitru = new Map() }) {
  return coloane.map((col, i) => {
    if (!col?.id) return null;
    const clubLui = clubArbitru.get(col.id) || null;
    const proprii = [];
    const altii = [];

    for (const r of randuri) {
      const a = Number(r.vals?.[i]);
      if (!Number.isFinite(a)) continue;
      const ceilalti = coloane
        .map((c, j) => (j === i || !c?.id ? null : Number(r.vals?.[j])))
        .filter(x => Number.isFinite(x));
      // Sub doi colegi nu exista reper cu care sa fie comparat.
      if (ceilalti.length < 2) continue;
      const abatere = a - mediana(ceilalti);
      const alClubului = clubLui && r.clubName && r.clubName === clubLui;
      (alClubului ? proprii : altii).push(abatere);
    }

    return rezultat({ arbitru: col.name || `A${i + 1}`, club: clubLui, proprii, altii });
  }).filter(Boolean);
}

/**
 * Un meci de lupta.
 *
 * Aici "nota" e marginea pe care arbitrul o da unui colt:
 *     marja = puncte colt propriu − puncte colt advers
 * si se compara tot cu mediana colegilor, pe acelasi meci.
 *
 * `noteArbitri`: [{ referee, red_corner_score, blue_corner_score }]
 * `clubRosu` / `clubAlbastru`: numele cluburilor din cele doua colturi.
 */
export function abateriLupta({ noteArbitri = [], clubRosu, clubAlbastru, clubArbitru = new Map(), numeArbitru = new Map() }) {
  const perArbitru = new Map();
  for (const n of noteArbitri) {
    if (!n?.referee) continue;
    const rosu = Number(n.red_corner_score);
    const albastru = Number(n.blue_corner_score);
    if (!Number.isFinite(rosu) || !Number.isFinite(albastru)) continue;
    if (!perArbitru.has(n.referee)) perArbitru.set(n.referee, []);
    perArbitru.get(n.referee).push(rosu - albastru);   // marja pentru rosu
  }

  const arbitri = [...perArbitru.keys()];
  return arbitri.map(id => {
    const clubLui = clubArbitru.get(id) || null;
    // Pe ce colt are club in meciul asta? Daca pe niciunul, n-avem ce masura.
    const semnColtPropriu = clubLui && clubLui === clubRosu ? 1
      : (clubLui && clubLui === clubAlbastru ? -1 : 0);

    const proprii = [];
    const altii = [];
    perArbitru.get(id).forEach((marjaRosu, runda) => {
      const ceilalti = arbitri
        .filter(x => x !== id)
        .map(x => perArbitru.get(x)?.[runda])
        .filter(x => Number.isFinite(x));
      if (ceilalti.length < 2) return;
      const abatere = marjaRosu - mediana(ceilalti);
      if (semnColtPropriu) proprii.push(abatere * semnColtPropriu);
      else altii.push(abatere);
    });

    return rezultat({ arbitru: numeArbitru.get(id) || `#${id}`, club: clubLui, proprii, altii });
  });
}

export const PRAGURI = { MINIM_SPORTIVI, PRAG_SEMNAL };
