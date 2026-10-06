// Reconstructia fazelor, pe cazurile care conteaza.
import { readFileSync } from 'fs';
const sursa = readFileSync('/Users/gabimolocea/vovinam-admin/apps/competition-admin/src/lib/exportMatchExcel.js', 'utf8');
const corp = sursa.slice(sursa.indexOf('function fazeleMeciului'), sursa.indexOf('function renderScoringTimelineChart'));
const FEREASTRA = 1500, PRAG = 3;
const fazeleMeciului = new Function('REAL_TIME_POINT_VALIDATION_WINDOW_MS', 'ARBITRI_PENTRU_FAZA',
  corp + '; return fazeleMeciului;')(FEREASTRA, PRAG);

let ok = 0, rau = 0;
const v = (n, c, d = '') => { if (c) { ok++; console.log('  ok  ', n); } else { rau++; console.log('  PICAT', n, d); } };

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

console.log(`\n${ok} trecute, ${rau} picate`);
process.exit(rau ? 1 : 0);
