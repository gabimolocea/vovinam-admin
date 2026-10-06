// Pornit sau oprit, tinut minte pe calculatorul asta.
//
// Indrumarea e pentru cineva care tine masa prima oara. Cine a facut-o de
// zeci de ori nu mai are nevoie de ea, iar bulele care cer "Da" la fiecare
// proba devin un pas in plus de apasat. Deci se poate stinge - si ramane
// stinsa, ca sa nu fie stinsa din nou la fiecare deschidere.
//
// Pe calculator, nu pe cont: la masa centrala se schimba oamenii pe acelasi
// laptop, iar setarea asta descrie ecranul, nu persoana.

// Acelasi nume e scris si de meniul launcherului (View > Ghid interactiv, in
// apps/launcher/electron/main.js): el pune cheia direct in localStorage-ul
// paginii, fiindca nu poate importa de aici. Daca se schimba, se schimba in
// amandoua locurile.
const CHEIE = 'ghidInteractiv';

export function ghidPornit() {
  try {
    return localStorage.getItem(CHEIE) !== 'off';
  } catch {
    // Mod privat sau spatiu plin: pornit, ca la prima folosire.
    return true;
  }
}

export function setGhid(pornit) {
  try {
    if (pornit) localStorage.removeItem(CHEIE);
    else localStorage.setItem(CHEIE, 'off');
  } catch {
    // Nu se poate tine minte; ramane doar pentru sesiunea asta.
  }
}

// Comutatorul nu mai e in pagina, e in meniul aplicatiei (View > Ghid
// interactiv). Meniul scrie direct in localStorage-ul paginii si da de veste cu
// evenimentul de mai jos; fara el, pagina ar fi aflat de schimbare doar la
// reincarcare. 'storage' prinde celelalte ferestre deschise pe aceeasi masa.
export function ascultaGhidul(cheama) {
  const reciteste = () => cheama(ghidPornit());
  window.addEventListener('frvv:ghid', reciteste);
  window.addEventListener('storage', reciteste);
  return () => {
    window.removeEventListener('frvv:ghid', reciteste);
    window.removeEventListener('storage', reciteste);
  };
}

// Rulam in launcher sau intr-un browser obisnuit?
//
// In launcher comutatorul sta in meniul aplicatiei (View > Ghid interactiv), si
// atunci n-are rost sa mai apara si in pagina. Intr-un browser meniul ala nu
// exista, deci pagina trebuie sa-si poarte singura meniul ei.
export function inLauncher() {
  try {
    return /electron/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}
