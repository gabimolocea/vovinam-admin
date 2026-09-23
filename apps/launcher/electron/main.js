const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const { getLanIp } = require('./network');
const { ServiceManager, buildServiceDefs, ensureLocalAdmin } = require('./services');
const dockerBackend = require('./dockerBackend');
const cloudSync = require('./cloudSync');

const LOCAL_BACKEND_PORT = 8000;

// Session state lives in the main process only, never persisted to disk.
// The password is kept in memory for the app's lifetime (not just one
// call) because every local sync provisions/updates the local admin
// account to match it, so the local backend's SQLite database - which has
// no relation to the cloud one - always ends up with the same login.
let session = {
  cloudBaseUrl: null,
  cloudToken: null,
  email: null,
  password: null,
  localBaseUrl: null,
  localToken: null,
  lanIp: null,
  // Which competition the operator is currently working on, so the Sync
  // menu can act without routing every click through the renderer. Set by
  // the renderer whenever it picks/resumes an event (see
  // session:set-active-event) - the sync IPCs can't be relied on for it,
  // since reconnecting to an event already running here skips them.
  eventId: null,
  eventName: null,
};

let mainWindow;
let serviceManager;

// Tracks whichever embedded <webview> (competition-admin, referee-scoring,
// public-display...) was attached most recently, so the "Consolă" menu
// item can open DevTools for the app the admin is actually looking at
// instead of always the launcher's own (empty) renderer.
let activeWebviewContents = null;

// The URL of whichever embedded local app is currently on screen, or null
// when the admin is back on the launcher's own control panel - drives the
// Window menu's "Deschide în browser extern" item, set by AppViewPage.jsx.
let activeAppUrl = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Lets the renderer embed the local apps in-place via <webview>
      // instead of opening a separate OS window per app.
      webviewTag: true,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    activeWebviewContents = contents;
    contents.on('destroyed', () => {
      if (activeWebviewContents === contents) activeWebviewContents = null;
    });
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
  mainWindow.loadURL(startUrl);
}

