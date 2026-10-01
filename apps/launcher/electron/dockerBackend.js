// Orchestrates the "official" Docker Compose local-venue stack
// (docker-compose.local.yml: PostgreSQL 17 - matching production exactly -
// plus the Django backend and an automatic 15-minute backup scheduler,
// see docs/GHID_COMPETITIE_LOCALA.md) as an alternative to the launcher's
// default SQLite backend (services.js), for real events with real
// concurrent load (multiple tatami scoring at once) where SQLite's
// single-writer model is more likely to become a bottleneck.
//
// Deliberately does NOT stop the containers on app quit/crash - they carry
// `restart: unless-stopped`, so the database (and its backups) keep running
// independently of the launcher's own lifecycle, which is the whole point
// of using it for a real event.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getRepoRoot } = require('./repoRoot');

// Doua feluri de a porni stiva, dupa cum exista sau nu codul pe disc.
//
// Cu depozitul (calculatorul unui dezvoltator): docker-compose.local.yml,
// care construieste imaginile din codul de langa el - asa se vede imediat
// o modificare.
//
// Fara depozit (laptopul din sala, unde e doar aplicatia instalata):
// docker-compose.venue.yml, purtat in aplicatie, care descarca imagini
// gata facute. Acolo nu exista nici cod, nici Node, nici npm - si tocmai
// asta e ideea.
function composeFile() {
  const root = getRepoRoot();
  return root
    ? path.join(root, 'docker-compose.local.yml')
    : path.join(process.resourcesPath, 'docker-compose.venue.yml');
}

// Unde scriem configurarea stivei. Langa cod cand exista; altfel in
// folderul aplicatiei, care e scriibil si supravietuieste reinstalarilor.
function configDir() {
  const root = getRepoRoot();
  if (root) return root;
  const { app } = require('electron');
  return app.getPath('userData');
}

const envLocalFile = () => path.join(configDir(), '.env.local');

// De unde rulam comenzile `docker`. Fisierul de compose e dat oricum
// explicit cu -f, deci aici conteaza doar sa fie un folder care exista.
const composeCwd = () => getRepoRoot() || path.dirname(composeFile());
const envExampleFile = () => {
  const root = getRepoRoot();
  return root ? path.join(root, '.env.local.example') : null;
};

// Aceleasi valori ca .env.local.example, scrise aici fiindca pe laptopul
// din sala fisierul acela nu exista - nu exista nici depozitul din care ar
// veni. LAN_HOST si cheia secreta sunt oricum inlocuite mai jos.
const ENV_IMPLICIT = `# Configurarea stivei din sala, scrisa de launcher.
LAN_HOST=127.0.0.1
DJANGO_SECRET_KEY=change-me-before-the-event
DB_NAME=frvv_local
DB_USER=frvv
DB_PASSWORD=frvv_local_password
LOCAL_BACKUP_INTERVAL_MINUTES=15
LOCAL_BACKUP_RETENTION_COUNT=200
`;

// A GUI-launched Electron app (double-clicked, or even `npm run dev` from
// some terminal/shell setups) doesn't reliably inherit the same PATH an
// interactive shell has - Docker Desktop's CLI usually lives in one of
// these, none of which are guaranteed to be on that inherited PATH, which
// otherwise surfaces as a bare "spawn docker ENOENT" with no hint why.
const DOCKER_PATH_CANDIDATES = process.platform === 'win32'
  ? [
    'C:\\Program Files\\Docker\\Docker\\resources\\bin',
    'C:\\ProgramData\\DockerDesktop\\version-bin',
  ]
  : [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/Applications/Docker.app/Contents/Resources/bin',
  ];

function spawnEnv() {
  const existing = (process.env.PATH || '').split(path.delimiter);
  const merged = [...new Set([...existing, ...DOCKER_PATH_CANDIDATES])];
  return { ...process.env, PATH: merged.join(path.delimiter) };
}

function run(command, args, { onLog } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: composeCwd(), env: spawnEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); onLog?.(chunk.toString()); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); onLog?.(chunk.toString()); });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Docker nu a fost găsit (${command}). Verifică dacă Docker Desktop e instalat și pornit.`));
      } else {
        reject(err);
      }
    });
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} ${args.join(' ')} a eșuat (cod ${code}).`));
    });
  });
}

async function isDockerAvailable() {
  try {
    await run('docker', ['info']);
    return true;
  } catch {
    return false;
  }
}

// .env.local carries the compose stack's own config (LAN_HOST, DB
// credentials, secret key) - copy it from the example on first use, then
// keep LAN_HOST and the secret key current automatically so the operator
// never has to hand-edit it before an event.
function ensureEnvLocal(lanIp) {
  if (!fs.existsSync(envLocalFile())) {
    const exemplu = envExampleFile();
    if (exemplu && fs.existsSync(exemplu)) {
      fs.copyFileSync(exemplu, envLocalFile());
    } else {
      fs.writeFileSync(envLocalFile(), ENV_IMPLICIT);
    }
  }

  let content = fs.readFileSync(envLocalFile(), 'utf8');
  content = /^LAN_HOST=/m.test(content)
    ? content.replace(/^LAN_HOST=.*$/m, `LAN_HOST=${lanIp}`)
    : `${content}\nLAN_HOST=${lanIp}\n`;

  if (/^DJANGO_SECRET_KEY=change-me-before-the-event\s*$/m.test(content)) {
    const generated = crypto.randomBytes(32).toString('hex');
    content = content.replace(/^DJANGO_SECRET_KEY=.*$/m, `DJANGO_SECRET_KEY=${generated}`);
  }

  fs.writeFileSync(envLocalFile(), content);
}

const composeArgs = (...rest) => ['compose', '-f', composeFile(), '--env-file', envLocalFile(), ...rest];

async function startDockerBackend({ lanIp, onLog }) {
  ensureEnvLocal(lanIp);
  onLog?.('Se pornește PostgreSQL + backend (Docker)…\n');
  const dinCod = Boolean(getRepoRoot());
  await run('docker', composeArgs('up', '-d', ...(dinCod ? ['--build'] : ['--pull', 'always'])), { onLog });
}

// Provisions/updates the local admin account inside the running backend
// container - mirrors services.js#ensureLocalAdmin (same management
// command, same stdin-only password handoff), just reached via
// `docker compose exec` instead of a direct venv spawn.
function ensureLocalAdminDocker({ email, password, firstName, lastName }) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', composeArgs('exec', '-T', 'backend', 'python', 'manage.py', 'ensure_local_admin'), { cwd: composeCwd(), env: spawnEnv() });
    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Docker nu a fost găsit. Verifică dacă Docker Desktop e instalat și pornit.'));
      } else {
        reject(err);
      }
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ensure_local_admin a eșuat (cod ${code}).`));
    });
    child.stdin.write(JSON.stringify({ email, password, first_name: firstName, last_name: lastName }));
    child.stdin.end();
  });
}

module.exports = { isDockerAvailable, startDockerBackend, ensureLocalAdminDocker, ensureEnvLocal };
