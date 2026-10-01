// Verificarea versiunii, la pornire.
//
// Launcherul ajunge pe laptopuri la care nu are nimeni acces: unul in sala
// unui club, altul la federatie. Daca o versiune noua ar trebui instalata
// de mana pe fiecare, in practica n-ar fi instalata nicaieri, iar in ziua
// competitiei ar porni o aplicatie veche peste un backend nou.
//
// Pe Windows se face singur: se descarca in fundal si se instaleaza cand
// omul alege sa reporneasca.
//
// Pe Mac nu se poate, si nu din lene. Mecanismul de actualizare al macOS
// (Squirrel) refuza sa instaleze peste o aplicatie nesemnata - e o
// conditie a sistemului, nu o setare pe care s-o putem schimba. Fara un
// certificat Apple, singurul lucru corect e sa spunem ca exista o versiune
// noua si sa deschidem pagina de descarcare. Daca vreodata se cumpara
// certificatul, aici e singurul loc de schimbat: se scoate ramura de mac si
// se lasa `downloadUpdate()` pentru amandoua.

const { app, dialog, shell } = require('electron');

// Aceeasi adresa ca pe pagina de instalare din panou: nu se schimba de la o
// versiune la alta, fiindca serverul cauta de fiecare data ultima versiune.
const PAGINA_DESCARCARE = 'https://github.com/gabimolocea/vovinam-admin/releases/latest';

async function anuntaPeMac(info) {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Versiune nouă',
    message: `A apărut versiunea ${info.version}.`,
    detail:
      `Tu ai ${app.getVersion()}. Pe Mac actualizarea nu se poate face singură, `
      + 'așa că descarcă fișierul și trage-l din nou peste folderul Applications.\n\n'
      + 'Fă asta acum, nu în dimineața competiției.',
    buttons: ['Descarcă', 'Mai târziu'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    await shell.openExternal(PAGINA_DESCARCARE);
  }
}

async function intreabaDeRepornire(autoUpdater, info) {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Versiune nouă, pregătită',
    message: `Versiunea ${info.version} e descărcată.`,
    detail:
      'Se instalează la repornirea aplicației. Dacă ești în mijlocul unei '
      + 'competiții, alege „Mai târziu" — nimic nu se întrerupe.',
    buttons: ['Repornește acum', 'Mai târziu'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) {
    autoUpdater.quitAndInstall();
  }
}

/**
 * Se cheama o data, dupa ce fereastra e deschisa.
 *
 * Totul e invelit in try/catch si in `catch` pe evenimentul de eroare: un
 * laptop fara internet - adica exact laptopul din sala, in ziua competitiei
 * - nu trebuie sa vada nicio fereastra de eroare pentru ca n-a putut
 * verifica versiunea. Nu e treaba lui atunci.
 */
function checkForUpdates() {
  if (!app.isPackaged) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (eroare) {
    console.warn('Verificarea versiunii nu e disponibila:', eroare.message);
    return;
  }

  // Nu descarcam nimic pana nu stim ca merita si ca se poate instala.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = process.platform === 'win32';

  autoUpdater.on('error', (eroare) => {
    console.warn('Nu am putut verifica versiunea:', eroare?.message || eroare);
  });

  autoUpdater.on('update-available', (info) => {
    if (process.platform === 'win32') {
      autoUpdater.downloadUpdate().catch((eroare) => {
        console.warn('Descarcarea versiunii noi a esuat:', eroare?.message || eroare);
      });
      return;
    }
    anuntaPeMac(info).catch(() => {});
  });

  autoUpdater.on('update-downloaded', (info) => {
    intreabaDeRepornire(autoUpdater, info).catch(() => {});
  });

  autoUpdater.checkForUpdates().catch((eroare) => {
    console.warn('Nu am putut verifica versiunea:', eroare?.message || eroare);
  });
}

module.exports = { checkForUpdates };