// Child-process stdout/sync-progress events keep firing asynchronously
// even after the window closes (or during app quit) - `mainWindow?.` alone
// doesn't catch that, since the reference stays non-null while the native
// window is destroyed, so `.webContents.send()` throws "Object has been
// destroyed" as an uncaught main-process exception. This is the one safe
// way to reach the renderer.
function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Native menu bar (top of the screen on macOS, window menu bar elsewhere) -
// Account items read `session` at click time, not at menu-build time, so
// they always reflect who's currently logged in without needing a rebuild.
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    // Without an explicit Edit menu, Electron has no Cut/Copy/Paste
    // accelerators at all - not in the launcher's own inputs (login form)
    // nor inside the embedded <webview> apps, since those native OS-level
    // shortcuts are wired up by the app's menu, not by the browser engine
    // itself.
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Consolă (DevTools)',
          accelerator: 'CmdOrCtrl+Alt+I',
          click: () => {
            // Prefer the currently embedded local app (competition-admin /
            // referee-scoring / public-display) so errors from that app
            // show up, not the launcher's own near-empty shell page.
            const target =
              activeWebviewContents && !activeWebviewContents.isDestroyed()
                ? activeWebviewContents
                : mainWindow?.webContents;
            target?.openDevTools({ mode: 'detach' });
          },
        },
      ],
    },
    {
      label: 'Account',
      submenu: [
        {
          label: 'Detalii cont',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Detalii cont',
              message: session.email ? `Autentificat ca ${session.email}` : 'Neautentificat',
              detail: [
                `Cloud: ${session.cloudBaseUrl || '—'}`,
                `Backend local: ${session.localBaseUrl || '—'}`,
                `IP local: ${session.lanIp || '—'}`,
              ].join('\n'),
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Deconectare',
          click: () => {
            // Only the cloud/local login state resets - the local stack
            // (if running) is left untouched so an in-progress competition
            // isn't disrupted by the admin logging out and back in.
            session = { ...session, cloudToken: null, email: null, password: null, localToken: null };
            sendToWindow('auth:logged-out');
          },
        },
      ],
    },
    {
      // Moved out of the control panel's own body (where it was two large
      // buttons with a paragraph of explanation each) into the menu bar -
      // both just forward to the renderer, which decides whether the
      // action actually makes sense right now (e.g. a local stack has to
      // be running first).
      label: 'Sync',
      submenu: [
        {
          // Re-pulls the whole event pack from cloud and re-imports it here
          // - the same one-time "bring the competition down" step used to
          // start the local stack, not a safe incremental refresh. Once
          // matches are underway, this overwrites their live status/scores
          // with cloud's stale pre-event snapshot, so it needs an explicit,
          // scary confirmation - it must never fire from a stray keystroke.
          label: 'Web → Local (re-descarcă tot din cloud)',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            if (!mainWindow) return;
            const response = dialog.showMessageBoxSync(mainWindow, {
              type: 'warning',
              buttons: ['Anulează', 'Da, re-descarcă tot'],
              defaultId: 0,
              cancelId: 0,
              title: 'Re-descarcă din cloud?',
              message: 'Asta suprascrie datele locale (meciuri, scoruri, locuri obținute) cu ce e în cloud, care e probabil vechi de dinainte de concurs.',
              detail: 'Folosește asta doar dacă stiva locală chiar trebuie repornită de la zero pentru acest eveniment. Pentru sportivi/categorii noi adăugate în cloud în timpul zilei, folosește "Resincronizează din cloud" din Sync Center în schimb.',
            });
            if (response === 1) sendToWindow('sync-menu:web-to-local');
          },
        },
        {
          label: 'Local → Web (trimite rezultate)',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => sendToWindow('sync-menu:local-to-web'),
        },
        {
          label: 'Verifică ce e în cloud',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => runMenuTask('Verificare', async () => {
            if (!session.eventId) throw new Error('Niciun eveniment selectat.');
            const report = await cloudSync.verifyEventSync({
              cloudBaseUrl: session.cloudBaseUrl,
              cloudToken: session.cloudToken,
              localBaseUrl: session.localBaseUrl,
              localToken: session.localToken,
              eventId: session.eventId,
            });
            return report.ok
              ? { message: 'Cloud-ul are aceleași rezultate ca acest calculator.' }
              : {
                message: `${report.differences.length} nepotriviri între acest calculator și cloud.`,
                detail: report.differences.join('\n'),
                warning: true,
              };
          }),
        },
        { type: 'separator' },
        {
          // The offline path: when the hall has no usable internet, this
          // file is the only way results ever leave the building.
          label: 'Exportă rezultatele (JSON)…',
          click: () => runMenuTask('Export rezultate', async () => {
            const { saved, filePath } = await saveJsonPack({ kind: 'results' });
            return saved
              ? { message: 'Rezultatele au fost salvate.', detail: `${filePath}\n\nÎncarcă fișierul în cloud din Sync Center sau din pagina evenimentului în Django admin.` }
              : null;
          }),
        },
        {
          label: 'Exportă event pack din cloud (JSON)…',
          click: () => runMenuTask('Export event pack', async () => {
            const { saved, filePath } = await saveJsonPack({ kind: 'pack' });
            return saved
              ? { message: 'Event pack-ul a fost salvat.', detail: `${filePath}\n\nÎl poți importa pe serverul local din Sync Center.` }
              : null;
          }),
        },
        { type: 'separator' },
        {
          label: 'Backup acum',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => runMenuTask('Backup', async () => {
            if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');
            const backup = await cloudSync.createBackup({
              localBaseUrl: session.localBaseUrl, localToken: session.localToken, label: 'manual',
            });
            return { message: 'Backup creat.', detail: backup?.filename || '' };
          }),
        },
        {
          label: 'Backup-uri și restaurare…',
          click: () => sendToWindow('sync-menu:backups'),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        ...(isMac ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }, { type: 'separator' }] : [{ role: 'minimize' }, { type: 'separator' }]),
        {
          label: 'Înapoi la panou',
          accelerator: 'CmdOrCtrl+Shift+B',
          // Same activeAppUrl guard as the item below - only relevant
          // while an embedded local app is actually on screen.
          click: () => {
            if (activeAppUrl) sendToWindow('app-view:go-back');
          },
        },
        {
          label: 'Deschide în browser extern',
          accelerator: 'CmdOrCtrl+Shift+O',
          // activeAppUrl is only set while an embedded local app
          // (competition-admin/referee-scoring/public-display) is on
          // screen - see the app-view:set-active-url handler below.
          click: () => {
            if (activeAppUrl) shell.openExternal(activeAppUrl);
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getServiceManager() {
  if (!serviceManager) {
    serviceManager = new ServiceManager({
      onLog: (id, line) => sendToWindow('service:log', { id, line }),
      onStatusChange: (id, status) => sendToWindow('service:status', { id, status }),
    });
  }
  return serviceManager;
}

async function waitForBackend(baseUrl, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/system-info/`);
      if (res.ok) return true;
    } catch {
      // backend not up yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Backendul local nu a pornit la timp.');
}

app.whenReady().then(() => {
  // The packaged .app already carries the federation logo as its bundle
  // icon (build/icon.icns, wired into electron-builder's mac config) -
  // this only matters for `npm run dev`, which runs unpackaged and would
  // otherwise show Electron's own default icon in the dock.
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'));
  }
  createWindow();
  buildMenu();
});

app.on('window-all-closed', () => {
  getServiceManager().stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  getServiceManager().stopAll();
});

ipcMain.handle('auth:login', async (_event, { baseUrl, email, password }) => {
  const { user, access } = await cloudSync.login(baseUrl, email, password);
  session = { ...session, cloudBaseUrl: baseUrl, cloudToken: access, email, password };
  return { user };
});

ipcMain.handle('events:list', async () => {
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat.');
  return cloudSync.listCompetitionEvents(session.cloudBaseUrl, session.cloudToken);
});

ipcMain.handle('cloud:overview', async () => {
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat.');
  return cloudSync.getOverview(session.cloudBaseUrl, session.cloudToken);
});

ipcMain.handle('network:get-lan-ip', async () => getLanIp());

ipcMain.handle('services:defs', async () => buildServiceDefs(session.lanIp || getLanIp()));

ipcMain.handle('services:stop', async () => {
  getServiceManager().stopAll();
  session.localBaseUrl = null;
  session.localToken = null;
});

ipcMain.handle('docker:is-available', async () => dockerBackend.isDockerAvailable());

// Starts the local stack, then provisions the local admin account to
// match the cloud login the operator already did (see
// services.js#ensureLocalAdmin - it runs a Django management command
// directly on this machine, so it sidesteps needing a local token to
// create the very account that would provide one), and logs into it. The
// admin never has to remember or type a second, separate local password.
//
// useDocker routes the backend through the "official" docker-compose.local.yml
// stack (PostgreSQL 17, matching production, plus automatic backups) instead
// of the default SQLite `manage.py runserver` - see dockerBackend.js. Only
// affects this initial start; a later resync just talks to whichever
// backend is already running.
ipcMain.handle('services:start-local-stack', async (_event, { useDocker = false } = {}) => {
  if (!session.email || !session.password) throw new Error('Neautentificat în cloud.');

  const lanIp = getLanIp();
  if (!lanIp) throw new Error('Nu s-a găsit o adresă IP în rețeaua locală (verifică WiFi-ul).');
  session.lanIp = lanIp;
  session.useDocker = useDocker;

  const manager = getServiceManager();

  if (useDocker) {
    await dockerBackend.startDockerBackend({
      lanIp,
      onLog: (line) => sendToWindow('service:log', { id: 'backend', line }),
    });
  }
  const defs = manager.startAll(lanIp, { useDocker });

  const localBaseUrl = `http://localhost:${LOCAL_BACKEND_PORT}`;
  sendToWindow('sync:progress', { direction: 'local', message: 'Se pornește backend-ul local…' });
  await waitForBackend(localBaseUrl, useDocker ? { timeoutMs: 120000 } : undefined);

  sendToWindow('sync:progress', {
    direction: 'local',
    message: 'Se configurează contul de administrator pe acest calculator…',
  });
  if (useDocker) {
    await dockerBackend.ensureLocalAdminDocker({ email: session.email, password: session.password });
  } else {
    await ensureLocalAdmin({ email: session.email, password: session.password });
  }

  const { access } = await cloudSync.login(localBaseUrl, session.email, session.password);
  session.localBaseUrl = localBaseUrl;
  session.localToken = access;

  const urls = Object.fromEntries(
    defs.filter((d) => d.id !== 'backend').map((d) => [d.id, `http://${lanIp}:${d.port}`])
  );
  return { lanIp, urls };
});

// force=true is the deliberate "wipe and re-pull" path, and is only ever
// passed after the operator confirmed the Sync menu's own warning dialog.
// Without it, this refuses to overwrite a competition already under way on
// this machine - the cloud event's own status can't be trusted for that
// call (see cloudSync.js#inspectLocalEvent), so ask the local server.
ipcMain.handle('sync:start-local', async (_event, { eventId, force = false }) => {
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat în cloud.');
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');

  if (!force) {
    const local = await cloudSync.inspectLocalEvent({
      localBaseUrl: session.localBaseUrl,
      localToken: session.localToken,
      eventId,
    });
    if (local.hasLiveResults) {
      return { status: 'skipped_local_results', summary: local.summary };
    }
  }

  await cloudSync.syncEventLocal({
    cloudBaseUrl: session.cloudBaseUrl,
    cloudToken: session.cloudToken,
    localBaseUrl: session.localBaseUrl,
    localToken: session.localToken,
    eventId,
    onProgress: (message) => sendToWindow('sync:progress', { direction: 'local', message }),
  });

  return { status: 'imported' };
});

ipcMain.handle('sync:to-cloud', async (_event, { eventId }) => {
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat în cloud.');

  return cloudSync.syncEventToCloud({
    cloudBaseUrl: session.cloudBaseUrl,
    cloudToken: session.cloudToken,
    localBaseUrl: session.localBaseUrl,
    localToken: session.localToken,
    eventId,
    onProgress: (message) => sendToWindow('sync:progress', { direction: 'cloud', message }),
  });
});

// Menu items act on their own rather than routing through the renderer,
// so they work from any screen - including while an app is open embedded,
// where the control panel isn't even mounted. Whatever the task returns
// (or throws) is what the operator sees, so no action can fail silently
// the way the old fire-and-forget menu clicks did.
async function runMenuTask(title, task) {
  if (!mainWindow) return;
  try {
    const result = await task();
    if (!result) return; // task chose to say nothing (e.g. operator cancelled)
    dialog.showMessageBox(mainWindow, {
      type: result.warning ? 'warning' : 'info',
      title,
      message: result.message,
      detail: result.detail || undefined,
      buttons: ['OK'],
    });
  } catch (err) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title,
      message: `${title} nu a reușit.`,
      detail: err?.message || String(err),
      buttons: ['OK'],
    });
  }
}

