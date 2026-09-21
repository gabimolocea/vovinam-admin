const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

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

// This launcher lives at apps/launcher inside the monorepo - always run
// against *this* checkout's own backend/frontends, never a Claude-session
// worktree or anything path-dependent on how the app happened to be built.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');

function backendPython() {
  const venvPython = path.join(BACKEND_DIR, 'venv', 'bin', 'python3');
  return fs.existsSync(venvPython) ? venvPython : 'python3';
}

// Each service: how to start it, and the port it should end up listening
// on (used elsewhere to know when it's actually up).
function buildServiceDefs(lanIp) {
  return [
    {
      id: 'backend',
      label: 'Backend (Django)',
      port: 8000,
      command: backendPython(),
      args: ['manage.py', 'runserver', '0.0.0.0:8000'],
      cwd: BACKEND_DIR,
      env: { LAN_HOST: lanIp },
    },
    {
      id: 'competition-admin',
      label: 'Competition Admin',
      port: 5191,
      command: 'npm',
      args: ['run', 'dev', '--workspace', '@vovinam/competition-admin', '--', '--port', '5191', '--host'],
      cwd: REPO_ROOT,
    },
    {
      id: 'referee-scoring',
      label: 'Referee Scoring',
      port: 5176,
      command: 'npm',
      args: ['run', 'dev', '--workspace', '@vovinam/referee-scoring', '--', '--port', '5176', '--host'],
      cwd: REPO_ROOT,
    },
    {
      id: 'public-display',
      label: 'Public Display',
      port: 5177,
      command: 'npm',
      args: ['run', 'dev', '--workspace', '@vovinam/public-display', '--', '--port', '5177', '--host'],
      cwd: REPO_ROOT,
    },
  ];
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

  startAll(lanIp) {
    const defs = buildServiceDefs(lanIp);
    for (const def of defs) this.start(def);
    return defs;
  }

  async start(def) {
    if (this.processes.has(def.id)) return;

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
    const child = spawn(backendPython(), ['manage.py', 'ensure_local_admin'], { cwd: BACKEND_DIR });
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

module.exports = { ServiceManager, buildServiceDefs, ensureLocalAdmin, REPO_ROOT, BACKEND_DIR };
