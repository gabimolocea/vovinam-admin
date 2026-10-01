// Launcherul se anunta in retea cu un nume fix.
//
// Placutele arbitrilor (ESP32, vezi devices/referee-esp32c3) trebuie sa
// gaseasca serverul din sala. Pana acum aveau in firmware adresa IP a unui
// anume laptop, iar ca plasa de siguranta numele lui de retea -
// "Gabis-MacBook-Pro". Amandoua leaga placutele de un singur calculator:
// alt laptop, alta retea, sau pur si simplu alt IP dat de router, si ele
// tac fara sa spuna de ce.
//
// Aici raspundem noi la numele `frvv-sala.local`, indiferent pe ce
// calculator rulam si ce adresa ne-a dat routerul. Placutele intreaba
// numele, primesc adresa de acum, si merg mai departe. Nimic de
// reprogramat, nimic de configurat pe router.
//
// De ce raspundem singuri in loc sa ne bazam pe sistem: macOS isi anunta
// numele de la sine, dar Windows nu - acolo nu exista Bonjour decat daca
// l-a instalat cineva. Un singur fel de a functiona pe amandoua e mai bun
// decat doua feluri, dintre care unul lipseste tocmai pe calculatorul
// imprumutat in ziua competitiei.

const os = require('os');

const makeMdns = require('multicast-dns');

// Numele pe care il cauta placutele. Daca se schimba aici, trebuie schimbat
// si in devices/referee-esp32c3/referee-esp32c3.ino (API_MDNS_NAME) - si
// atunci toate placutele trebuie reprogramate, deci nu se schimba.
const NUME = 'frvv-sala';
const NUME_COMPLET = `${NUME}.local`;

// Cat timp tine raspunsul nostru in memoria celui care a intrebat. Scurt:
// adresa laptopului se poate schimba in timpul zilei (o trecere pe alt
// Wi-Fi), iar o placuta care tine minte o adresa veche doua minute e o
// placuta moarta doua minute.
const TTL_SECUNDE = 30;

let server = null;
let adresa = null;

function caIntreg(ip) {
  return ip.split('.').reduce((acc, parte) => (acc << 8) + Number(parte), 0) >>> 0;
}

/**
 * Adresa noastra de pe aceeasi retea cu cel care intreaba.
 *
 * Conteaza cand calculatorul e in doua retele odata - si asta nu e un caz
 * rar: un Mac care face hotspot e si pe Wi-Fi-ul casei, si pe reteaua pe
 * care o imparte el. Daca am raspunde mereu cu aceeasi adresa, placutele de
 * pe hotspot ar primi adresa din cealalta retea, la care nu pot ajunge - si
 * ar tacea, dupa ce tocmai au gasit numele.
 *
 * `intrebator` e adresa de la care a venit intrebarea; cautam interfata
 * noastra a carei retea o contine.
 */
function adresaPentru(intrebator, interfete = os.networkInterfaces()) {
  if (!intrebator) return null;
  const tinta = caIntreg(intrebator);

  for (const adrese of Object.values(interfete)) {
    for (const a of adrese || []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const masca = caIntreg(a.netmask);
      if ((caIntreg(a.address) & masca) === (tinta & masca)) return a.address;
    }
  }
  return null;
}

function raspundeLa(intrebare) {
  if (!adresa) return false;
  const nume = String(intrebare.name || '').toLowerCase();
  if (nume !== NUME_COMPLET) return false;
  // A = adresa IPv4. ANY inseamna "orice stii despre numele asta".
  return intrebare.type === 'A' || intrebare.type === 'ANY';
}

/**
 * Porneste raspunsul la nume. Se cheama cu adresa laptopului in retea,
 * dupa ce stiva locala a pornit.
 *
 * Nu arunca niciodata: portul mDNS poate fi ocupat (pe Windows, de Bonjour
 * instalat cu alt program), iar asta nu e un motiv sa nu porneasca
 * competitia. Placutele au mai departe adresa din firmware.
 */
function start(lanIp, { onLog } = {}) {
  const spune = onLog || (() => {});
  adresa = lanIp;

  if (server) return;

  try {
    server = makeMdns({ loopback: true, reuseAddr: true });
  } catch (eroare) {
    spune(`Nu m-am putut anunta in retea ca ${NUME_COMPLET}: ${eroare.message}`);
    server = null;
    return;
  }

  server.on('error', (eroare) => {
    spune(`Anuntul in retea a dat o eroare: ${eroare.message}`);
  });

  server.on('query', (query, rinfo) => {
    const intrebari = (query.questions || []).filter(raspundeLa);
    if (!intrebari.length) return;

    // Adresa de pe reteaua celui care intreaba; daca nu o putem afla,
    // cea cu care am pornit.
    const data = adresaPentru(rinfo?.address) || adresa;
    if (!data) return;

    server.respond({
      answers: [{
        name: NUME_COMPLET,
        type: 'A',
        ttl: TTL_SECUNDE,
        data,
      }],
    });
  });

  spune(`Ma anunt in retea ca ${NUME_COMPLET} (${adresa}).`);
}

/** Adresa s-a schimbat - de exemplu s-a trecut pe alt Wi-Fi. */
function update(lanIp) {
  adresa = lanIp;
}

function stop() {
  if (!server) return;
  try {
    server.destroy();
  } catch {
    // Se inchide oricum odata cu aplicatia.
  }
  server = null;
}

module.exports = { start, update, stop, adresaPentru, NUME, NUME_COMPLET };