// Writes one of the sync packs to a file the operator picks. This is the
// no-internet path: when the venue can't reach cloud at all, the JSON
// goes out on a memory stick and is uploaded from somewhere that can
// (Sync Center in the web app, or the event's Django admin page).
async function saveJsonPack({ kind }) {
  if (!session.eventId) throw new Error('Niciun eveniment selectat.');

  const isResults = kind === 'results';
  if (isResults && (!session.localBaseUrl || !session.localToken)) {
    throw new Error('Stiva locală nu este pornită.');
  }
  if (!isResults && (!session.cloudBaseUrl || !session.cloudToken)) {
    throw new Error('Neautentificat în cloud.');
  }

  const payload = isResults
    ? await cloudSync.fetchResultsPack({
      localBaseUrl: session.localBaseUrl, localToken: session.localToken, eventId: session.eventId,
    })
    : await cloudSync.fetchEventPack({
      cloudBaseUrl: session.cloudBaseUrl, cloudToken: session.cloudToken, eventId: session.eventId,
    });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const defaultName = `${isResults ? 'rezultate' : 'event-pack'}-${session.eventId}-${stamp}.json`;

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: isResults ? 'Salvează rezultatele (JSON)' : 'Salvează event pack-ul (JSON)',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { saved: false };

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { saved: true, filePath };
}

