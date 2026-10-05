// Sesiunea mesei centrale, tinuta minte pe calculatorul din sala.
//
// Dreptul adevarat sta in token si e verificat de server la fiecare scriere
// (vezi backend/api/permissions.py). Ce se tine aici e doar atat cat sa stie
// interfata pe ce teren e si pe cine sa scrie in colt - ca sa nu fie nevoie
// sa desfaca tokenul ca sa afle.

const CHEIE = 'masaCentrala';

export function salveazaMasa({ field, referee, eventId }) {
  try {
    localStorage.setItem(CHEIE, JSON.stringify({ field, referee, eventId }));
  } catch {
    // Mod privat sau spatiu plin: sesiunea merge mai departe, doar ca pagina
    // nu mai stie sa spuna cine sta la masa.
  }
}

export function citesteMasa() {
  try {
    const brut = localStorage.getItem(CHEIE);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

export function stergeMasa() {
  try {
    localStorage.removeItem(CHEIE);
  } catch {
    // Nimic de facut; tokenul expira oricum.
  }
}
