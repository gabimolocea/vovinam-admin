# Device Arbitru (ESP32-S3, ecran tactil)

Acelaşi **Device Arbitru** ca varianta cu encoder
([`devices/referee-esp32c3`](../referee-esp32c3/README.md)), pe
**Waveshare ESP32-S3-Touch-LCD-2.8** — ST7789 240×320 cu panou capacitiv
CST328. Nicio piesă de lipit: tot ce era buton sau rotire e acum o zonă de
ecran.

Fluxul de arbitraj, API-ul, PIN-ul, prezenţa şi diagnoza de WiFi sunt
identice. **Pentru ele citeşte README-ul plăcii C3** — aici stă doar ce e
diferit, ca să nu existe două descrieri ale aceluiaşi lucru care să se
despartă în timp.

## Ce s-a schimbat, şi de ce

| Pe C3 | Aici | De ce |
|---|---|---|
| PIN format învârtind encoderul, cifră cu cifră | Tastatură numerică, `<` şterge, `OK` intră | Cinci apăsări în loc de până la cincizeci de clicuri. Cifrele netastate se arată cu liniuţă, nu cu zero — un zero acolo s-ar citi ca o cifră dată |
| Nota ±1 din rotire | Patru trepte: `-10 -1 +1 +10`, plus `TRIMITE 88` | Degetul nu are inerţie. De la 100 la 72 sunt cinci apăsări, nu 28 de clicuri |
| Patru butoane lipite la lupte | Patru sferturi de ecran | Un sfert de ecran se nimereşte fără să te uiţi; de-asta sunt sferturi, nu butoane mici |
| Apăsare lungă = ieşire | Bara de sus → „PREDAI DISPOZITIVUL?" cu DA/NU | O apăsare lungă nu se face din greşeală. Bara de sus se atinge cu cotul, deci se întreabă întâi |
| Butoane citite pe întrerupere | Panou citit de un task pe nucleul 0 | Bucla principală stă blocată în cereri HTTP. O atingere **nu** se poate citi din întrerupere (cere I2C), dar S3 are două nuclee — deci se citeşte în paralel şi aşteaptă în coadă |
| 240×240 | 240×320 | Lăţimea a rămas 240 intenţionat, deci tot ce era desenat pe orizontală s-a aşezat la fel. Cei 80 de pixeli în plus sunt exact tastatura, treptele şi butonul de trimitere |

Encoderul lipseşte complet. Pe ecranele unde nu e nimic de apăsat —
`ÎN AŞTEPTARE` — chiar nu e nimic de apăsat, ca şi înainte.

## Pini

Nu se pot alege: sunt cum i-a legat Waveshare.

| Ce | GPIO |
|---|---|
| LCD MOSI / SCLK | 45 / 40 |
| LCD CS / DC / RST | 42 / 41 / 39 |
| Lumină de fundal | 5 |
| Touch SDA / SCL | **1 / 3** |
| Touch INT / RST | 4 / 2 |
| Buton alimentare / control | 6 / 7 |

**Toți pinii de mai sus sunt verificaţi împotriva codului demo oficial
Waveshare** (`ESP32-S3-Touch-LCD-2.8-Demo.zip`), nu luaţi din tabelele
wiki-ului — acelea amestecă magistrala panoului tactil cu cea a conectorului
de 12 pini, iar confuzia costă o seară.

Panoul tactil nu are driver scris de noi: `Touch_CST328.cpp/h` de lângă sketch
sunt fişierele producătorului, luate ca atare. Scrisesem unul propriu, derivat
din ESPHome; l-am înlocuit după ce portarea pe o placă înrudită a arătat cât de
scump e să deduci un driver în loc să-l foloseşti pe cel al producătorului.

Alimentarea urmează tot logica lor: pinul de control porneşte jos şi se ridică
doar dacă butonul e ţinut apăsat — aşa se aprinde placa de pe baterie. Pe USB
curentul vine oricum.

`TOUCH_INT` e legat, dar nu-l folosim: atingerea se citeşte pe I2C, iar I2C
nu se face din întrerupere. E definit în cod ca să se vadă că e cunoscut, nu
uitat.

