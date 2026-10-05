// Pune versiunea in numele aplicatiei, inainte de impachetare.
//
// `productName` e un sir simplu - electron-builder nu inlocuieste ${version}
// acolo, cum face in artifactName. Scris de mana, ar fi ramas in urma la
// primul release in care cineva schimba doar `version`, iar aplicatia
// instalata ar fi mintit despre ce versiune e - exact lucrul pe care numele
// asta trebuie sa-l spuna.
//
// Scrie doar daca difera, ca sa nu murdareasca repo-ul la fiecare build.

const fs = require('fs');
const path = require('path');

const NUME = 'FRVV Competition Launcher';
const caleaPachetului = path.join(__dirname, '..', 'package.json');

const pachet = JSON.parse(fs.readFileSync(caleaPachetului, 'utf8'));
const asteptat = `${NUME} v${pachet.version}`;

if (pachet.build.productName === asteptat) {
  console.log(`Numele aplicatiei e la zi: ${asteptat}`);
} else {
  pachet.build.productName = asteptat;
  fs.writeFileSync(caleaPachetului, `${JSON.stringify(pachet, null, 2)}\n`);
  console.log(`Numele aplicatiei actualizat: ${asteptat}`);
}
