const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');

const { getLanIp } = require('./network');
const { ServiceManager, buildServiceDefs, ensureLocalAdmin } = require('./services');
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
      label: 'Window',
      submenu: [
        ...(isMac ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }, { type: 'separator' }] : [{ role: 'minimize' }, { type: 'separator' }]),
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

// Starts the local stack, then provisions the local admin account to
// match the cloud login the operator already did (see
// services.js#ensureLocalAdmin - it runs a Django management command
// directly on this machine, so it sidesteps needing a local token to
// create the very account that would provide one), and logs into it. The
// admin never has to remember or type a second, separate local password.
ipcMain.handle('services:start-local-stack', async () => {
  if (!session.email || !session.password) throw new Error('Neautentificat în cloud.');

  const lanIp = getLanIp();
  if (!lanIp) throw new Error('Nu s-a găsit o adresă IP în rețeaua locală (verifică WiFi-ul).');
  session.lanIp = lanIp;

  const manager = getServiceManager();
  const defs = manager.startAll(lanIp);

  const localBaseUrl = `http://localhost:${LOCAL_BACKEND_PORT}`;
  sendToWindow('sync:progress', { direction: 'local', message: 'Se pornește backend-ul local…' });
  await waitForBackend(localBaseUrl);

  sendToWindow('sync:progress', {
    direction: 'local',
    message: 'Se configurează contul de administrator pe acest calculator…',
  });
  await ensureLocalAdmin({ email: session.email, password: session.password });

  const { access } = await cloudSync.login(localBaseUrl, session.email, session.password);
  session.localBaseUrl = localBaseUrl;
  session.localToken = access;

  const urls = Object.fromEntries(
    defs.filter((d) => d.id !== 'backend').map((d) => [d.id, `http://${lanIp}:${d.port}`])
  );
  return { lanIp, urls };
});

ipcMain.handle('sync:start-local', async (_event, { eventId }) => {
  if (!session.cloudBaseUrl || !session.cloudToken) throw new Error('Neautentificat în cloud.');
  if (!session.localBaseUrl || !session.localToken) throw new Error('Stiva locală nu este pornită.');

  await cloudSync.syncEventLocal({
    cloudBaseUrl: session.cloudBaseUrl,
    cloudToken: session.cloudToken,
    localBaseUrl: session.localBaseUrl,
    localToken: session.localToken,
    eventId,
    onProgress: (message) => sendToWindow('sync:progress', { direction: 'local', message }),
  });
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
