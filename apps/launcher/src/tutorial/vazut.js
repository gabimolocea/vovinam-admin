// Daca omul a mai vazut ghidul Panoului Competitie pe calculatorul asta.
//
// Ghidul se deschide singur prima data - e singurul moment in care chiar
// ajuta, fiindca atunci nimeni nu stie ce sa caute. A doua oara ar fi in
// drum, asa ca de atunci sta in butonul plutitor.
//
// Tinut in localStorage, nu in preferintele din Electron: e o stare a
// ferestrei, nu ceva ce trebuie sa stie si procesul principal. Si e per
// calculator, nu per cont - ghidul e despre cum arata aplicatia, nu despre
// cine s-a autentificat.
//
// Cheia are versiune in ea. Cand pasii se schimba serios, se trece la
// `-v2` si ghidul se arata din nou o data, inclusiv celor care l-au vazut.

const CHEIE = 'frvv:ghid-competitie-vazut-v1';

export function ghidulAFostVazut() {
  try {
    return window.localStorage.getItem(CHEIE) === 'da';
  } catch {
    // Fara localStorage (mod privat, stocare blocata) ghidul se arata la
    // fiecare deschidere. Enervant, dar nu stricat - si nu se intampla
    // intr-un Electron normal.
    return false;
  }
}

export function tineMinteCaAFostVazut() {
  try {
    window.localStorage.setItem(CHEIE, 'da');
  } catch {
    // Vezi mai sus: se pierde preferinta, nu functionalitatea.
  }
}
