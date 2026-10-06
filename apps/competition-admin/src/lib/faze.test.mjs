// Reconstructia fazelor, pe cazurile care conteaza.
//
// Functia se IMPORTA, nu se mai decupeaza din textul sursei.
//
// Testul citea exportMatchExcel.js de la o cale absoluta de pe calculatorul
// meu, taia bucata dintre doua nume de functii si o trecea prin `new Function`
// cu constantele scrise de mana. Mergea doar la mine: in CI cadea cu ENOENT pe
// /Users/gabimolocea/..., si oricum masura regula pe care o scria testul, nu pe
// cea din cod.
import { fazeleMeciului } from './exportMatchExcel';

// Rulat de vitest (`npm test`), ca restul testelor din proiect.
//
// Era un script de sine statator, cu propriul numarator si `process.exit` la
// final. Mergea cu `node fisier.mjs`, dar vitest il lua si el - numele se
// termina in .test.mjs - si cadea pe "process.exit unexpectedly called",
// oprind CI-ul pentru tot workspace-ul.
import { test, expect } from 'vitest';

const inregistreaza = (nume, conditie, detaliu = '') => test(nume, () => {
  expect(conditie, detaliu).toBe(true);
});
const v = inregistreaza;

const sloturi = [1,2,3,4,5].map(i => ({ pos: i, id: i, name: `Arbitru ${i}` }));
const ap = (ref, ms, side = 'red', points = 1) => ({
  referee: ref, side, points, event_type: 'score',
  metadata: { client_timestamp_ms: 1_700_000_000_000 + ms },
});

console.log('\n— trei arbitri vad faza —');
{
  const f = fazeleMeciului({ pointEvents: [ap(1, 0), ap(2, 300), ap(3, 500)], matchRefSlots: sloturi });
  v('o singura faza', f.length === 1, String(f.length));
  v('confirmata', f[0].confirmata);
  v('lipsesc doi', f[0].lipsa.length === 2, JSON.stringify(f[0].lipsa.map(x => x.pos)));
}

console.log('\n— doi nu ajung —');
{
  const f = fazeleMeciului({ pointEvents: [ap(1, 0), ap(2, 300)], matchRefSlots: sloturi });
  v('neconfirmata', !f[0].confirmata, JSON.stringify(f[0].arbitri));
  v('lipsesc trei', f[0].lipsa.length === 3);
}

console.log('\n— acelasi arbitru apasa de doua ori —');
{
  const f = fazeleMeciului({ pointEvents: [ap(1, 0), ap(1, 200), ap(2, 300)], matchRefSlots: sloturi });
  v('tot doi oameni, deci neconfirmata', !f[0].confirmata, String(f[0].arbitri.size));
}

console.log('\n— doua faze la distanta —');
{
  const f = fazeleMeciului({
    pointEvents: [ap(1, 0), ap(2, 300), ap(3, 500), ap(1, 3000), ap(2, 3200), ap(3, 3400)],
    matchRefSlots: sloturi,
  });
  v('doua faze', f.length === 2, String(f.length));
  v('amandoua confirmate', f.every(x => x.confirmata));
}

console.log('\n— colturi diferite nu se amesteca —');
{
  const f = fazeleMeciului({
    pointEvents: [ap(1, 0, 'red'), ap(2, 100, 'blue'), ap(3, 200, 'red')],
    matchRefSlots: sloturi,
  });
  v('doua faze separate', f.length === 2, JSON.stringify(f.map(x => [x.side, x.arbitri.size])));
}

console.log('\n— cine lipseste mereu se vede —');
{
  const ev = [];
  for (const t of [0, 3000, 6000]) { ev.push(ap(1, t), ap(2, t + 200), ap(3, t + 400), ap(4, t + 600)); }
  const f = fazeleMeciului({ pointEvents: ev, matchRefSlots: sloturi });
  const conf = f.filter(x => x.confirmata);
  const lipsa5 = conf.filter(x => x.lipsa.some(r => r.pos === 5)).length;
  v('arbitrul 5 lipseste de la toate trei', conf.length === 3 && lipsa5 === 3, `${conf.length} / ${lipsa5}`);
}
