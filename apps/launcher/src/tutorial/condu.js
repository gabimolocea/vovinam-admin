/**
 * Codul care conduce aplicatia inglobata, dintr-un singur loc.
 *
 * Un <webview> e alt document: nu se poate umbla in el din React, doar
 * trimitandu-i cod cu executeJavaScript. Ca sa nu se imprastie bucatile de
 * JavaScript-ca-text prin componente, stau toate aici si se intorc mereu cu
 * `true`/`false` - a gasit sau n-a gasit - ca panoul sa poata spune pe fata
 * cand un pas n-a nimerit nimic.
 *
 * Cautarea e dupa textul vizibil, nu dupa clase: clasele din
 * competition-admin se schimba la fiecare retusare de stil, pe cand
 * etichetele filelor sunt chiar continutul aplicatiei. Cand se schimba si
 * ele, pasul da gres zgomotos, nu tacut.
 */

const STIL_ID = 'frvv-tutorial-stil';
const MARCAJ = 'data-frvv-tutorial';

/**
 * Trimite cod in aplicatia inglobata fara sa dea jos launcherul.
 *
 * `executeJavaScript` pe un <webview> neatasat - sau care n-a apucat
 * dom-ready - nu respinge o promisiune: arunca pe loc. Chemat din curatarea
 * unui efect React, aruncatura aia urca prin demontare si lasa fereastra
 * launcherului alba, cu tot cu panoul de control. In dezvoltare se intampla
 * de fiecare data, fiindca StrictMode monteaza si demonteaza o data la
 * inceput; in sala, de fiecare data cand operatorul iese din aplicatie
 * inainte sa fi intrat pagina.
 *
 * Intoarce `false` cand n-a avut unde trimite - acelasi raspuns ca un pas
 * care n-a gasit nimic, deci cine cheama n-are nevoie de alt drum.
 */
export function trimiteInAplicatie(webview, js) {
  try {
    return Promise.resolve(webview?.executeJavaScript(js)).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Daca aplicatia inglobata si-a desenat deja bara de file.
 *
 * `dom-ready` vine mult mai devreme decat crede oricine: documentul exista,
 * dar React abia urmeaza sa aduca datele competitiei si sa randeze filele.
 * Un ghid pornit in clipa aia cauta intr-un ecran care inca se construieste
 * si rateaza primul pas - singurul pe care omul il vede sigur.
 *
 * Cerem cel putin trei file gasite, nu una: pe ecranul de autentificare al
 * aplicatiei se poate nimeri un singur cuvant la fel.
 */
export function jsAreFile(etichete) {
  return `(() => {
    const cautate = ${JSON.stringify(etichete.map((e) => e.trim().toLowerCase()))};
    const texte = [...document.querySelectorAll('a')].map((a) => (a.textContent || '').trim().toLowerCase());
    return cautate.filter((e) => texte.includes(e)).length >= 3;
  })()`;
}

/** Trece aplicatia pe fila ceruta, apasand chiar tab-ul ei. Nu incarcam
 * adresa din nou: aplicatia e un SPA, iar un loadURL ar lua-o de la capat,
 * cu secunde de ecran gol la fiecare pas. */
export function jsMergiLaFila(eticheta) {
  return `(() => {
    const cautat = ${JSON.stringify(eticheta)}.trim().toLowerCase();
    const link = [...document.querySelectorAll('a')]
      .find((a) => (a.textContent || '').trim().toLowerCase() === cautat);
    if (!link) return false;
    link.click();
    return true;
  })()`;
}

/** Incercuieste un element, dupa textul lui. Intai eticheta tab-ului
 * (mereu acolo), altfel textul cerut de pas. */
export function jsEvidentiaza(text) {
  return `(() => {
    document.querySelectorAll('[${MARCAJ}]').forEach((n) => n.removeAttribute('${MARCAJ}'));
    if (!document.getElementById('${STIL_ID}')) {
      const stil = document.createElement('style');
      stil.id = '${STIL_ID}';
      stil.textContent = '[${MARCAJ}]{outline:3px solid #da3b26 !important;outline-offset:3px;border-radius:6px;box-shadow:0 0 0 9999px rgba(23,37,64,.18)!important;position:relative;z-index:9999}';
      document.head.appendChild(stil);
    }
    const cautat = ${JSON.stringify(text)}.trim().toLowerCase();
    const tinta = [...document.querySelectorAll('a,button,h1,h2,h3,label,span,div,th,td')]
      .find((n) => n.children.length <= 2 && (n.textContent || '').trim().toLowerCase() === cautat);
    if (!tinta) return false;
    tinta.setAttribute('${MARCAJ}', '');
    tinta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  })()`;
}

/** Scoate orice urma a ghidului din aplicatie. Se cheama si la inchidere, si
 * cand operatorul iese din aplicatie cu ghidul deschis - altfel ar ramane
 * conturul rosu pe ecran in timpul competitiei. */
export function jsCurata() {
  return `(() => {
    document.querySelectorAll('[${MARCAJ}]').forEach((n) => n.removeAttribute('${MARCAJ}'));
    document.getElementById('${STIL_ID}')?.remove();
    return true;
  })()`;
}
