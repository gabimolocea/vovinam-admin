// Scorul unui colt, pe cazurile care au produs defectul.
//
// Panoul de operare si ecranul public aveau formule DIFERITE: panoul uita
// penalizarile. Un luptator cu -24 din penalizari aparea cu +16 la masa si cu
// -8 in sala, pe acelasi meci, in acelasi moment.
import { totalColt, PENALIZARE_AVERTISMENT } from './realtimePoints.js';

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

v('fara nimic, scorul e cel validat',
  totalColt({ puncteValidate: 10 }) === 10);

v('penalizarile se scad - cazul care lipsea din panou',
  totalColt({ puncteValidate: 40, penalizari: -24 }) === 16,
  String(totalColt({ puncteValidate: 40, penalizari: -24 })));

v('cazul din captura: +16 la masa vs -8 in sala era aceeasi situatie',
  totalColt({ puncteValidate: 16, penalizari: -24 }) === -8,
  String(totalColt({ puncteValidate: 16, penalizari: -24 })));

v('bonusurile se adauga',
  totalColt({ puncteValidate: 5, bonusuri: 3 }) === 8);

v('fiecare avertisment scade 2',
  totalColt({ puncteValidate: 10, avertismente: 3 }) === 10 + 3 * PENALIZARE_AVERTISMENT,
  String(totalColt({ puncteValidate: 10, avertismente: 3 })));

v('toate la un loc',
  totalColt({ puncteValidate: 20, penalizari: -3, bonusuri: 2, avertismente: 1 }) === 17,
  String(totalColt({ puncteValidate: 20, penalizari: -3, bonusuri: 2, avertismente: 1 })));

v('lipsa unui camp nu strica suma',
  totalColt({ puncteValidate: 7 }) === totalColt({ puncteValidate: 7, penalizari: 0, bonusuri: 0, avertismente: 0 }));
