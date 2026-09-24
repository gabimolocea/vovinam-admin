# Arbitru pe ESP32-C3 (tehnică)

Firmware pentru un dispozitiv fizic de arbitraj: **ESP32-C3 mini + display
ST7789 240×240 + encoder KY-040**. Face acelaşi lucru ca aplicaţia web de
arbitraj pentru probele de tehnică (`apps/referee-scoring`, ecranul
`ScoringPanel`), dar fără browser — arbitrul are un singur buton rotativ.

Lupta nu e acoperită aici: acolo se punctează pe evenimente în timpul
meciului, alt flux (`MatchScoring`). Categoriile de luptă sunt filtrate din
listă, nu apar pe dispozitiv.

## Ce face

1. Se conectează la WiFi-ul sălii.
2. Arbitrul îşi formează PIN-ul de 5 cifre din encoder
   (`POST /api/referee-pin-login/`).
3. Cere categoriile la care arbitrul e alocat
   (`GET /api/referees/me/assigned-categories/`), păstrează doar tehnica.
4. În categorie: sportivii înscrişi, notele deja trimise de acest arbitru,
   şi cine e pe saltea acum după monitorul sălii.
5. Trimite nota 0..100 (`POST /api/category-referee-score/`). Serverul face
   upsert, deci retrimiterea corectează nota, nu adaugă una nouă.
6. Raportează prezenţa pe categorie la 20 s, ca să apară online în admin.

## Comenzi

| Acţiune | Efect |
|---|---|
| Roteşte | cifra PIN-ului, selecţia (categorie / sportiv), sau nota |
| Apasă scurt | cifra următoare / intri / trimiţi nota |
| Apasă lung (>0,7 s) | cifra anterioară / înapoi un ecran |

Un singur buton, două intenţii — placa nu are altul liber.

Din lista de categorii, apăsarea lungă închide sesiunea: dispozitivul se
întoarce la ecranul de PIN şi îl poate lua următorul arbitru.

## Configurare

În capul fişierului `.ino`, şi niciuna per arbitru:

```cpp
const char* WIFI_SSID     = "...";
const char* WIFI_PASS     = "...";
const char* API_HOST      = "192.168.0.197";        // IP-ul din launcher
const char* API_MDNS_NAME = "Gabis-MacBook-Pro";    // plasa de siguranţă
```

`API_HOST` e IP-ul afişat mare în launcher. Totul stă în LAN-ul sălii, deci
fără HTTPS.

**IP-ul se schimbă** — e dat de DHCP, iar o simplă trecere de pe o reţea pe
alta l-a mutat deja odată, de la `.129` la `.197`. De aceea, dacă adresa
configurată nu răspunde, placa întreabă reţeaua unde e calculatorul **după
nume**, prin Bonjour/mDNS — ce anunţă macOS singur. Aşa un IP schimbat peste
noapte nu înseamnă reflashuit toate dispozitivele în dimineaţa competiţiei.
Numele se află pe Mac cu `scutil --get LocalHostName`; lasă `API_MDNS_NAME`
gol ca să dezactivezi căutarea.

Cel mai sigur rămâne tot o **rezervare DHCP** pentru laptopul din sală, ca
adresa să nu se mai mişte deloc. Ecranul de PIN arată serverul cu care
vorbeşte placa, deci o nepotrivire se vede imediat.

## PIN-ul arbitrului

Dispozitivul nu are tastatură şi nici cameră, deci nici parola şi nici codul
QR nu-i sunt de folos. Foloseşte acelaşi credential ca QR-ul, în cifre.

Unde îl găseşti: în ecranul live, la slotul arbitrului, acelaşi buton care
arată codul QR — PIN-ul apare sub el. Butonul de resetare le schimbă pe
amândouă odată.

PIN-ul e **unic peste toate evenimentele**, aşa că dispozitivul trimite doar
cifrele: serverul ştie din ele ce arbitru şi ce eveniment. Nu se configurează
nimic pe dispozitiv când trece de la un arbitru la altul.

Arbitrul trebuie să fie **alocat categoriei** — altfel serverul răspunde 403
la trimiterea notei, iar dispozitivul o spune pe ecran.

### De ce 5 cifre sunt acceptabile

100.000 de coduri e puţin. Singurul lucru care le face suficiente e că
endpointul refuză să fie ghicit: după 10 încercări greşite de la aceeaşi
adresă IP, în 10 minute, răspunde 429 şi tace — inclusiv dacă următoarea
încercare ar fi corectă. Un script care ar fi mers în minute devine ore de
trafic imposibil de ratat, pe un LAN închis.

Dacă vrei mai mult, `RefereeQRLogin.PIN_LENGTH` în
`backend/api/models/referees.py` schimbă lungimea; dispozitivul formează
orice lungime, `PIN_DIGITS` din `.ino` trebuie pus la fel.

## Compilare

- Placă: **ESP32C3 Super Mini** (în listă apare ca *MakerGO ESP32 C3
  SuperMini* sau *Nologo ESP32C3 Super Mini*; merge la fel de bine
  *ESP32C3 Dev Module*).
