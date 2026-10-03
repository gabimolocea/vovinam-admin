/**
 * Unde se uita ochiul intr-o poza de profil.
 *
 * Aceeasi fotografie apare pe site in patru forme: cardul lat de
 * arbitru/staff (15/8), tabelul de sportivi si pagina de sportiv (3/2), si
 * bulina rotunda din meniul de cont. `object-fit: cover` taie ce nu incape,
 * si taie din mijloc - ceea ce, pentru un portret, lasa bustul si retrage
 * capul din cadru.
 *
 * O taiere fixa la incarcare nu rezolva: ce incadreaza bine cardul lat iese
 * gresit in bulina. Asa ca nu taiem nimic - tinem minte un punct (backend:
 * Athlete.profile_image_focus_x/y) si il dam lui `object-position`. Aceeasi
 * poza se incadreaza singura in orice forma, inclusiv in una care nu exista
 * inca.
 *
 * Implicitul e sus-centru, nu centru: altfel fotografiile deja incarcate ar
 * ramane taiate pana cand cineva le deschide pe rand. Vezi comentariul de
 * pe camp pentru de ce asta nu strica pozele late.
 */

export const FOCUS_IMPLICIT = { x: 50, y: 25 };

function procent(valoare, implicit) {
  const numar = Number(valoare);
  if (!Number.isFinite(numar)) return implicit;
  return Math.min(100, Math.max(0, numar));
}

/**
 * Stilul de pus pe un <img> cu `object-cover`.
 *
 * Primeste obiectul persoanei asa cum vine de la server (sportiv, arbitru,
 * membru din staff, antrenor) - toate poarta aceleasi doua campuri.
 *
 * Intoarce mereu un stil valabil, chiar si pentru un raspuns vechi care
 * n-are campurile: atunci iese implicitul, adica tot mai bine decat
 * centrul.
 */
export function stilFocus(persoana) {
  const x = procent(persoana?.profile_image_focus_x, FOCUS_IMPLICIT.x);
  const y = procent(persoana?.profile_image_focus_y, FOCUS_IMPLICIT.y);
  return { objectPosition: `${x}% ${y}%` };
}

/**
 * Acelasi lucru pentru poza aflata in asteptarea aprobarii, care isi are
 * propria pereche de campuri - altfel, cat timp noua poza asteapta, ar fi
 * aratata cu punctul ales pentru cea veche.
 */
export function stilFocusInAsteptare(persoana) {
  return stilFocus({
    profile_image_focus_x: persoana?.pending_profile_image_focus_x,
    profile_image_focus_y: persoana?.pending_profile_image_focus_y,
  });
}
