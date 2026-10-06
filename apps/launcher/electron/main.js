const { app, BrowserWindow, Menu, dialog, ipcMain, shell, webContents } = require('electron');
const os = require('os');

// `app.getVersion()` citeste package.json-ul aplicatiei si in dezvoltare, si
// impachetat. Daca vreodata n-ar raspunde, titlul ramane fara versiune in loc
// sa pice pornirea.
const TITLU_FEREASTRA = (() => {
  try {
    return `FRVV Competition Launcher v${app.getVersion()}`;
  } catch {
    return 'FRVV Competition Launcher';
  }
})();
const fs = require('fs');
const path = require('path');

const { getLanIp, getLanIps } = require('./network');
const { ServiceManager, buildServiceDefs, ensureLocalAdmin } = require('./services');
const { getRepoRoot, setRepoRoot } = require('./repoRoot');
const { checkForUpdates } = require('./updater');
const mdns = require('./mdns');

// Cipurile prin care device-urile ajung pe USB: USB-ul din ESP32 insusi
// (Espressif) si cele trei punti seriale care se gasesc pe placile ieftine.
// Folosite doar ca sa ghicim corect cand sunt mai multe porturi deschise.
const DEVICE_USB = [0x303a, 0x10c4, 0x1a86, 0x0403];
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
    // Versiunea sta in titlu, nu scrisa de mana undeva in interfata: cand se
    // raporteaza o problema din sala, primul lucru de aflat e ce versiune
    // ruleaza calculatorul ala - iar pe un calculator imprumutat in ziua
    // competitiei poate fi oricare. Luata din package.json, deci nu ramane in
    // urma la urmatorul release.
    title: TITLU_FEREASTRA,
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
  // Competition day: the operator runs the whole venue from this window,
  // with an app embedded full-bleed inside it - so open filling the screen
  // instead of a 1100px box they'd resize by hand every morning. Maximised,
  // not macOS's real fullscreen: that hides the menu bar, and the Sync and
  // Backup commands live there. The size above stays as the restore size
  // for when they un-maximise.
  mainWindow.maximize();

  // Altfel <title> din pagina - si titlul paginii dintr-un <webview> deschis -
  // ar lua locul celui de sus, si versiunea ar disparea de indata ce se
  // incarca ceva.
  mainWindow.on('page-title-updated', (eveniment) => eveniment.preventDefault());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    activeWebviewContents = contents;
    contents.on('destroyed', () => {
      if (activeWebviewContents === contents) activeWebviewContents = null;
    });
    // Bifa din meniu se ia din pagina, de fiecare data cand se incarca una:
    // altfel ar arata ce credea launcherul la pornire, nu ce e pus pe
    // calculatorul asta.
    contents.on('did-finish-load', () => {
      if (esteAdresaLocala(contents.getURL())) potrivesteGhidulDupaPagina(contents);
    });
    // Butonul TV din competition-admin e un link cu target="_blank". Intr-un
    // <webview> ferestrele noi sunt oprite din start, deci apasarea nu facea
    // nimic si nici nu spunea de ce. Aici o prindem si deschidem noi
    // fereastra: una adevarata, pe care operatorul o poate trage pe
    // proiectorul din sala - ceea ce e tot rostul butonului.
    contents.setWindowOpenHandler(({ url }) => {
      if (esteAdresaLocala(url)) deschideFereastraSala(url);
      // Orice altceva pleaca in browserul de sistem: o pagina straina n-are
      // ce cauta intr-o fereastra a aplicatiei.
      else if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
  mainWindow.loadURL(startUrl);
}

// Terenurile evenimentului activ, pentru meniul cu ecranele din sala. Se
// umple singur cand stiva locala e pornita; pana atunci meniul arata de ce nu
// are ce lista, in loc sa fie gol fara explicatie.
let terenuri = [];

function adresaEcranului(terenId) {
  const gazda = session.lanIp || 'localhost';
  const portul = PORTURI_DE_VERIFICAT.find((s) => s.cheie === 'public-display')?.port || 5177;
  return `http://${gazda}:${portul}/display/${terenId}`;
}

// Intrarea la masa centrala a unui teren. Se deschide cu PIN-ul de arbitru,
// deci poate fi dat oricui se aseaza acolo - nu e o adresa de admin.
function adresaMesei(terenId) {
  const gazda = session.lanIp || 'localhost';
  const portul = PORTURI_DE_VERIFICAT.find((s) => s.cheie === 'competition-admin')?.port || 5191;
  return `http://${gazda}:${portul}/masa/${terenId}`;
}

// Pagina cu un cod QR per teren, de aratat dimineata. Nu cuprinde un teren
// anume, deci are nevoie de evenimentul activ, nu de lista de terenuri.
function adresaCodurilor() {
  const gazda = session.lanIp || 'localhost';
  const portul = PORTURI_DE_VERIFICAT.find((s) => s.cheie === 'competition-admin')?.port || 5191;
  return `http://${gazda}:${portul}/competitions/${session.eventId}/mese`;
}

// Intoarce true daca lista s-a schimbat, ca sa nu reconstruim meniul degeaba
// la fiecare verificare de zece secunde.
async function aduTerenurile() {
  if (!session.localBaseUrl || !session.eventId) {
    const eraCeva = terenuri.length > 0;
    terenuri = [];
    return eraCeva;
  }
  try {
    const raspuns = await fetch(
      `${session.localBaseUrl}/api/competition-fields/?event_id=${session.eventId}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!raspuns.ok) return false;
    const noi = (await raspuns.json()).map((t) => ({ id: t.id, nume: t.name, numar: t.field_number }));
    const seSchimba = JSON.stringify(noi) !== JSON.stringify(terenuri);
    terenuri = noi;
    return seSchimba;
  } catch {
    // Fara backend local - pastram ce stiam, ca sa nu dispara din meniu la o
    // singura cerere cazuta.
    return false;
  }
}

// Ferestrele deschise din aplicatii (ecranul public), dupa adresa. Fara ele,
// fiecare apasare pe TV ar deschide inca o fereastra peste cea dinainte.
const ferestreSala = new Map();

// Ghidul pas cu pas al mesei centrale, comutat din meniul View.
//
// Setarea sta in localStorage-ul paginii de administrare - ea o citeste la
// fiecare pas, si ramane pusa si dupa inchidere. Aici tinem doar o oglinda a
// ei, ca linia din meniu sa poata fi bifata; oglinda se potriveste citind
// pagina cand se incarca, nu scriindu-i noi o valoare inventata la pornire.
let ghidInteractiv = true;

const COD_CITESTE_GHID = "(() => { try { return localStorage.getItem('ghidInteractiv') !== 'off'; } catch (e) { return true; } })()";

const codScrieGhid = (pornit) => `(() => { try {`
  + (pornit ? ` localStorage.removeItem('ghidInteractiv');` : ` localStorage.setItem('ghidInteractiv', 'off');`)
  + ` window.dispatchEvent(new Event('frvv:ghid')); } catch (e) {} })()`;

// Toate paginile din sala, nu doar cea din fata: masa centrala poate avea
// deschise si ferestre separate, iar setarea descrie calculatorul intreg.
function paginileSalii() {
  return webContents.getAllWebContents().filter(
    (c) => !c.isDestroyed() && esteAdresaLocala(c.getURL()),
  );
}

async function trimiteGhidul(pornit) {
  const cod = codScrieGhid(pornit);
  for (const c of paginileSalii()) {
    try { await c.executeJavaScript(cod); } catch { /* pagina s-a schimbat intre timp */ }
  }
}

async function potrivesteGhidulDupaPagina(contents) {
  try {
    const pornit = await contents.executeJavaScript(COD_CITESTE_GHID);
    if (typeof pornit === 'boolean' && pornit !== ghidInteractiv) {
      ghidInteractiv = pornit;
      buildMenu();
    }
  } catch { /* pagina nu e (inca) acolo */ }
}

// Numai ce servim noi: localhost si adresa din retea a calculatorului asta,
// pe porturile serviciilor locale. Orice altceva nu e "sala".
function esteAdresaLocala(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const porturiLocale = PORTURI_DE_VERIFICAT.map((s) => String(s.port));
    if (!porturiLocale.includes(u.port)) return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') return true;
    // Adresa din LAN a calculatorului asta - cand interfata e deschisa prin ea.
    return Object.values(os.networkInterfaces()).some((adrese) => (adrese || []).some(
      (a) => a.family === 'IPv4' && !a.internal && a.address === u.hostname,
    ));
  } catch {
    return false;
  }
}

function deschideFereastraSala(url) {
  const deschisa = ferestreSala.get(url);
  if (deschisa && !deschisa.isDestroyed()) {
    // A doua apasare nu mai face o fereastra: o aduce in fata pe cea care e
    // deja, poate pe celalalt ecran.
    deschisa.show();
    deschisa.focus();
    return;
  }

  const fereastra = new BrowserWindow({
    width: 1280,
    height: 720,
    title: `Ecran sală — ${TITLU_FEREASTRA}`,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  fereastra.on('page-title-updated', (eveniment) => eveniment.preventDefault());
  fereastra.on('closed', () => ferestreSala.delete(url));
  fereastra.loadURL(url);
  ferestreSala.set(url, fereastra);
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
// Starea salii, in bara de meniu.
//
// Pe tot parcursul competitiei, panoul sta deschis pe tot ecranul. Cand ceva
// nu merge - o tableta care nu se conecteaza, un arbitru care nu apare -
// intrebarea e mereu aceeasi: mai merge reteaua? Raspunsul trebuie sa fie la
// vedere, dar nu cu pretul unei benzi peste aplicatie.
//
// Titlul meniului arata cifra care conteaza, iar inauntru sunt detaliile.
let stareSala = null;
let cronometruStare = null;

function titluStare() {
  if (!stareSala) return 'Sala';
  const jos = Object.values(stareSala.legaturi || {}).filter((v) => !v).length;
  if (jos) return `Sala — ${jos} oprite`;
  const arbitri = stareSala.aparate?.arbitri;
  return typeof arbitri === 'number' ? `Sala — ${arbitri} arbitri` : 'Sala';
}

function meniuStare() {
  const legaturi = stareSala?.legaturi || {};
  const aparate = stareSala?.aparate;
  const nume = {
    backend: 'Serverul competiției',
    'competition-admin': 'Administrare',
    'referee-scoring': 'Arbitraj',
    'public-display': 'Ecran public',
  };

  const randuri = Object.entries(nume).map(([cheie, eticheta]) => ({
    label: `${legaturi[cheie] ? '●' : '○'}  ${eticheta}`,
    enabled: false,
  }));

  if (aparate) {
    randuri.push(
      { type: 'separator' },
      { label: `${aparate.arbitri} arbitri conectați`, enabled: false },
      { label: `   ${aparate.device_arbitru} de pe Device Arbitru, ${aparate.telefoane_arbitraj} de pe telefon`, enabled: false },
      { label: `   ${aparate.administrare} secretariat, ${aparate.ecrane} ecrane`, enabled: false },
    );
  }

  randuri.push(
    { type: 'separator' },
    {
      label: 'Configurează Device Arbitru…',
      click: () => {
        sendToWindow('menu:device-wifi');
        mainWindow?.focus();
      },
    },
  );

  return { label: titluStare(), submenu: randuri };
}

// Reconstruim meniul doar cand se schimba ceva: pe macOS, inlocuirea lui in
// timp ce cineva il tine deschis il inchide sub mana.
function porneteUrmarireaStarii() {
  if (cronometruStare) return;

  const verifica = async () => {
    const gazda = session.lanIp;
    if (!gazda) return;
    try {
      const noua = await verificaLegaturi(gazda);
      const inainte = titluStare();
      stareSala = noua;
      // Terenurile se verifica in aceeasi bucla: apar dupa ce stiva locala
      // porneste, deci meniul construit la pornire nu le poate avea.
      const terenuriSchimbate = await aduTerenurile();
      if (titluStare() !== inainte || terenuriSchimbate) buildMenu();
    } catch {
      // Fara retea - titlul ramane cel de dinainte, nu stergem ce stiam.
    }
  };

  verifica();
  cronometruStare = setInterval(verifica, 10000);
}

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
        // Indrumarea e pentru cineva care tine masa prima oara. Cine a facut-o
        // de zeci de ori o stinge de aici, si ramane stinsa.
        {
          label: 'Ghid interactiv (pas cu pas)',
          type: 'checkbox',
          checked: ghidInteractiv,
          click: (item) => {
            ghidInteractiv = item.checked;
            trimiteGhidul(item.checked);
          },
        },
        { type: 'separator' },
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
        { type: 'separator' },
        // Ecranele din sala, fiecare pe terenul lui. Doua feluri de deschis,
        // fiindcă sunt doua situatii: fereastra se trage pe proiector fara sa
        // iesi din aplicatie, iar browserul e pentru cand proiectorul atarna
        // de alt calculator sau vrei ecran complet adevarat.
        {
          label: 'Ecran sală — fereastră nouă',
          submenu: terenuri.length
            ? terenuri.map((t) => ({
              label: t.nume || `Teren ${t.numar}`,
              click: () => deschideFereastraSala(adresaEcranului(t.id)),
            }))
            : [{ label: 'Pornește întâi competiția', enabled: false }],
        },
        {
          label: 'Ecran sală — în browser',
          submenu: terenuri.length
            ? terenuri.map((t) => ({
              label: t.nume || `Teren ${t.numar}`,
              click: () => shell.openExternal(adresaEcranului(t.id)),
            }))
            : [{ label: 'Pornește întâi competiția', enabled: false }],
        },
        { type: 'separator' },
        // Pagina pe care o primeste arbitrul care se aseaza la masa centrala.
        // In browser, nu in fereastra launcherului: masa sta de obicei pe alt
        // calculator decat cel care tine competitia.
        {
          label: 'Masă centrală — fereastră nouă',
          submenu: terenuri.length
            ? terenuri.map((t) => ({
              label: t.nume || `Teren ${t.numar}`,
              click: () => deschideFereastraSala(adresaMesei(t.id)),
            }))
            : [{ label: 'Pornește întâi competiția', enabled: false }],
        },
        {
          label: 'Masă centrală — arată codurile pentru mese',
          enabled: Boolean(session.eventId),
          click: () => deschideFereastraSala(adresaCodurilor()),
        },
        {
          label: 'Masă centrală — în browser',
          submenu: terenuri.length
            ? terenuri.map((t) => ({
              label: t.nume || `Teren ${t.numar}`,
              click: () => shell.openExternal(adresaMesei(t.id)),
            }))
            : [{ label: 'Pornește întâi competiția', enabled: false }],
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
    meniuStare(),
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

// Fara sa stim unde e proiectul, launcherul nu poate porni nimic: nici
// backendul, nici interfetele, nici stiva Docker. Rulat din sursa se
// deduce singur; aplicatia impachetata insa nu are de unde sti, asa ca
// intrebam o data si tinem minte raspunsul.
//
// Intrebam inainte sa apara fereastra principala, altfel operatorul ar
// vedea un panou de control care esueaza la fiecare apasare.
async function ensureRepoRootKnown() {
  if (getRepoRoot()) return true;

  // Pe laptopul din sala nu exista cod, si asa trebuie sa fie: stiva vine
  // ca imagini gata facute (docker-compose.venue.yml, purtat in aplicatie).
  // Intrebam de folder doar cand aplicatia ruleaza din sursa si l-am
  // pierdut - adica pe calculatorul unui dezvoltator.
  if (app.isPackaged) return true;

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Unde este proiectul?',
    message: 'Nu găsesc proiectul pe acest calculator.',
    detail:
      'Launcherul pornește baza de date, backendul și cele trei aplicații '
      + 'din folderul proiectului, așa că trebuie să știe unde se află.\n\n'
      + 'Alege folderul în care ai descărcat proiectul — cel care conține '
      + 'folderul "backend".',
    buttons: ['Alege folderul', 'Închide'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return false;

  // Se repeta pana cand folderul ales e chiar proiectul: un folder gresit
  // ales din graba ar duce la erori de pornire fara nicio legatura vizibila
  // cu alegerea de aici.
  for (;;) {
    const picked = await dialog.showOpenDialog({
      title: 'Alege folderul proiectului',
      properties: ['openDirectory'],
      buttonLabel: 'Folosește folderul',
    });
    if (picked.canceled || !picked.filePaths.length) return false;

    const chosen = picked.filePaths[0];
    if (setRepoRoot(chosen)) return true;

    const { response: retry } = await dialog.showMessageBox({
      type: 'error',
      title: 'Nu este folderul potrivit',
      message: 'Folderul ales nu pare să fie proiectul.',
      detail: `${chosen}\n\nAștept un folder care conține "backend", `
        + '"docker-compose.local.yml" și "package.json".',
      buttons: ['Încearcă din nou', 'Închide'],
      defaultId: 0,
      cancelId: 1,
    });
    if (retry !== 0) return false;
  }
}

app.whenReady().then(async () => {
  // The packaged .app already carries the federation logo as its bundle
  // icon (build/icon.icns, wired into electron-builder's mac config) -
  // this only matters for `npm run dev`, which runs unpackaged and would
  // otherwise show Electron's own default icon in the dock.
  //
  // `isPackaged` nu e de ornament: build/icon.png nu intra in pachet, iar
  // setIcon arunca pe o cale inexistenta. Cum asta e prima instructiune de
  // la pornire, aplicatia construita se oprea aici si nu mai ajungea sa
  // deschida nicio fereastra - de afara arata ca o aplicatie care sta in
  // Dock si nu raspunde la clic. Tot in `try` a ramas: o iconita lipsa nu
  // e motiv sa nu porneasca programul.
  if (process.platform === 'darwin' && !app.isPackaged) {
    try {
      app.dock.setIcon(path.join(__dirname, '..', 'build', 'icon.png'));
    } catch (error) {
      console.warn('Nu am putut pune iconita in Dock:', error.message);
    }
  }
  if (!(await ensureRepoRootKnown())) {
    app.quit();
    return;
  }
  // Device-urile Arbitru se configureaza prin cablu, din fereastra
  // aplicatiei (Web Serial). Electron nu da acces la porturi fara ca
  // procesul principal sa aleaga explicit unul - fara bucata asta,
  // `navigator.serial.requestPort()` nu intoarce niciodata nimic, si fara
  // nicio eroare.
  const { session } = require('electron');
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => (
    permission === 'serial' || permission === 'serial-port'
  ));
  // Fara asta, `navigator.serial.getPorts()` intoarce mereu gol, iar o
  // device-ul deja aprobata trebuie aleasa din nou la fiecare deschidere a
  // ecranului. Cu ea, aprobarea tine, si ecranul se deschide direct conectat.
  session.defaultSession.setDevicePermissionHandler((detalii) => detalii.deviceType === 'serial');

  session.defaultSession.on('select-serial-port', (event, ports, _wc, callback) => {
    event.preventDefault();
    if (!ports.length) {
      callback('');
      return;
    }
    // Se configureaza o device-ul pe rand, deci alegem noi in loc sa punem
    // operatorul sa aleaga dintr-o lista de nume ca "/dev/cu.usbmodem101",
    // care nu-i spun nimic. Daca sunt mai multe, o preferam pe cea care
    // arata a device-ul.
    const alesa = ports.find((p) => DEVICE_USB.includes(Number(p.vendorId))) || ports[0];
    sendToWindow('serial:port-ales', { nume: alesa.displayName || alesa.portName || alesa.portId });
    callback(alesa.portId);
  });

  createWindow();
  buildMenu();

  // Dupa fereastra, nu inainte: verificarea vorbeste prin ferestre de
  // dialog, iar acelea au nevoie de o fereastra parinte ca sa apara unde
  // trebuie.
  checkForUpdates();
});

app.on('window-all-closed', () => {
  getServiceManager().stopAll();
  if (process.platform !== 'darwin') app.quit();
});

// Pe macOS inchiderea ferestrei nu inchide aplicatia (vezi mai sus - asa e
// obiceiul pe mac). Fara asta insa, aplicatia ramane in Dock fara nicio
// fereastra: un click pe iconita, sau un `open` din terminal, trimite doar
// evenimentul `activate`, pe care nu-l asculta nimeni, si nu se mai
// deschide nimic pana la fortarea inchiderii.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    buildMenu();
  }
});

app.on('before-quit', () => {
  getServiceManager().stopAll();
  mdns.stop();
});

ipcMain.handle('auth:login', async (_event, { baseUrl, email, password }) => {
  // Lucram cu adresa asa cum a iesit dupa indreptare (schema completata,
  // "/" de la coada scos, http trecut la https daca serverul a cerut-o),
  // nu cu ce s-a tastat: altfel fiecare cerere de mai tarziu ar porni din
  // nou pe drumul gresit.
  const { user, access, baseUrl: adresaFolosita } = await cloudSync.login(baseUrl, email, password);
  session = { ...session, cloudBaseUrl: adresaFolosita, cloudToken: access, email, password };
  return { user, baseUrl: adresaFolosita };
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

ipcMain.handle('services:defs', async () => buildServiceDefs(session.lanIp || getLanIp(), {
  useDocker: session.useDocker,
  frontendsFromDocker: !getRepoRoot(),
}));

// Panoul de control le cere la deschidere: evenimentele au plecat deja, cat
// pornea stiva, si nu le-a auzit nimeni.
ipcMain.handle('services:statuses', async () => getServiceManager().statuses);

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

  // Device-urile Arbitru cauta serverul dupa nume, nu dupa adresa (vezi
  // mdns.js). De aici incolo raspundem la acel nume cu adresa de acum.
  mdns.start(lanIp, { onLog: (line) => sendToWindow('service:log', { id: 'backend', line }) });
  mdns.update(lanIp);
  // Fara cod pe disc nu exista nici backend de pornit cu Python, nici
  // interfete de pornit cu npm: totul vine din containere.
  const dinSala = !getRepoRoot();
  if (dinSala) useDocker = true;
  session.useDocker = useDocker;

  const manager = getServiceManager();

  if (useDocker) {
    await dockerBackend.startDockerBackend({
      lanIp,
      onLog: (line) => sendToWindow('service:log', { id: 'backend', line }),
    });
  }
  const defs = manager.startAll(lanIp, { useDocker, frontendsFromDocker: dinSala });

  // De aici incolo stim adresa din retea, deci putem urmari starea salii si
  // s-o aratam in bara de meniu.
  porneteUrmarireaStarii();

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
  // `alteAdrese` exista pentru calculatorul care e in doua retele odata (un
  // Mac facut hotspot): tabletele sunt pe cealalta decat cea aleasa aici.
  return { lanIp, urls, alteAdrese: getLanIps().filter((a) => a !== lanIp) };
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
// Verificarea legaturilor din sala se face de aici, nu din fereastra.
//
// Din fereastra nu se poate: cele trei interfete sunt fisiere statice
// servite de nginx, fara antete CORS, deci browserul blocheaza cererea si
// le-ar arata cazute desi raspund. Un ecran de verificare care minte e mai
// rau decat niciunul - cineva ar cauta o defectiune care nu exista, cu cinci
// minute inainte de start. Aici nu exista CORS.
const PORTURI_DE_VERIFICAT = [
  { cheie: 'backend', port: 8000, cale: '/health/' },
  { cheie: 'competition-admin', port: 5191, cale: '/' },
  { cheie: 'referee-scoring', port: 5176, cale: '/' },
  { cheie: 'public-display', port: 5177, cale: '/' },
];

async function raspunde(url, ms = 3000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'manual' });
    // Si o redirectionare inseamna ca ceva asculta si raspunde - backendul
    // local trimite `/` catre /admin/, de pilda.
    return r.status > 0;
  } catch {
    return false;
  }
}

async function verificaLegaturi(gazda) {
  const host = gazda || 'localhost';

  const legaturi = Object.fromEntries(await Promise.all(
    PORTURI_DE_VERIFICAT.map(async (p) => [p.cheie, await raspunde(`http://${host}:${p.port}${p.cale}`)]),
  ));

  let aparate = null;
  try {
    const r = await fetch(`http://${host}:8000/api/local/connectivity/`, {
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) aparate = await r.json();
  } catch {
    // Server vechi sau oprit - fereastra arata singura ca nu poate citi.
  }

  return { legaturi, aparate };
}

ipcMain.handle('health:check', async (_event, { gazda } = {}) => verificaLegaturi(gazda));

ipcMain.handle('shell:open-external', async (_event, url) => {
  await shell.openExternal(url);
});

// AppViewPage.jsx reports which local app's URL is currently on screen (or
// null once it's closed), so the Window menu item above knows what to open.
ipcMain.on('app-view:set-active-url', (_event, url) => {
  activeAppUrl = url || null;
});
