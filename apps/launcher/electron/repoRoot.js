// Unde se afla proiectul pe discul acestui Mac.
//
// Launcherul nu e o aplicatie de sine statatoare: porneste backendul din
// `backend/`, cele trei interfete prin npm din radacina, si stiva Docker
// din `docker-compose.local.yml`. Toate astea cer sa stie unde e proiectul
// descarcat.
//
// In dezvoltare se deduce singur, din locul fisierului: `electron/` sta in
// `apps/launcher/`, deci trei nivele mai sus e radacina. Dar intr-o
// aplicatie impachetata codul ajunge inauntrul `app.asar`, iar aceleasi
// trei nivele mai sus dau `.../Contents` din interiorul pachetului - un
// loc fara `backend/`, fara `docker-compose.local.yml`, fara nimic. De
// aceea aplicatia construita parea ca porneste si apoi nu facea nimic.
//
// Asa ca ordinea e: ce ni se spune prin mediu (asa trimite fisierul
// `Porneste competitia.command`), apoi ce am retinut data trecuta, apoi
// deducerea din locul fisierului. Daca nimic nu iese, `getRepoRoot()`
// intoarce null si cel care intreaba decide ce face - main.js deschide o
// fereastra de ales folderul.

const fs = require('fs');
const path = require('path');

const ENV_VAR = 'FRVV_REPO_ROOT';
const SETTINGS_FILE = 'repo-root.json';

// Semnele dupa care recunoastem proiectul. Nu verificam doar ca folderul
// exista: cineva poate alege din greseala folderul parinte, sau o copie
// veche fara stiva Docker, si atunci e mai bine sa spunem imediat decat sa
// esuam pe la jumatatea pornirii cu o eroare de proces.
const MARKERS = [
  path.join('backend', 'manage.py'),
  'docker-compose.local.yml',
  'package.json',
];

function isRepoRoot(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  return MARKERS.every((marker) => fs.existsSync(path.join(candidate, marker)));
}

function settingsPath() {
  // `electron` se cere aici, nu sus: modulul asta e folosit si din teste,
  // unde nu ruleaza niciun proces Electron.
  const { app } = require('electron');
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readRemembered() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
    return saved.repoRoot;
  } catch {
    return null;
  }
}

function remember(repoRoot) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify({ repoRoot }, null, 2));
  } catch {
    // Nu putem scrie preferinta: aplicatia merge mai departe in sesiunea
    // asta, doar ca data viitoare va intreba din nou.
  }
}

// Deducerea din locul fisierului - corecta cand rulam din sursa.
function guessFromSource() {
  return path.resolve(__dirname, '..', '..', '..');
}

let resolved = null;

function getRepoRoot() {
  if (resolved) return resolved;

  // Fiecare varianta e o functie, nu o valoare: asa, cand mediul ne-a spus
  // deja raspunsul, nu mai atingem deloc preferinta salvata - care are
  // nevoie de Electron ca sa stie unde sta.
  const candidates = [() => process.env[ENV_VAR], readRemembered, guessFromSource];
  for (const candidate of candidates) {
    let value = null;
    try {
      value = candidate();
    } catch {
      continue;
    }
    if (isRepoRoot(value)) {
      resolved = path.resolve(value);
      // Tinem minte si cand am aflat-o singuri, nu doar cand a ales-o
      // operatorul: asa, dupa o prima pornire prin fisierul
      // "Porneste competitia.command", aplicatia stie unde e proiectul si
      // daca e deschisa direct din Dock.
      remember(resolved);
      return resolved;
    }
  }
  return null;
}

// Folosit de main.js dupa ce operatorul alege folderul din fereastra.
function setRepoRoot(candidate) {
  if (!isRepoRoot(candidate)) return false;
  resolved = path.resolve(candidate);
  remember(resolved);
  return true;
}

module.exports = { getRepoRoot, setRepoRoot, isRepoRoot, ENV_VAR, MARKERS };