Lumina de fundal se aprinde **după** ce ecranul are ceva de arătat.
Controlerul porneşte cu ce i-a rămas în memorie, şi fără asta la fiecare
alimentare se vede o jumătate de secundă de zgomot colorat înainte de siglă.

**Dacă ecranul rămâne negru**, prima suspiciune e că ai în mână alt model din
aceeaşi familie: **2.8B** şi **2.8C** au alt controler de ecran şi alţi pini.
A doua, dacă culorile arată inversate: schimbă `true` în `false` la
parametrul IPS din `new Arduino_ST7789(...)`.

## Compilare

Placă: **Waveshare ESP32-S3-Touch-LCD-2.8**. Există în nucleul ESP32 de la
versiunea 3.x şi e cea de ales — vine deja configurată cu 16 MB flash la
120 MHz, QIO, PSRAM pe OPI şi partiţii de 3 MB pentru aplicaţie.

Din tot meniul, **un singur lucru trebuie schimbat**:

| Setare | Valoare | De ce |
|---|---|---|
| USB CDC On Boot | **Enabled** | placa porneşte cu ea stinsă, şi fără ea nu compilează |

Restul lasă-le cum vin. Atenţie la ce **nu** există pe placa asta: nu are meniu
*Flash Size* (e fix 16 MB), iar opţiunea de PSRAM se numeşte simplu `Enabled`,
nu `OPI PSRAM` — tipul OPI e deja implicit.

Merge şi pe **ESP32S3 Dev Module**, dar atunci flash-ul, PSRAM-ul şi schema de
partiţii se pun de mână: trei ocazii de greşeală în loc de niciuna.

Placa dedicată **nu aduce pinii ecranului**. Varianta ei defineşte doar I2C
(`SDA 11`, `SCL 10` — exact ce foloseşte sketch-ul), UART-ul, şi un SPI generic
pe 34–37 care nu are legătură cu LCD-ul. De-asta pinii din tabelul de mai sus
rămân scrişi explicit în cod.

Biblioteci: `GFX Library for Arduino` (Arduino_GFX) şi `ArduinoJson` v7.

Panoul tactil **nu cere bibliotecă**: driverul e `cst328.h`, lângă sketch.
Scris acolo fiindcă dintre cele existente una vrea ESPHome, iar alta aduce un
strat de evenimente peste care oricum ar fi venit al nostru. Ne trebuie trei
lucruri — porneşte, răspunde, spune unde e degetul — şi niciunul din
celelalte patru.

Sketch-ul stă pe la 37% din partiţia de 3 MB, deci schema implicită e
suficientă aici — pe C3 era nevoie de *Huge APP*.

Ca pe C3, **setările de placă se resetează la actualizarea nucleului
ESP32**. Dacă o compilare care mergea până ieri se opreşte cu
`'class HardwareSerial' has no member named 'setTxTimeoutMs'`, e USB CDC
care a sărit pe implicit — e singura cauză a erorii ăsteia, nu e nimic de
schimbat în cod.

Avertismentul `Multiple libraries were found for "WiFi.h"` e inofensiv: se
foloseşte cea din nucleu, care e cea bună. Vine dintr-un folder `WiFi` rătăcit
în `~/Documents/Arduino/libraries`.

## Dacă apeşi roşu şi punctul pleacă albastrului

Panoul şi ecranul sunt două piese lipite una peste alta, şi nimic nu
garantează că au aceeaşi idee despre unde e stânga. Pe plăcile pe care am
lucrat se potrivesc, dar e genul de lucru care se schimbă între două loturi
din acelaşi model — şi când se schimbă **nu arată ca o defecţiune**: pe ecran
totul pare în regulă, doar punctul pleacă culorii greşite.

Nu se repară prin reprogramare. Prin cablu:

```
TEST                    porneşte proba, 3 minute
```

Apasă în fiecare colţ. Pentru fiecare atingere, device-ul răspunde cu
coordonata brută a panoului şi cu cea dusă în ecran:

