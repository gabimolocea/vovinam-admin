// Semnarea ad-hoc a pachetului macOS, dupa ce electron-builder l-a construit.
//
// De ce e nevoie de pasul asta. Binarul Electron vine din fabrica cu o
// semnatura ad-hoc pusa de linker, pe identitatea "Electron". Cand
// electron-builder ii inlocuieste continutul cu al nostru si nu are niciun
// certificat cu care sa semneze, nu sterge semnatura veche - o lasa acolo,
// peste un pachet care intre timp s-a schimbat. Rezultatul e o semnatura
// care nu se mai potriveste cu ce semneaza:
//
//   Identifier=Electron ... flags=0x20002(adhoc,linker-signed)
//   Info.plist=not bound
//   code has no resources but signature indicates they must be present
//
// Pe Apple Silicon, o semnatura invalida nu da "aplicatie de la un
// dezvoltator neidentificat", ci "is damaged and can't be opened. You
// should move it to the Trash" - adica exact mesajul care trimite omul sa
// stearga aplicatia in loc s-o deschida. Nu e o avertizare, e o acuzatie.
//
// Semnata ad-hoc aici, semnatura chiar acopera pachetul si verificarea
// trece. Ramane o aplicatie nesemnata de un dezvoltator cunoscut - macOS
// tot va cere deschiderea prin clic dreapta prima data, si asta scrie si in
// ghid - dar nu mai e una stricata.
//
// Semnarea adevarata, cu certificat Apple Developer platit, ar scoate si
// pasul ala. Pana atunci, asta e diferenta dintre "nu stiu cine a facut-o"
// si "e stricata".

const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function semneazaAdHoc(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const pachet = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // --deep ca sa prinda si framework-urile si procesele ajutatoare
  // dinauntru: semnat doar la exterior, pachetul pica la fel de urat.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', pachet], {
    stdio: 'inherit',
  });

  // Verificam pe loc. Un build care iese cu semnatura stricata arata exact
  // ca unul bun pana ajunge pe calculatorul altcuiva, si abia acolo spune
  // ca aplicatia e deteriorata - prea tarziu, si pe ecranul altuia.
  execFileSync('codesign', ['--verify', '--deep', '--strict', pachet], {
    stdio: 'inherit',
  });
};
