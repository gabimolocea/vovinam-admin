// Rulat cu: node apps/competition-admin/src/lib/impartialitate.test.mjs
//
// Cazurile de aici sunt cele in care o masuratoare prost facuta minte: un
// juriu care cade de acord, un arbitru sever cu toata lumea, si un singur
// sportiv de club. Primele doua nu trebuie sa produca niciun semnal, al
// treilea nu trebuie sa produca o acuzatie.
import { abateriTehnica, abateriLupta } from './impartialitate.js';

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
const verifica = inregistreaza;

const coloane = [
  { id: 1, name: 'A unu' }, { id: 2, name: 'B doi' }, { id: 3, name: 'C trei' },
  { id: 4, name: 'D patru' }, { id: 5, name: 'E cinci' },
];
const clubArbitru = new Map([[1, 'Phuong'], [2, 'Regnum'], [3, 'Thieu Lam'], [4, 'Regnum'], [5, 'Phuong']]);

console.log('\n— juriu cinstit: toti dau la fel —');
{
  const randuri = [
    { clubName: 'Phuong', vals: [90, 90, 90, 90, 90] },
    { clubName: 'Regnum', vals: [80, 80, 80, 80, 80] },
    { clubName: 'Phuong', vals: [70, 70, 70, 70, 70] },
  ];
  const r = abateriTehnica({ randuri, coloane, clubArbitru });
  // Arbitrul fara niciun sportiv de club in proba nu are ce raporta: "—".
  verifica('nicio diferenta la cei cu sportivi de club',
    r.every(x => x.diferenta === 0 || (x.nProprii === 0 && x.diferenta === null)),
    JSON.stringify(r.map(x => [x.arbitru, x.nProprii, x.diferenta])));
  verifica('niciun semnal', r.every(x => x.semnal !== 'de verificat'));
}

console.log('\n— arbitrul 1 (Phuong) da +6 alor lui —');
{
  const randuri = [
    { clubName: 'Phuong', vals: [96, 90, 90, 90, 90] },
    { clubName: 'Regnum', vals: [80, 80, 80, 80, 80] },
    { clubName: 'Phuong', vals: [76, 70, 70, 70, 70] },
  ];
  const r = abateriTehnica({ randuri, coloane, clubArbitru });
  const a1 = r.find(x => x.arbitru === 'A unu');
  verifica('il prinde pe 1', a1.semnal === 'de verificat', JSON.stringify(a1));
  verifica('diferenta ~ +6', Math.abs(a1.diferenta - 6) < 0.01, String(a1.diferenta));
  verifica('numara 2 sportivi de club', a1.nProprii === 2, String(a1.nProprii));
  const altii = r.filter(x => x.arbitru !== 'A unu');
  verifica('nu acuza pe nimeni altcineva', altii.every(x => x.semnal !== 'de verificat'),
    JSON.stringify(altii.map(x => [x.arbitru, x.diferenta])));
}

console.log('\n— arbitru sever cu TOATA lumea: stil, nu partinire —');
{
  const randuri = [
    { clubName: 'Phuong', vals: [85, 90, 90, 90, 90] },
    { clubName: 'Regnum', vals: [75, 80, 80, 80, 80] },
    { clubName: 'Phuong', vals: [65, 70, 70, 70, 70] },
  ];
  const r = abateriTehnica({ randuri, coloane, clubArbitru });
  const a1 = r.find(x => x.arbitru === 'A unu');
  verifica('severitatea uniforma nu e semnalata', a1.semnal !== 'de verificat', JSON.stringify(a1));
  verifica('diferenta ~ 0', Math.abs(a1.diferenta) < 0.01, String(a1.diferenta));
}

console.log('\n— un singur sportiv de club: prea putine date —');
{
  const randuri = [
    { clubName: 'Phuong', vals: [99, 90, 90, 90, 90] },
    { clubName: 'Regnum', vals: [80, 80, 80, 80, 80] },
  ];
  const r = abateriTehnica({ randuri, coloane, clubArbitru });
  const a1 = r.find(x => x.arbitru === 'A unu');
  verifica('nu acuza pe un singur caz', a1.semnal === 'date putine', JSON.stringify(a1));
  verifica('dar raporteaza numarul', a1.nProprii === 1 && a1.diferenta != null);
}

console.log('\n— lupte: arbitrul 2 (Regnum) umfla coltul rosu, care e Regnum —');
{
  // Trei runde, ca intr-un meci adevarat.
  const noteArbitri = [];
  for (let runda = 0; runda < 3; runda++) {
    noteArbitri.push({ referee: 1, red_corner_score: 5, blue_corner_score: 5 });
    noteArbitri.push({ referee: 2, red_corner_score: 9, blue_corner_score: 2 });
    noteArbitri.push({ referee: 3, red_corner_score: 5, blue_corner_score: 5 });
    noteArbitri.push({ referee: 4, red_corner_score: 5, blue_corner_score: 5 });
  }
  const r = abateriLupta({
    noteArbitri, clubRosu: 'Regnum', clubAlbastru: 'Phuong',
    clubArbitru, numeArbitru: new Map([[1, 'unu'], [2, 'doi'], [3, 'trei'], [4, 'patru']]),
  });
  const a2 = r.find(x => x.arbitru === 'doi');
  verifica('il prinde pe 2', a2.semnal === 'de verificat' && a2.diferenta > 0, JSON.stringify(a2));
  const a1 = r.find(x => x.arbitru === 'unu');
  verifica('arbitrul neutru iese 0', Math.abs(a1.diferenta ?? 0) < 0.01, JSON.stringify(a1));
}