ipcMain.on('session:set-active-event', (_event, { eventId, eventName } = {}) => {
  session.eventId = eventId ?? null;
  session.eventName = eventName ?? null;
});

ipcMain.handle('backup:list', async () => {
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');
  return cloudSync.listBackups({ localBaseUrl: session.localBaseUrl, localToken: session.localToken });
});

ipcMain.handle('backup:create', async (_event, { label } = {}) => {
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');
  return cloudSync.createBackup({ localBaseUrl: session.localBaseUrl, localToken: session.localToken, label });
});

ipcMain.handle('backup:restore', async (_event, { filename }) => {
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');
  return cloudSync.restoreBackup({ localBaseUrl: session.localBaseUrl, localToken: session.localToken, filename });
});

// Read-only: compares cloud's own results pack against this machine's and
// reports what doesn't match. Safe to run any time.
ipcMain.handle('sync:verify', async (_event, { eventId }) => {
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat în cloud.');

  return cloudSync.verifyEventSync({
    cloudBaseUrl: session.cloudBaseUrl,
    cloudToken: session.cloudToken,
    localBaseUrl: session.localBaseUrl,
    localToken: session.localToken,
    eventId,
  });
});

// Separate from sync:to-cloud on purpose - see cloudSync.js#completeSyncOnCloud.
ipcMain.handle('sync:complete', async (_event, { eventId }) => {
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat în cloud.');

  return cloudSync.completeSyncOnCloud({
    cloudBaseUrl: session.cloudBaseUrl,
    cloudToken: session.cloudToken,
    eventId,
    onProgress: (message) => sendToWindow('sync:progress', { direction: 'cloud', message }),
  });
});

// Fallback for opening a URL in the system browser instead of embedding it
// (used by the Window menu's "Deschide în browser extern" item).
ipcMain.handle('shell:open-external', async (_event, url) => {
  await shell.openExternal(url);
});

// AppViewPage.jsx reports which local app's URL is currently on screen (or
// null once it's closed), so the Window menu item above knows what to open.
ipcMain.on('app-view:set-active-url', (_event, url) => {
  activeAppUrl = url || null;
});