```
ATINGERE	<rawX>	<rawY>	<x>	<y>	<rol>
```

Dacă `x` creşte când ar trebui să scadă, sau cele două axe sunt schimbate
între ele:

```
TOUCH?                  cum e configurat acum
TOUCH=nyn               trei litere: axe schimbate, X întors, Y întors
```

`n` = nu, `y` = da. `nnn` e montajul aşteptat. Se salvează în memoria
device-ului, deci se repară o dată şi rezistă la repornire — ca reţeaua şi ca
rolurile sferturilor.

## Ce rol are fiecare sfert

Acelaşi `BTN=` ca pe C3, cu acelaşi format, dar ordinea nu mai e a firelor
lipite — e **stânga-sus, stânga-jos, dreapta-sus, dreapta-jos**:

```
BTN?                    ce roluri are acum
BTN=r2,r1,a2,a1         implicit: punctul mare sus, roşul în stânga
```

Un arbitru stângaci vrea roşul în dreapta: `BTN=a2,a1,r2,r1`. Schimbarea se
aplică peste tot — şi la sferturile din timp real, şi la butoanele de sub
jumătăţi la afişare finală, şi la butoanele de decizie finală. Intenţionat:
altfel un arbitru care a mutat roşul în dreapta l-ar găsi în stânga exact
când decide învingătorul.

## Proba din launcher

Pagina de device din launcher (`DeviceWifiPage`) funcţionează **nemodificată**:
firmware-ul trimite şi linia veche `BUTON\t<n>\t<rol>` pe care pagina o
aşteaptă deja, deci punctele celor patru sferturi se aprind ca înainte. Linia
`ATINGERE` e în plus şi e ignorată de pagină — pentru coordonate deschide un
monitor serial obişnuit.

Un singur lucru nu se aprinde: **punctul encoderului**, fiindcă placa nu are
encoder. Nu e o defecţiune.

## Ce rămâne neverificat pe hardware

Codul compilează curat pentru ESP32-S3 şi geometria zonelor e verificată
automat — nicio zonă în afara ecranului, nicio suprapunere, iar cele patru
sferturi acoperă exact suprafaţa dintre bara de sus şi banda de jos, ca să nu
existe loc în care arbitrul apasă şi nu se întâmplă nimic.

Dar **nu a rulat încă pe placă**. Două lucruri se văd abia acolo:

1. **Orientarea atingerii** — vezi mai sus, se reglează din `TOUCH=`.
2. **Dacă panoul e CST328 sau CST3530.** Placa se livrează cu ambele (V1 şi
   V2). Vorbesc acelaşi protocol, iar driverul nu refuză un firmware
   necunoscut — doar scrie pe serial `CST328: firmware 0x.... în loc de
   0xCACA - continui oricum`. Mesajul ăsta **nu e o eroare**; dacă atingerile
   funcţionează, e doar informativ.

La pornire, device-ul scrie pe serial ce a găsit:

```
CST328: cip 0x0000, panou 240x320
```

Dacă panoul tace, scanează magistralele cu `I2C?`:

```
I2C	SDA1/SCL3	0x1A	panou tactil CST328
I2C	SDA1/SCL3	0x51	ceas PCF85063
I2C	SDA1/SCL3	0x6B	IMU QMI8658
```

Scanarea deosebeşte două probleme pe care un simplu „nu răspunde" le
confundă: dacă se văd ceasul şi IMU-ul dar nu panoul, pinii sunt buni şi
panoul e de vină; dacă nu se vede nimeni, e invers. Aceeaşi scanare rulează
singură la pornire când panoul nu răspunde.

Dacă în loc de asta scrie `CST328 nu răspunde pe I2C`, ecranul arată
`PANOUL TACTIL NU RĂSPUNDE` şi porneşte oricum — restul pornirii spune dacă
WiFi-ul şi serverul sunt în regulă, deci se vede că singura piesă de vină e
panoul. Fără panou, aparatul nu are nicio intrare: nu se poate forma PIN-ul.
