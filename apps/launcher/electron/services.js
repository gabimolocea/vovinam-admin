const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const { getRepoRoot } = require('./repoRoot');

// Used to detect a port that's already serving (e.g. the admin's own dev
// servers left running, or a leftover process from a launcher instance
// that didn't shut down cleanly) so we reuse it instead of crash-looping
// trying to bind the same port ourselves.
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

// Unde e proiectul pe disc - vezi repoRoot.js pentru cum se afla.
//
// Se cere la fiecare folosire, nu o data la incarcarea modulului: intr-o
// aplicatie impachetata, radacina poate fi aleasa de operator abia dupa ce
// a pornit programul, iar o constanta calculata la `require` ar ramane
// pentru totdeauna cea gresita.
function repoRoot() {
  const root = getRepoRoot();
  if (!root) throw new Error('Nu stiu unde este proiectul pe acest calculator.');
  return root;
}

function backendDir() {
  return path.join(repoRoot(), 'backend');
}

function backendPython() {
  const venvPython = path.join(backendDir(), 'venv', 'bin', 'python3');
  return fs.existsSync(venvPython) ? venvPython : 'python3';
}

// Each service: how to start it, and the port it should end up listening
// on (used elsewhere to know when it's actually up).
//
// useDocker: true omits the 'backend' entry entirely - it's started
// separately by dockerBackend.js (PostgreSQL, matching production, via
// the "official" docker-compose.local.yml stack) instead of this
// SQLite-backed `manage.py runserver`, for real events with heavier
// concurrent write load (multiple tatami scoring at once) than SQLite's
// single-writer model comfortably handles.
// `frontendsFromDocker` e cazul laptopului din sala: cele trei interfete
// vin ca fisiere statice dintr-un container, nu din `npm run dev`. Raman in
// lista - launcherul are nevoie de ele ca sa afiseze adresele - dar sunt
// marcate ca pornite de altcineva, si nu incercam sa le lansam noi. Fara
// marcajul asta, launcherul ar cauta npm pe un calculator unde Node nici nu
// e instalat.
//
// Cele trei interfete, descrise fara nimic legat de disc. Partea asta
// trebuie sa poata fi data si acolo unde nu exista cod: launcherul are
// nevoie de id, nume si port ca sa afiseze adresele din sala.
const FRONTENDS = [
  { id: 'competition-admin', label: 'Competition Admin', port: 5191, workspace: '@vovinam/competition-admin' },
  { id: 'referee-scoring', label: 'Referee Scoring', port: 5176, workspace: '@vovinam/referee-scoring' },
  { id: 'public-display', label: 'Public Display', port: 5177, workspace: '@vovinam/public-display' },
];

function buildServiceDefs(lanIp, { useDocker = false, frontendsFromDocker = false } = {}) {
  // Intai drumul fara cod pe disc, si abia apoi orice atinge discul.
  //
  // Ordinea asta nu e de stil. Inainte, lista se construia toata - cu
  // `cwd: repoRoot()` in fiecare intrare - si abia pe urma se verifica
  // modul. Pe laptopul din sala, unde nu exista depozit, se arunca "Nu stiu
  // unde este proiectul pe acest calculator" chiar la pornire, desi calea
  // aceea nu era necesara nimanui: interfetele vin din container.
  if (frontendsFromDocker) {
    return FRONTENDS.map(({ id, label, port }) => ({ id, label, port, managedByDocker: true }));
  }

  const root = repoRoot();

  const frontends = FRONTENDS.map(({ id, label, port, workspace }) => ({
    id,
    label,
    port,
    command: 'npm',
    args: ['run', 'dev', '--workspace', workspace, '--', '--port', String(port), '--host'],
    cwd: root,
  }));

  const backendDef = {
    id: 'backend',
    label: 'Backend (Django)',
    port: 8000,
    command: backendPython(),
    args: ['manage.py', 'runserver', '0.0.0.0:8000'],
    cwd: backendDir(),
    // IS_LOCAL_EVENT_SERVER exempts this instance from the operational
    // lock a synced event carries (see api/views/_common.py) - without
    // it, this backend is indistinguishable from the cloud instance the
    // lock exists to protect, and nothing (weigh-ins, category
    // assignments, scores) can be edited here once an event is synced.
    env: { LAN_HOST: lanIp, IS_LOCAL_EVENT_SERVER: 'True' },
  };

  return [...(useDocker ? [] : [backendDef]), ...frontends];
}

// Manages the child processes for the local stack: starts them, streams
// their output to a callback (for the renderer's log pane), and makes
// sure nothing is left running behind when the launcher quits or a
// service is restarted.
class ServiceManager {
  constructor({ onLog, onStatusChange }) {
    this.onLog = onLog || (() => {});
    this.onStatusChange = onStatusChange || (() => {});
    this.processes = new Map(); // id -> { proc, def }
  }

  startAll(lanIp, opts) {
    const defs = buildServiceDefs(lanIp, opts);
    for (const def of defs) this.start(def);
    return defs;
  }

  async start(def) {
    if (this.processes.has(def.id)) return;

    // Pornit de Docker, nu de noi: nu avem ce lansa si nu avem ce opri.
    if (def.managedByDocker) {
      this.onStatusChange(def.id, 'running');
      return;
    }

    if (await isPortOpen(def.port)) {
      this.onLog(def.id, `Portul ${def.port} este deja ocupat de un proces existent — se folosește ca atare.`);
      this.onStatusChange(def.id, 'running');
      return;
    }

    this.onLog(def.id, `Starting: ${def.command} ${def.args.join(' ')}`);
    this.onStatusChange(def.id, 'starting');

    const child = spawn(def.command, def.args, {
      cwd: def.cwd,
      env: { ...process.env, ...(def.env || {}) },
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (chunk) => this.onLog(def.id, chunk.toString()));
    child.stderr?.on('data', (chunk) => this.onLog(def.id, chunk.toString()));
    child.on('exit', (code) => {
      this.processes.delete(def.id);
      this.onStatusChange(def.id, code === 0 ? 'stopped' : 'crashed');
      this.onLog(def.id, `Process exited (code ${code})`);
    });

    this.processes.set(def.id, { proc: child, def });
    // A dev server doesn't announce "ready" in a machine-readable way, so
    // the renderer treats "process alive for a couple seconds" as running
    // and lets the actual page load confirm it beyond that.
    setTimeout(() => {
      if (this.processes.has(def.id)) this.onStatusChange(def.id, 'running');
    }, 2000);
  }

  stopAll() {
    for (const id of Array.from(this.processes.keys())) this.stop(id);
  }

  stop(id) {
    const entry = this.processes.get(id);
    if (!entry) return;
    entry.proc.kill('SIGTERM');
  }

  isRunning(id) {
    return this.processes.has(id);
  }
}

// Provisions (or updates) the local admin account to match the cloud
// credentials the operator just logged in with, by running a Django
// management command directly on this machine - no HTTP round-trip, so it
// doesn't hit the chicken-and-egg problem of needing a local admin token
// to create the local admin. The password is sent over the command's
// stdin, never as an argv value, so it never shows up in `ps`.
function ensureLocalAdmin({ email, password, firstName, lastName }) {
  return new Promise((resolve, reject) => {
    const child = spawn(backendPython(), ['manage.py', 'ensure_local_admin'], { cwd: backendDir() });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ensure_local_admin a eșuat (cod ${code}).`));
    });
    child.stdin.write(JSON.stringify({ email, password, first_name: firstName, last_name: lastName }));
    child.stdin.end();
  });
}

module.exports = { ServiceManager, buildServiceDefs, ensureLocalAdmin, repoRoot, backendDir };