- Partition Scheme: **Huge APP (3MB No OTA/1MB SPIFFS)** — cu schema
  implicită sketch-ul intră în 91% din flash şi nu mai ai loc de manevră;
  cu asta stă la 37%. Pe *ESP32C3 Dev Module* echivalentul e
  *Minimal SPIFFS*.
- USB CDC On Boot: **Enabled** (e deja implicit pe plăcile SuperMini) —
  placa nu are chip separat de USB-serial, deci fără asta nu vezi nimic
  pe Serial Monitor.
- Biblioteci: `GFX Library for Arduino` (Arduino_GFX) şi `ArduinoJson` v7.

### Dacă apare `'digitalPinToGPIONumber' is not a type`

E placa selectată, nu codul. Eroarea vine din `Arduino_XL9535SWSPI.h`
(parte din Arduino_GFX), care declară metode numite `pinMode`,
`digitalWrite` şi `digitalRead`. Pe **Arduino Nano ESP32** şi **Ozobot
DRVKit** — singurele două plăci din core cu remapare de pini — acele
nume sunt macrouri, şi se ciocnesc. Orice sketch care include Arduino_GFX
cade la fel pe ele, nu are legătură cu sketch-ul ăsta. Alege placa
SuperMini şi compilează.

Backendul are nevoie de migrarea `0073` şi de codul nou, deci imaginea
Docker a serverului din sală trebuie reconstruită înainte ca PIN-ul să
funcţioneze acolo.

## Dacă apare „FĂRĂ WIFI"

Ecranul listează acum ce reţele vede placa, cu canal şi semnal, şi spune
care e problema. Cauzele, în ordinea frecvenţei:

- **Reţeaua e pe 5 GHz.** Radioul ESP32-C3 are doar 2.4 GHz — un SSID de
  5 GHz nu apare la scanare deloc, ca şi cum n-ar exista. Dacă routerul
  are SSID-uri separate pe bandă, pune-l pe cel de 2.4 GHz în `WIFI_SSID`.
  Dacă are unul singur pentru ambele benzi, e în regulă: placa prinde
  banda pe care o poate.
- **AP-ul e pe canalul 12 sau 13.** Firmware-ul cere explicit regiunea
  `RO`, altfel ESP32 porneşte cu o regiune care exclude aceste canale şi
  reţeaua nu apare la scanare. Dacă ai copiat doar o bucată din cod,
  verifică să fi luat şi `esp_wifi_set_country_code("RO", true)`.
- **Parola.** Dacă reţeaua apare în listă dar tot nu intră, ecranul spune
  „reţeaua m-a refuzat".
- **Semnal slab.** Antena de pe plăcile SuperMini e slabă. Sub -80 dBm în
  listă, apropie placa de AP şi încearcă din nou. Economia de energie a
  modemului e deja oprită din cod, tocmai din motivul ăsta.
- **„Reîncerc, emisie redusă…" la pornire.** Nu e lipsă de acoperire, e
  alimentare: regulatorul de pe SuperMini nu ţine vârful de curent de la
  emisie, iar placa rămâne pe 8.5 dBm — cu ~11 dB mai puţin, adică sub
  jumătate din rază. Se vede ca „zonă moartă" exact la masa ei. Alimentare
  de 5V serioasă, cablu scurt şi gros, şi un condensator de 220–470 µF pe
  5V/GND lângă placă.

Apasă encoderul ca să reîncerce.

## Cât de bună e legătura

Barele de semnal arată cât de tare **aude placa AP-ul** — downlink-ul. Dar
legătura e asimetrică: nota arbitrului pleacă în sus, pe antena ceramică
slabă a plăcii, şi acolo bare pline nu garantează nimic. Un AP puternic
umple barele permanent şi ascunde exact problema; un router „de mare
putere" nu schimbă cu nimic cât de tare emite placa.

De-asta, cât timp placa n-are un teren asignat, în dreapta sus apare
**durata ultimului dus-întors până la server**, nu un ceas:

| Afişaj | Înseamnă |
|---|---|
| `48ms` verde | legătură bună |
| `210ms` galben | merge, dar se retransmite |
| `800ms` roşu | la limită, mută placa sau AP-ul |
| `!!` roşu | ultima cerere a picat de tot |
| `--` gri | încă n-a fost nicio cerere |

La montaj, plimbă o placă pe la fiecare masă de arbitraj şi uită-te la
numărul ăsta, nu la bare. Când arbitrul e asignat pe un teren, locul e luat
de `T1|A1` — atunci terenul contează mai mult, iar reţeaua s-a dovedit deja.

Placa nu foloseşte NTP şi n-are nevoie de internet: toate cererile merg la
calculatorul din sală. Internetul îţi trebuie doar la final, pentru
sincronizarea în cloud, şi se poate face şi a doua zi.

## Pe telefon

Nu e nevoie de nimic nou: arbitrii intră pe `http://<IP-ul-sălii>:5176` din
browserul telefonului şi au aceeaşi funcţionalitate, cu ecran mai mare.
Dispozitivul e util unde un telefon e incomod — la masa de arbitraj, cu
mâinile ocupate.
