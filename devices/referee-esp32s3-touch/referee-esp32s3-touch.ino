// Arbitru FRVV pe ESP32-S3-Touch-LCD-2.8 - ST7789 240x320 cu panou tactil.
//
// Acelasi dispozitiv ca varianta cu encoder (devices/referee-esp32c3), fara
// nicio piesa de lipit: tot ce era buton sau rotire e acum o zona de ecran.
//
//   1. se conecteaza la WiFi-ul salii
//   2. arbitrul isi formeaza PIN-ul de 5 cifre pe tastatura de pe ecran
//   3. sta in asteptare, fara sa aleaga nimic
//   4. cand masa centrala pune un sportiv pe ecran intr-o categorie la
//      care acest arbitru e alocat, sportivul apare direct pe dispozitiv
//   5. la tehnica pune nota din patru trepte si o trimite (0..100)
//   6. la lupte apasa unul din patru sferturi de ecran, ca pe butoane
//
// Arbitrul nu alege nici categorie, nici sportiv: urmareste masa centrala,
// exact ca ecranele din sala. Singurul lucru pe care il face e nota.
//
// Ce s-a schimbat fata de placa cu encoder, si de ce:
//
// - Ecranul are 320 de pixeli in inaltime, nu 240. Cei 80 in plus nu sunt
//   decor: acolo incap tastatura de PIN, treptele de nota si butonul de
//   trimitere, adica tot ce pe encoder era o rotire pe care nimeni nu o
//   vedea.
// - Nu mai exista apasare lunga. Pe un singur buton, scurt si lung erau
//   singurul fel de a avea doua intentii; pe touch, orice intentie are loc
//   pe ecran. Predarea dispozitivului catre urmatorul arbitru se face
//   apasand bara de sus, si se confirma - un gest care se poate face din
//   greseala nu are voie sa inchida sesiunea cuiva.
// - Panoul se citeste dintr-un task propriu, pe celalalt nucleu. Pe ESP32-C3
//   erau intreruperi, fiindca bucla principala sta blocata in cereri HTTP si
//   orice apasare s-ar pierde acolo. O atingere nu se poate citi din
//   intrerupere - cere I2C - dar S3 are doua nuclee, deci se poate citi in
//   paralel. Vezi sectiunea TOUCH.
//
// Serverul e cel local, din sala - acelasi pe care il porneste launcher-ul.
// Nu e nevoie de HTTPS: totul sta in LAN-ul salii.
//
// Biblioteci (Library Manager): Arduino_GFX, ArduinoJson (v7). Panoul tactil
// nu cere biblioteca: driverul lui e Touch_CST328, luat ca atare din arhiva
// oficiala Waveshare pentru placa asta. Scrisesem unul propriu, derivat din
// ESPHome; l-am inlocuit dupa ce portarea pe 2.8B a aratat cat de scump e sa
// deduci un driver in loc sa folosesti pe cel al producatorului - o seara.
//
// Placa: "Waveshare ESP32-S3-Touch-LCD-2.8" - exista in nucleul ESP32 de la
// versiunea 3.x si e cea de ales. Vine deja cu 16MB flash la 120MHz, QIO,
// PSRAM pe OPI si partitii de 3MB pentru aplicatie, deci din tot meniul
// trebuie schimbat UN singur lucru:
//
//   USB CDC On Boot: Enabled
//
// Aia nu e optionala, desi asa suna in meniu, si placa porneste cu ea stinsa.
// Fara ea `Serial` nu mai e USB-ul, ci UART0 - si nici nu compileaza:
// `setTxTimeoutMs` exista doar pe clasa de USB. Daca o compilare se opreste cu
// "'class HardwareSerial' has no member named 'setTxTimeoutMs'", asta e, si
// se reseteaza la fiecare actualizare a nucleului ESP32.
//
// Placa dedicata NU aduce pinii ecranului: varianta ei defineste doar I2C
// (SDA 11, SCL 10 - exact ce folosim mai jos), UART-ul, si un SPI generic pe
// 34-37 care nu are legatura cu LCD-ul. De-asta pinii de mai jos raman scrisi
// explicit.
//
// Merge si pe "ESP32S3 Dev Module", dar atunci trebuie puse de mana flash-ul
// de 16MB, PSRAM-ul pe OPI si schema de partitii - trei ocazii de greseala in
// loc de niciuna.

#include <Arduino_GFX_Library.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "frvv_logo.h"
#include "Touch_CST328.h"

// ─────────────────────────── CONFIGURARE ───────────────────────────

// Reteaua. Valorile de aici sunt doar punctul de pornire: ce se scrie prin
// cablu din launcher (vezi mai jos) le ia locul si ramane in memoria
// device-ului, deci nu se reprogrameaza nimic cand se schimba reteaua.
const char* WIFI_SSID_IMPLICIT = "Zignative2";
const char* WIFI_PASS_IMPLICIT = "Rrdspider1";

// Ce foloseste efectiv device-ul - umplute la pornire din memorie, daca e
// ceva salvat acolo.
String wifiSsid = WIFI_SSID_IMPLICIT;
String wifiPass = WIFI_PASS_IMPLICIT;

// Calculatorul din sala, dupa nume - nu dupa adresa.
//
// Numele asta nu e al unui calculator anume: launcherul raspunde la el,
// oriunde ar fi instalat si ce adresa i-ar da routerul (vezi
// apps/launcher/electron/mdns.js). Asa, device-urile merg pe orice laptop,
// pe orice retea, fara sa fie reprogramate si fara nicio setare pe router.
//
// Inainte aici era numele unui Mac anume. Mergea doar de pe el: alt
// laptop, si mai ales un laptop cu Windows - care nu-si anunta numele in
// retea de la sine - si device-urile taceau fara sa spuna de ce.
//
// Lasa gol ca sa dezactivezi cautarea dupa nume.
const char* API_MDNS_NAME = "frvv-sala";

// Adresa, incercata prima fiindca e instantanee cand e corecta. Cand nu e,
// se pierd vreo 4 secunde la pornire si se trece pe cautarea dupa nume.
// Daca laptopul din sala se schimba des, pune aici o adresa care sigur nu
// raspunde (de pilda 0.0.0.0) si lasa numele sa faca treaba.
const char* API_HOST = "192.168.0.197";
const int   API_PORT = 8000;

// Nu se configureaza nimic per arbitru: PIN-ul se formeaza pe tastatura de
// pe ecran la pornire, iar serverul stie din el cine e si la ce eveniment.
// Acelasi dispozitiv trece de la un arbitru la altul fara sa fie reprogramat.

// Cat de des intrebam masa centrala ce are pe ecran. E o singura cerere
// de ~500 de octeti, dar in sala sunt zeci de dispozitive pe acelasi
// WiFi si acelasi server - doua secunde sunt destul de prompte pentru un
// om care tocmai a intrat pe saltea.
const unsigned long POLL_MS         = 1000;
// Serverul considera un arbitru conectat daca a semnalat in ultimele 8
// secunde (vezi referee_presence_list). La trei secunde intre semnale,
// operatorul vede aproape imediat cand un dispozitiv intra sau pleaca,
// si raman doua semnale pierdute de marja inainte de a trece pe rosu.
const unsigned long PRESENCE_MS     = 3000;
// Cate categorii anuntam cand stam in asteptare. Un arbitru de sala e
// alocat la cateva, nu la zeci; plafonul e ca sa nu ajunga un semnal de
// prezenta o rafala de cereri.
const int PRESENCE_MAX_CATEGORIES   = 6;
const unsigned long HTTP_TIMEOUT_MS = 10000;
const int           HTTP_ATTEMPTS     = 3;
// Interogarea mesei centrale merge pe un timeout scurt: e o cerere mica,
// se repeta in fiecare secunda, si orice asteptare mai lunga blocheaza
// bucla principala.
const unsigned long POLL_TIMEOUT_MS = 2500;
int httpTimeoutMs = HTTP_TIMEOUT_MS;

const int MAX_SCORE = 100;


// Se vede pe ecranul de pornire. Singurul mod sigur de a sti, din sala,
// daca placa chiar are versiunea pe care credem ca am incarcat-o.
// Versionare semantica: MAJOR.MINOR.PATCH. Se urca MINOR la functii
// noi si corecturi, MAJOR doar cand se schimba felul in care se
// foloseste aparatul. 3.0.0 e prima pe ecran tactil - pana atunci
// aparatul se folosea invartind un buton.
const char* FW_VERSION = "3.0.0";
// Se vede pe ecranul de pornire. Cand ai pe masa cinci dispozitive
// incarcate in zile diferite, data spune mai mult decat numarul.
const char* FW_UPDATED = "02.10.2026";

// ───────────────────────────── HARDWARE ─────────────────────────────
//
// Pinii nu se pot alege: sunt cum i-a legat Waveshare pe placa. Valorile
// sunt din wiki-ul placii si din schema ei, nu ghicite - daca ecranul
// ramane negru, prima suspiciune e ca ai in mana alt model din aceeasi
// familie (2.8B si 2.8C au alt controler de ecran si alti pini).

#define TFT_MOSI 45
#define TFT_SCLK 40
#define TFT_CS   42
#define TFT_DC   41
#define TFT_RST  39
// Lumina de fundal. Legata pe un pin separat, deci ecranul poate fi aprins
// doar dupa ce are ceva de aratat - altfel la pornire se vede o secunda de
// zgomot din memoria controlerului.
#define TFT_BL    5

// Ce nivel aprinde lumina.
//
// Configurabil din acelasi motiv ca pinii de I2C: pe placa asta nimic nu
// garanteaza ca HIGH inseamna aprins. Daca e invers, un ecran negru arata
// exact ca un ecran defect - si s-ar repara reprogramand, in loc de o comanda
// pe cablu.
//
// Steagul sta aici, langa pinul lui, fiindca il citesc comenzile seriale care
// vin mai sus in fisier decat restul. Functia care il foloseste sta jos, in
// sectiunea TOUCH, si nu din neglijenta: Arduino aseaza prototipurile pe care
// le genereaza singur chiar inaintea PRIMEI definitii de functie din fisier, iar
// o functie pusa aici ar muta punctul ala inaintea structurilor si enumerarilor
// de mai jos - si atunci se opreste cu "'TouchZone' does not name a type", o
// eroare care pare de tip dar e doar o ordine gresita. In sectiunea asta se
// declara, nu se executa.
bool blAprinsPeHigh = true;


// Pinii panoului tactil NU sunt aici: stau in Touch_CST328.h, al
// producatorului, impreuna cu adresa si cu secventa de pornire. Ii aveam si eu
// definiti, in paralel - adica doua adevaruri despre acelasi lucru, si ocazia
// ca cineva sa-l corecteze pe cel gresit.

// Ecranul, in portret. Latimea a ramas 240 ca pe placa veche - intentionat:
// tot ce era desenat pe orizontala se aseaza la fel, iar cei 80 de pixeli in
// plus se adauga jos, unde e nevoie de ei.
#define SCREEN_W 240
#define SCREEN_H 320

// 0 = conectorul USB jos. Pune 2 ca sa intorci ecranul cu 180 de grade cand
// cablul iese prin partea nepotrivita a mesei; atingerea se intoarce odata
// cu el, vezi dusTouchInEcran().
#define SCREEN_ROTATION 0

#define BLACK     0x0000
#define WHITE     0xFFFF
#define RED       0xF800
#define GREEN     0x07E0
#define BLUE      0x001F
#define CYAN      0x07FF
#define YELLOW    0xFFE0
#define ORANGE    0xFD20
#define DARKGRAY  0x2104
#define LIGHTGRAY 0x8410
// Culorile federatiei, aceleasi ca in aplicatii (navy #172642, auriu
// #edb654), convertite in RGB565.
#define NAVY      0x1128
#define GOLD      0xEDAA

Arduino_DataBus *bus = new Arduino_ESP32SPI(TFT_DC, TFT_CS, TFT_SCLK, TFT_MOSI, -1);
Arduino_GFX *gfx = new Arduino_ST7789(bus, TFT_RST, SCREEN_ROTATION, true,
                                      SCREEN_W, SCREEN_H);

// O zona atinsa pe ecran.
//
// Desenul si verificarea atingerii folosesc aceleasi numere, din acelasi
// tabel. Nu e eleganta, e singura aparare impotriva singurei greseli pe care
// un ecran tactil o face si un buton nu: sa arate butonul intr-un loc si sa
// raspunda in altul. Pe hartie se vede, in sala nu - arbitrul apasa unde
// scrie si nu se intampla nimic, si nimeni nu are cum sa ghiceasca de ce.
struct TouchZone { int16_t x, y, w, h; };

// O atingere, asa cum a ajuns din panou in bucla principala. Coordonatele
// brute merg cu ea ca sa poata fi raportate in proba de ecran: daca panoul e
// montat pe alte axe, numai ele spun asta.
struct TouchEvent {
  int16_t  x, y;
  uint16_t rawX, rawY;
};

// ─────────────────────────── STARE APLICATIE ───────────────────────────

enum Screen {
  SCREEN_STATUS,      // pornire, erori, reconectare
  SCREEN_WIFI_DIAG,   // ce retele vede placa, cand nu prinde WiFi
  SCREEN_PIN,         // arbitrul isi formeaza PIN-ul
  SCREEN_STANDBY,     // conectat, astept sa fiu pus pe o categorie
  SCREEN_SCORE,       // sportivul e pe saltea: pui nota si o trimiti
  SCREEN_MATCH,       // meci de lupta: patru sferturi, puncte in timp real
  SCREEN_HANDOVER     // "predai dispozitivul?" - confirmarea de la bara de sus
};

// Unde se intoarce ecranul daca arbitrul renunta la predare. Pe un aparat
// cu encoder, iesirea era o apasare lunga si nu ocupa nimic pe ecran; cu
// touch e un gest care se poate face din greseala, deci intreabam intai -
// si atunci trebuie sa stim de unde am plecat.
Screen screenBeforeHandover = SCREEN_STANDBY;

// Ce s-a ales de punctul pe care tocmai l-am dat. La lupte in timp
// real serverul nu valideaza un punct pe cuvantul unui singur
// arbitru: are nevoie de cel putin doi care apasa aceeasi parte si
// aceeasi valoare la mai putin de 1,5 secunde unul de altul (vezi
// _auto_validate_real_time_point_event). Deci intre "am apasat" si
// "punctul exista" e o stare de asteptare reala, care trebuie
// aratata - altfel arbitrul crede ca a punctat cand de fapt colegii
// n-au vazut aceeasi faza.
enum PointState {
  POINT_NONE,        // ecranul normal de meci
  POINT_SENDING,     // cererea e pe drum
  POINT_PENDING,     // serverul l-a primit, asteapta ceilalti arbitri
  POINT_VALIDATED,   // confirmat: a intrat in scor
  POINT_FAILED,      // n-a plecat deloc (retea)
  POINT_TOO_FAST,    // a doua apasare pe acelasi buton, prea repede
  POINT_CLOSED       // s-a apasat in pauza sau intre reprize
};

// Cat incape pe ecran si in RAM fara sa ne jucam cu alocari dinamice.
// O categorie de tehnica nu trece de ~24 de sportivi; daca trece, luam
// primii MAX_ATHLETES si spunem asta pe ecran, nu taiem in tacere.
// Doar id-urile categoriilor la care sunt arbitru: nu mai alege nimeni
// din ele pe dispozitiv, servesc strict ca sa stiu daca ce e pe masa
// centrala ma priveste sau e terenul altcuiva.
#define MAX_CATEGORIES 40
int  myCategoryIds[MAX_CATEGORIES];
char myCategoryPos[MAX_CATEGORIES][4];   // A1..A5, pozitia mea in categoria aia
int  myCategoryCount = 0;

// Ce are masa centrala pe ecran chiar acum, din sesiunea de monitor.
// Sesiunea aduce si numele, deci nu mai cerem lista de sportivi deloc -
// era cel mai greu raspuns din tot fluxul, 9KB pentru cinci oameni.
int  liveCategoryId      = 0;
int  liveAthleteId       = 0;
int  liveAthleteScoreId  = 0;
char liveCategoryName[34] = "";
char liveCompetitorName[38] = "";
char liveFieldName[18]   = "";
char liveRefPosition[4]  = "";
bool liveIsTeam          = false;
int  mySubmittedScore    = -1;   // nota mea pentru cine e acum, -1 = niciuna
bool liveRevealed        = false; // masa centrala a dezvaluit scorurile

// Ce s-a ales de nota mea, dupa dezvaluire. Serverul decide: prin API un
// arbitru nu vede notele colegilor pana la dezvaluire, deci nu poate
// calcula singur care a cazut ca extrema.
bool revealKnown   = false;
char revealMark[10] = "";        // low / high / counted
int  revealTotal   = 0;
unsigned long liveUpdatedAt = 0;  // cat de recenta e sesiunea aleasa

// Ultimele note date de mine in categoria curenta, cea mai recenta prima.
// Un arbitru nu noteaza in gol: se raporteaza la ce a dat inainte in
// aceeasi proba, si pana acum trebuia sa tina minte.
#define MAX_HISTORY 9
struct HistoryRow { char name[14]; int score; };
HistoryRow history[MAX_HISTORY];
int historyCount = 0;

Screen screen = SCREEN_STATUS;
String apiBase;          // construit la pornire, vezi locateServer()
String serverLabel;      // ce aratam pe ecran ca adresa folosita
String accessToken;
String refereeName;
String refereeShort;   // "G. Popilciuc" - cat incape in bara de sus
int  myAthleteId    = 0;

#define PIN_DIGITS 5
char pinDigits[PIN_DIGITS + 1] = "00000";
int  pinCursor = 0;

// Ce a gasit ultima scanare, pentru ecranul de diagnoza WiFi.
#define MAX_SCAN 6
struct ScanRow { char ssid[24]; int rssi; int channel; };
ScanRow scanRows[MAX_SCAN];
int  scanCount = 0;
bool scanFoundOurs = false;
int  ourChannel = 0;

// Motivul exact pentru care radioul a renuntat. Fara el, "nu m-am putut
// conecta" acopera deopotriva o parola gresita, un AP negasit si un
// handshake picat - trei probleme complet diferite.
volatile int lastDisconnectReason = 0;

int  activeEventId  = 0;
int  draftScore     = MAX_SCORE;

String statusTitle;
String statusDetail;
bool   statusIsError = false;

unsigned long lastPoll       = 0;
unsigned long lastPresence   = 0;
unsigned long lastTopBarDraw = 0;
// Odata trimisa, nota nu se mai schimba de pe dispozitiv: ecranul ramane
// pe confirmare pana intra urmatorul sportiv. E o decizie de arbitraj, nu
// una tehnica - serverul ar accepta o corectura (face upsert), dar o nota
// data nu se retrage dintr-o atingere de ecran. Daca chiar trebuie
// schimbata, se face de la masa centrala, unde ramane urma.
bool submittedShown  = false;
int  submittedScore  = 0;



// ──────────────────────── CONFIGURARE PRIN CABLU ────────────────────────
//
// Reteaua sa se poata schimba fara sa reprogramam toate device-urile.
//
// Pana acum numele si parola erau scrise in cod: o sala cu alt Wi-Fi
// insemna recompilat si reflashuit fiecare device-ul, in dimineata
// competitiei. Nici varianta "le scriu din encoder" nu e buna - o parola
// se formeaza invartind un buton, litera cu litera, fara stergere.
//
// Asa ca le primim prin cablul USB, de la launcher, unde omul le scrie de
// la tastatura. Device-urile oricum se leaga la calculator ca sa fie
// programate, deci cablul e deja acolo.
//
// Device-ul nu poate cere ea configurarea de la launcher, oricat ar parea
// mai simplu: ca sa ajunga la el are nevoie de Wi-Fi, iar Wi-Fi-ul e exact
// ce-i lipseste. De aceea merge intr-o singura directie, dinspre cablu.

Preferences prefs;

// Proba ecranului, pornita prin cablu din launcher.
//
// Pe placa cu butoane lipite proba verifica lipitura. Aici verifica ceva
// mai subtil: daca atingerea ajunge acolo unde a pus-o degetul. Panoul si
// ecranul pot fi montate pe axe diferite, si atunci un arbitru care
// apasa rosu da punct albastrului - fara sa se vada nimic in neregula.
// Proba raporteaza pentru fiecare atingere si coordonata bruta a
// panoului, si pe cea dusa in ecran, deci nepotrivirea se vede dintr-o
// apasare, si se repara din TOUCH= fara reprogramare.
//
// Se stinge singura: raportarea scrie pe acelasi cablu pe care merg
// jurnalele, si nu are ce cauta pornita in timpul unei competitii.
bool modTest = false;
unsigned long modTestPanaLa = 0;
#define TEST_DURATA_MS 180000

// Definite mai jos, langa lucrurile de care tin.
void scanWifi();
void aplicaRoluri();
void incarcaRoluri();
void incarcaPolaritateLumina();
void aprindeLumina(bool aprins);

// Ce punct da fiecare sfert de ecran, in ordinea stanga-sus, stanga-jos,
// dreapta-sus, dreapta-jos.
//
// Un arbitru stangaci vrea rosul in dreapta. Fara asta, orice schimbare
// inseamna reprogramat device-ul; asa se face din launcher, prin cablu, in
// cateva secunde.
//
// Rolurile se scriu scurt: r1 = rosu 1 punct, a2 = albastru 2 puncte. Sunt
// mereu patru si mereu diferite - launcherul le inverseaza intre ele, deci
// nu se poate ajunge la doua sferturi cu acelasi rol.
//
// Implicit punctul mare e sus si rosul in stanga, ca pe masa centrala.
char rolButoane[4][3] = { "r2", "r1", "a2", "a1" };

// Un rand de text, terminat cu Enter. Simplu dinadins: se poate si dintr-un
// monitor serial obisnuit, cand launcherul nu e la indemana.
//
//   WIFI? ................ raspunde cu reteaua configurata acum
//   WIFI=nume\tparola .... o schimba si o tine minte
//   WIFI!................. uita ce stie si revine la cea din cod
//   I2C? ................. ce dispozitive raspund pe magistrale
//   ECRAN ................ proba ecranului, pas cu pas
//   BL? / BL=h / BL=l .... polaritatea luminii de fundal
//   TOUCH? / TOUCH=nyn ... cum se duce atingerea panoului in ecran
//   BTN?   / BTN=r2,r1,a2,a1 ... ce punct da fiecare sfert de ecran
//   TEST   / TEST! ....... proba ecranului, pornita si oprita
//
// Numele si parola sunt despartite de TAB, nu de spatiu sau virgula:
// amandoua apar in parole adevarate, TAB-ul nu.
const char* PREFS_NAMESPACE = "frvv";

void incarcaWifiSalvat() {
  prefs.begin(PREFS_NAMESPACE, true);   // true = doar citire
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  prefs.end();

  if (ssid.length()) {
    wifiSsid = ssid;
    wifiPass = pass;
    Serial.printf("WiFi din memorie: %s\n", wifiSsid.c_str());
  }
}

void salveazaWifi(const String& ssid, const String& pass) {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  wifiSsid = ssid;
  wifiPass = pass;
}

void uitaWifiSalvat() {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.end();
  wifiSsid = WIFI_SSID_IMPLICIT;
  wifiPass = WIFI_PASS_IMPLICIT;
}

void raspundeWifi() {
  // Parola nu se trimite inapoi niciodata: cablul e si monitorul serial al
  // oricui are device-ul in mana.
  Serial.printf("OK WIFI=%s parola=%s\n",
                wifiSsid.c_str(),
                wifiPass.length() ? "(setata)" : "(fara)");
}

// Se cheama des, din bucla principala. Nu blocheaza: daca randul nu e
// complet, se intoarce si revine data viitoare.
void citesteComenziSerial() {
  static String linie;

  while (Serial.available()) {
    char c = (char)Serial.read();

    if (c == '\r') continue;
    if (c != '\n') {
      // Marginea e cu mult peste nevoie (32 nume + 63 parola), dar exista
      // ca un cablu cu zgomot sa nu umple memoria device-ului.
      if (linie.length() < 200) linie += c;
      continue;
    }

    linie.trim();
    if (!linie.length()) continue;

    if (linie == "BL?") {
      Serial.printf("OK BL=%s (lumina pe GPIO%d)\n", blAprinsPeHigh ? "h" : "l", TFT_BL);
    } else if (linie == "BL=h" || linie == "BL=l") {
      blAprinsPeHigh = (linie == "BL=h");
      prefs.begin(PREFS_NAMESPACE, false);
      prefs.putString("bl", blAprinsPeHigh ? "h" : "l");
      prefs.end();
      aprindeLumina(true);
      Serial.printf("OK BL=%s salvat.\n", blAprinsPeHigh ? "h" : "l");
    } else if (linie == "ECRAN") {
      // Proba ecranului, pas cu pas, cu raportare pe cablu.
      //
      // "Ecranul e stins" acopera doua defecte care n-au nimic in comun:
      // lumina care nu se aprinde, si panoul care nu deseneaza. Nu se pot
      // deosebi privind ecranul, dar se deosebesc daca placa spune ce
      // incearca si omul spune la ce pas a vazut ceva.
      Serial.println("OK ECRAN - spune la ce pas vezi ceva");
      struct Pas { const char* text; bool high; uint16_t culoare; };
      const Pas pasi[] = {
        { "1/4 lumina HIGH, ecran ALB",  true,  WHITE },
        { "2/4 lumina LOW,  ecran ALB",  false, WHITE },
        { "3/4 lumina HIGH, ecran ROSU", true,  RED   },
        { "4/4 lumina HIGH, ecran NEGRU",true,  BLACK },
      };
      for (int i = 0; i < 4; i++) {
        Serial.printf("ECRAN\t%s\n", pasi[i].text);
        digitalWrite(TFT_BL, pasi[i].high ? HIGH : LOW);
        gfx->fillScreen(pasi[i].culoare);
        delay(2500);
      }
      Serial.println("OK ECRAN gata. Daca ai vazut alb la pasul 2 si nu la 1,");
      Serial.println("    lumina e inversa: trimite BL=l");
      Serial.println("    Daca n-ai vazut nimic la niciun pas, lumina nu se aprinde.");
      aprindeLumina(true);
      redraw();
    } else if (linie == "BTN?") {
      Serial.printf("OK BTN=%s,%s,%s,%s\n",
                    rolButoane[0], rolButoane[1], rolButoane[2], rolButoane[3]);
    } else if (linie.startsWith("BTN=")) {
      String rest = linie.substring(4);
      // Patru roluri de cate doua litere, despartite de virgula: "r1,a2,r2,a1".
      if (rest.length() != 11) {
        Serial.println("EROARE asteptam patru roluri, ca in r1,r2,a1,a2");
      } else {
        bool bun = true;
        for (int i = 0; i < 4 && bun; i++) {
          char culoare = rest[i * 3];
          char punct   = rest[i * 3 + 1];
          if ((culoare != 'r' && culoare != 'a') || (punct != '1' && punct != '2')) bun = false;
        }
        if (!bun) {
          Serial.println("EROARE rolurile sunt r1, r2, a1 sau a2");
        } else {
          for (int i = 0; i < 4; i++) {
            rolButoane[i][0] = rest[i * 3];
            rolButoane[i][1] = rest[i * 3 + 1];
            rolButoane[i][2] = '\0';
          }
          aplicaRoluri();
          prefs.begin(PREFS_NAMESPACE, false);
          prefs.putString("btn", rest);
          prefs.end();
          Serial.printf("OK BTN=%s salvat.\n", rest.c_str());
        }
      }
    } else if (linie == "TEST") {
      modTest = true;
      modTestPanaLa = millis() + TEST_DURATA_MS;
      Serial.println("OK TEST pornit (3 minute). Apasa pe ecran.");
    } else if (linie == "TEST!") {
      modTest = false;
      Serial.println("OK TEST oprit.");
    } else if (linie == "WIFI?") {
      raspundeWifi();
    } else if (linie == "SCAN?") {
      // Retelele pe care le vede chiar radioul device-ului - nu cele vazute de
      // laptop. Conteaza diferenta: device-ul prinde doar 2.4GHz, si tocmai
      // ea trebuie sa se conecteze.
      scanWifi();
      Serial.printf("OK SCAN %d\n", scanCount);
      for (int i = 0; i < scanCount; i++) {
        Serial.printf("RETEA\t%s\t%d\t%d\n",
                      scanRows[i].ssid, scanRows[i].rssi, scanRows[i].channel);
      }
      Serial.println("OK SCAN gata");
    } else if (linie == "WIFI!") {
      uitaWifiSalvat();
      Serial.println("OK am uitat reteaua salvata. Reporneste device-ul.");
    } else if (linie.startsWith("WIFI=")) {
      String rest = linie.substring(5);
      int tab = rest.indexOf('\t');
      String ssid = (tab >= 0) ? rest.substring(0, tab) : rest;
      String pass = (tab >= 0) ? rest.substring(tab + 1) : "";

      if (!ssid.length()) {
        Serial.println("EROARE numele retelei lipseste");
      } else if (pass.length() && pass.length() < 8) {
        // WPA2 nu accepta parole sub 8 caractere. Mai bine o spunem acum
        // decat sa salvam ceva ce nu se va putea conecta niciodata.
        Serial.println("EROARE parola trebuie sa aiba cel putin 8 caractere");
      } else {
        salveazaWifi(ssid, pass);
        Serial.printf("OK WIFI=%s salvata. Reporneste device-ul.\n", ssid.c_str());
      }
    } else {
      Serial.println("EROARE comanda necunoscuta (WIFI? / WIFI! / I2C? / ECRAN / BL? / TOUCH? / BTN? / TEST)");
    }

    linie = "";
  }
}


// ───────────────────────────── TOUCH ─────────────────────────────

// Lumina de fundal.
//
// Sta aici, nu in sectiunea de hardware, fiindca acolo ar fi prima definitie de
// functie din fisier - iar Arduino pune prototipurile generate chiar inaintea
// ei, adica inaintea structurilor si enumerarilor de mai sus.
void aprindeLumina(bool aprins) {
  digitalWrite(TFT_BL, (aprins == blAprinsPeHigh) ? HIGH : LOW);
}

void incarcaPolaritateLumina() {
  prefs.begin(PREFS_NAMESPACE, true);
  String salvat = prefs.getString("bl", "");
  prefs.end();
  if (salvat == "l") blAprinsPeHigh = false;
}

// Alimentarea placii, exact ca in codul producatorului (PWR_Key.cpp).
//
// Pinul de control porneste JOS si se ridica doar daca butonul de alimentare e
// tinut apasat in clipa aia - asa se aprinde placa de pe baterie. Pe USB
// curentul vine oricum, deci dispozitivul merge fara sa apesi nimic.
//
// Pusesem initial ridicarea neconditionata, dintr-o banuiala. Diferenta nu e
// teoretica: ridicat mereu, aparatul ramane pornit cand scoti cablul si nu se
// mai poate stinge din buton, fiindca bucla de alimentare nu-l mai urmareste.
#define PWR_BUTON   6
#define PWR_CONTROL 7

void alimentareInit() {
  pinMode(PWR_BUTON, INPUT);
  pinMode(PWR_CONTROL, OUTPUT);
  digitalWrite(PWR_CONTROL, LOW);
  delay(100);
  if (!digitalRead(PWR_BUTON)) {
    digitalWrite(PWR_CONTROL, HIGH);   // apasat: tinem alimentarea pe baterie
  }
}

// Orientarea atingerii nu mai e treaba noastra.
//
// Driverul producatorului raporteaza direct in pixelii panoului, cu axele puse
// cum trebuie pentru placa asta. Aveam aici o conversie configurabila, cu
// comanda TOUCH= prin cablu, fiindca imi scrisesem singur driverul si nu
// stiam pe ce axe vine. Acum stie el.

// Panoul se citeste dintr-un task propriu, pe nucleul 0.
//
// Pe ESP32-C3 encoderul si butoanele erau pe intreruperi, si pentru un motiv
// care nu s-a schimbat: bucla principala petrece cea mai mare parte a
// timpului blocata intr-o cerere HTTP, iar orice apasare facuta in intervalul
// ala s-ar pierde pur si simplu. La lupte asta inseamna un punct care nu
// exista.
//
// O atingere insa nu se poate citi din intrerupere: panoul raspunde pe I2C,
// iar I2C nu se face din intrerupere. C3 avea un singur nucleu si n-ar fi
// avut de unde. S3 are doua - deci atingerile se citesc in paralel cu
// cererea, se pun in coada, si bucla le gaseste acolo cand se intoarce.
//
// Taskul e singurul care atinge magistrala I2C dupa pornire. Asa nu e nevoie
// de nicio sincronizare pe ea: nu exista al doilea care s-o ceara.
QueueHandle_t touchQueue = nullptr;
volatile unsigned long lastInputAt = 0;

// Cat de des intrebam panoul. 15ms e mult mai des decat poate apasa un om si
// mult mai rar decat ar incarca magistrala; nu merita reglat.
#define TOUCH_POLL_MS 15

// Doua atingeri mai apropiate decat atat sunt degetul care s-a rostogolit pe
// sticla, nu doua apasari. Panoul nu are contacte care sar, dar are altceva:
// o apasare ferma pierde contactul pentru o clipa in mijloc.
const unsigned long TOUCH_DEBOUNCE_MS = 80;

void touchTask(void*) {
  bool          jos        = false;
  unsigned long ultimaJos  = 0;

  for (;;) {
    // Doua apeluri, in ordinea asta, si nu e redundanta: primul intreaba cipul,
    // al doilea citeste ce a adus. Fara primul, al doilea intoarce la nesfarsit
    // aceeasi memorie goala - si pare ca panoul nu raspunde, desi nimeni nu l-a
    // intrebat nimic.
    Touch_Read_Data();
    uint16_t px[5], py[5], forta[5];
    uint8_t  degete = 0;
    Touch_Get_XY(px, py, forta, &degete, 5);
    uint16_t rawX = degete ? px[0] : 0;
    uint16_t rawY = degete ? py[0] : 0;

    unsigned long now = millis();

    // Numai frontul de apasare. Ridicarea degetului nu ne intereseaza: pe un
    // ecran de arbitraj nu exista niciun gest, doar apasari - iar un punct se
    // da cand degetul atinge, nu cand pleaca.
    //
    // Si numai cu un singur deget. La lupte arbitrul sta cu mainile peste
    // aparat, iar o palma lasata pe sticla raporteaza mai multe contacte -
    // adica un punct pe care nimeni nu l-a dat. Un prag de apasare ar fi
    // ghicit (si prost ghicit ar face aparatul sa ignore apasari adevarate,
    // ceea ce e mai rau); numarul de degete e o masura, nu o presupunere.
    //
    // Daca palma ajunge cu mai multe contacte si ramane cu unul, `jos` e deja
    // pus si nu mai pleaca nimic: contactele se numara la frontul de apasare,
    // nu pe parcurs.
    bool acum = (degete >= 1);
    if (acum && !jos) {
      jos = true;
      if (degete == 1 && now - ultimaJos >= TOUCH_DEBOUNCE_MS) {
        ultimaJos = now;
        TouchEvent e;
        e.x = (int16_t)rawX;
        e.y = (int16_t)rawY;
        e.rawX = rawX;
        e.rawY = rawY;
        lastInputAt = now;
        // Coada plina inseamna ca bucla n-a mai ajuns la ele de aproape o secunda;
        // ce nu incape se pierde, si e mai bine asa decat sa blocam citirea
        // panoului.
        xQueueSend(touchQueue, &e, 0);
      }
    } else if (!acum && jos) {
      jos = false;
    }

    vTaskDelay(pdMS_TO_TICKS(TOUCH_POLL_MS));
  }
}

bool takeTouch(TouchEvent* e) {
  if (!touchQueue) return false;
  return xQueueReceive(touchQueue, e, 0) == pdTRUE;
}

// Cat de demult a atins cineva ecranul. Cat timp arbitrul pune nota, nu
// plecam dupa date: o cerere blocheaza bucla si ecranul s-ar misca sacadat
// exact cand are nevoie sa raspunda prompt.
bool userIsBusy() {
  unsigned long last = lastInputAt;
  return last && (millis() - last) < 1500;
}

bool zoneHit(const TouchZone& z, int x, int y) {
  return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
}

// Care zona din tabel a fost atinsa, sau -1. Tabelele sunt mici si se
// parcurg o data per apasare, deci nu merita nimic mai istet.
int zoneIndex(const TouchZone* zones, int count, int x, int y) {
  for (int i = 0; i < count; i++) if (zoneHit(zones[i], x, y)) return i;
  return -1;
}

// ───────────────────────────── TEXT ─────────────────────────────

// Fontul din Arduino_GFX are doar ASCII, iar numele reale din federatie
// sunt pline de diacritice ("Vladut Bacanu" e in baza de date "Vlăduț
// Băcanu"). Fara asta, fiecare diacritica ar iesi pe ecran ca doua
// caractere de gunoi - un nume ilizibil exact cand arbitrul trebuie sa
// fie sigur pe cine noteaza. Le transliteram, nu le stergem.
//
// UTF-8: diacriticele romanesti stau pe doi octeti, in blocurile
// Latin-1 Supplement (0xC3 xx), Latin Extended-A (0xC4/0xC5 xx) si
// punctuatia (0xC8 xx pentru ș/ț cu virgula, forma corecta romaneste).
void toAsciiName(const char* src, char* dst, size_t dstSize) {
  size_t o = 0;
  for (size_t i = 0; src[i] && o + 1 < dstSize; ) {
    unsigned char c = (unsigned char)src[i];

    if (c < 0x80) {                  // ASCII, trece neatins
      dst[o++] = src[i++];
      continue;
    }

    unsigned char c2 = (unsigned char)src[i + 1];
    const char* rep = "?";
    if (c == 0xC3) {
      switch (c2) {
        case 0xA2: rep = "a"; break;  // â
        case 0x82: rep = "A"; break;  // Â
        case 0xAE: rep = "i"; break;  // î
        case 0x8E: rep = "I"; break;  // Î
        default:   rep = "?"; break;
      }
    } else if (c == 0xC4) {
      switch (c2) {
        case 0x83: rep = "a"; break;  // ă
        case 0x82: rep = "A"; break;  // Ă
        default:   rep = "?"; break;
      }
    } else if (c == 0xC5) {
      switch (c2) {
        case 0x9F: rep = "s"; break;  // ş (cu sedila, varianta veche)
        case 0x9E: rep = "S"; break;  // Ş
        case 0xA3: rep = "t"; break;  // ţ
        case 0xA2: rep = "T"; break;  // Ţ
        default:   rep = "?"; break;
      }
    } else if (c == 0xC8) {
      switch (c2) {
        case 0x99: rep = "s"; break;  // ș (cu virgula, forma corecta)
        case 0x98: rep = "S"; break;  // Ș
        case 0x9B: rep = "t"; break;  // ț
        case 0x9A: rep = "T"; break;  // Ț
        default:   rep = "?"; break;
      }
    }

    dst[o++] = rep[0];
    i += 2;
  }
  dst[o] = '\0';
}

// Masa centrala afiseaza "Nume Prenume" (vezi LiveFullscreenPage), dar
// sesiunea de monitor trimite "Prenume Nume". Arbitrul se uita la ecranul
// mare si la dispozitiv in acelasi timp - daca numele sunt in ordini
// diferite, ezita exact cand nu trebuie. Mutam ultimul cuvant in fata,
// ceea ce tine si pentru prenume compuse ("George-Marian Prisacariu" ->
// "Prisacariu George-Marian"). Numele de echipa se lasa in pace.
void toSurnameFirst(const char* src, char* dst, size_t dstSize) {
  char ascii[48];
  toAsciiName(src, ascii, sizeof(ascii));

  const char* lastSpace = strrchr(ascii, ' ');
  if (!lastSpace || lastSpace == ascii) {
    strlcpy(dst, ascii, dstSize);
    return;
  }

  size_t firstLen = lastSpace - ascii;
  snprintf(dst, dstSize, "%s %.*s", lastSpace + 1, (int)firstLen, ascii);
}


// ───────────────────────────── HTTP / API ─────────────────────────────

// Intoarce codul HTTP (negativ = nu s-a putut face cererea). Raspunsul e
// parsat direct din stream cu un filtru, ca sa nu tinem in RAM campuri
// pe care oricum nu le folosim - un singur sportiv vine cu tot obiectul
// lui de detalii, si sunt zeci.
// Codurile negative vin din HTTPClient, nu de la server. Pe ecran, un
// "-11" nu spune nimic; traduse, spun exact unde s-a rupt lantul.
String httpErrorText(int code) {
  switch (code) {
    case -1:  return "serverul a refuzat conexiunea";
    case -2:  return "nu s-a putut trimite cererea";
    case -3:  return "nu s-a putut trimite continutul";
    case -4:  return "conexiune inexistenta";
    case -5:  return "conexiune pierduta";
    case -7:  return "nu raspunde un server HTTP";
    case -8:  return "memorie insuficienta";
    case -11: return "serverul nu a raspuns la timp";
    case -20: return "fara WiFi";
    case -21: return "raspuns necitibil";
    default:  return String("eroare ") + code;
  }
}

// Cat a durat ultimul dus-intors pana la server si daca a reusit.
// Barele de semnal arata cat de tare aude placa AP-ul, adica
// downlink-ul - fix directia care nu e problema. Scorul pleaca in
// sus, pe antena slaba a placii, si acolo bare pline nu garanteaza
// nimic. Numarul asta e singurul care masoara drumul pe care pleaca
// efectiv nota arbitrului.
unsigned long lastRequestMs = 0;
bool lastRequestDone = false;
bool lastRequestOk = false;

void noteRequest(unsigned long ms, bool ok) {
  lastRequestMs = ms;
  lastRequestDone = true;
  lastRequestOk = ok;
}

// O singura incercare. Intoarce codul HTTP, sau unul negativ de la
// HTTPClient / de-al nostru (-20 fara WiFi, -21 raspuns neparsabil).
int apiRequestOnce(const char* method, const String& path, const String& body,
                   JsonDocument& out, JsonDocument* filter) {
  if (WiFi.status() != WL_CONNECTED) { noteRequest(0, false); return -20; }

  HTTPClient http;
  String url = apiBase + path;
  if (!http.begin(url)) { noteRequest(0, false); return -4; }

  http.setTimeout(httpTimeoutMs);
  http.setConnectTimeout(httpTimeoutMs);
  // Django/gunicorn raspund chunked, iar parsarea din stream nu se
  // impaca cu asta; HTTP/1.0 cere raspunsul intreg, cu Content-Length.
  http.useHTTP10(true);

  if (accessToken.length()) http.addHeader("Authorization", "Bearer " + accessToken);
  if (body.length())        http.addHeader("Content-Type", "application/json");

  unsigned long startedAt = millis();
  // Fara ramura de PATCH, orice metoda care nu era POST pleca drept GET -
  // adica o corectare de scor s-ar fi trimis ca o simpla citire, fara sa
  // dea vreo eroare.
  int code;
  if (strcmp(method, "POST") == 0)       code = http.POST(body);
  else if (strcmp(method, "GET") == 0)   code = http.GET();
  else                                   code = http.sendRequest(method, body);

  int payloadLen = 0;
  if (code > 0) {
    // Citim intai tot raspunsul, apoi il parsam - nu direct din stream,
    // care cedeaza cand pachetele intarzie pe un WiFi slab: ArduinoJson
    // vede sfarsitul datelor acolo unde e doar o pauza.
    String payload = http.getString();
    payloadLen = payload.length();
    DeserializationError err = filter
      ? deserializeJson(out, payload, DeserializationOption::Filter(*filter))
      : deserializeJson(out, payload);
    if (err) {
      Serial.printf("JSON %s %s (%d octeti): %s\n", method, path.c_str(), payloadLen, err.c_str());
      noteRequest(millis() - startedAt, false);
      http.end();
      return -21;
    }
  }

  unsigned long took = millis() - startedAt;
  // Un 401 sau un 500 inseamna tot ca dus-intorsul a functionat, iar
  // pentru calitatea legaturii asta conteaza, nu ce a raspuns Django.
  noteRequest(took, code > 0);

  http.end();
  Serial.printf("%s %s -> %d in %lums (%d octeti, RSSI %d, heap %u)\n",
                method, path.c_str(), code, took,
                payloadLen, WiFi.RSSI(), ESP.getFreeHeap());
  return code;
}

// Cu reincercari. Antena de pe SuperMini pierde destule pachete cat sa
// pice cereri de cateva sute de octeti, si o eroare rosie pe ecran la
// fiecare rateu ar face dispozitivul inutilizabil in sala.
//
// Reluarea e sigura pentru tot ce trimitem: login-ul cu PIN da mereu
// acelasi rezultat, nota face upsert pe (arbitru, sportiv) - nu apare o a
// doua inregistrare - iar prezenta e oricum un semnal repetat.
int apiRequest(const char* method, const String& path, const String& body,
               JsonDocument& out, JsonDocument* filter) {
  int code = 0;
  for (int attempt = 1; attempt <= HTTP_ATTEMPTS; attempt++) {
    code = apiRequestOnce(method, path, body, out, filter);
    if (code > 0) return code;

    // 401 sau 403 nu se repara prin repetare; orice altceva negativ, da.
    if (code == 401 || code == 403) return code;

    if (attempt < HTTP_ATTEMPTS) {
      Serial.printf("  incercarea %d a esuat (%s), reiau\n", attempt, httpErrorText(code).c_str());
      if (WiFi.status() != WL_CONNECTED) {
        WiFi.reconnect();
        unsigned long until = millis() + 4000;
        while (WiFi.status() != WL_CONNECTED && millis() < until) delay(100);
      }
      delay(300);
    }
  }
  return code;
}

void setApiBase(const char* host) {
  apiBase = String("http://") + host + ":" + API_PORT + "/api";
  serverLabel = String(host) + ":" + API_PORT;
}

// /system-info/ e public si ieftin - raspunde 200 fara autentificare, deci
// e exact ce trebuie ca sa aflam daca vorbim cu serverul potrivit.
bool serverAnswers() {
  HTTPClient http;
  if (!http.begin(apiBase + "/system-info/")) return false;
  http.setTimeout(4000);
  http.setConnectTimeout(4000);
  int code = http.GET();
  http.end();
  return code == 200;
}

// Intai adresa din configurare; daca tace, cautam calculatorul dupa nume
// in retea. Asa un IP schimbat peste noapte nu inseamna reflashuit toate
// dispozitivele in dimineata competitiei.
bool locateServer() {
  setApiBase(API_HOST);
  if (serverAnswers()) return true;

  if (!API_MDNS_NAME || !API_MDNS_NAME[0]) return false;

  drawSplash(75, "Caut serverul dupa nume...");
  if (!MDNS.begin("arbitru")) return false;

  IPAddress found = MDNS.queryHost(API_MDNS_NAME, 4000);
  if (found == IPAddress((uint32_t)0)) return false;

  setApiBase(found.toString().c_str());
  return serverAnswers();
}

// Fara reincercari, intentionat. Interogarea mesei centrale se repeta la
// fiecare secunda, deci un rateu se rezolva singur - pe cand trei
// incercari cu timeout de 10 secunde ar tine ecranul pe sportivul
// anterior mult dupa ce masa a trecut la urmatorul.
int apiRequestFast(const char* method, const String& path, JsonDocument& out, JsonDocument* filter) {
  httpTimeoutMs = POLL_TIMEOUT_MS;
  int code = apiRequestOnce(method, path, "", out, filter);
  httpTimeoutMs = HTTP_TIMEOUT_MS;
  return code;
}

bool apiLoginWithPin(const char* pin) {
  JsonDocument body;
  body["pin"] = pin;
  String payload;
  serializeJson(body, payload);

  JsonDocument filter;
  filter["tokens"]["access"]  = true;
  filter["event_id"]          = true;
  filter["user"]["first_name"] = true;
  filter["user"]["last_name"]  = true;
  filter["user"]["athlete"]["id"] = true;

  JsonDocument res;
  accessToken = "";   // cererea de login merge fara token
  int code = apiRequest("POST", "/referee-pin-login/", payload, res, &filter);

  if (code == 404) { statusDetail = "PIN gresit. Cere-i adminului PIN-ul tau."; return false; }
  if (code == 429) { statusDetail = "Prea multe incercari. Asteapta cateva minute."; return false; }
  if (code < 0)    { statusDetail = String("Serverul din sala: ") + httpErrorText(code) + "."; return false; }
  if (code != 200) { statusDetail = String("Serverul a raspuns cu ") + code + "."; return false; }

  const char* token = res["tokens"]["access"];
  if (!token) { statusDetail = "Raspuns de login neasteptat."; return false; }
  accessToken = token;

  activeEventId = res["event_id"] | 0;
  myAthleteId   = res["user"]["athlete"]["id"] | 0;
  String rawName = String((const char*)(res["user"]["first_name"] | "")) + " " +
                   String((const char*)(res["user"]["last_name"] | ""));
  rawName.trim();
  char asciiName[40];
  toAsciiName(rawName.c_str(), asciiName, sizeof(asciiName));
  refereeName = asciiName;

  // "Gabriel Popilciuc" -> "G. Popilciuc". Numele intreg nu incape langa
  // semnal si pozitie, iar initiala e destul ca arbitrul sa se recunoasca.
  char shortName[26];
  const char* space = strchr(asciiName, ' ');
  if (space && space != asciiName) {
    snprintf(shortName, sizeof(shortName), "%c. %s", asciiName[0], space + 1);
  } else {
    strlcpy(shortName, asciiName, sizeof(shortName));
  }
  refereeShort = shortName;

  if (myAthleteId == 0) {
    statusDetail = "PIN-ul nu e legat de un arbitru.";
    accessToken = "";
    return false;
  }
  return true;
}

// Doar id-urile. Se cere la autentificare si apoi din nou, din cand in cand,
// cat device-ul sta in asteptare: asignarile se fac in timpul zilei, iar o
// lista ramasa de dimineata ar tine arbitrul in asteptare pe o categorie
// care chiar e a lui. Categoriile de lupta se arbitreaza pe puncte in timpul
// meciului, alt flux - aici notam tehnica.
bool apiLoadCategories() {
  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["id"]   = true;
  row["type"] = true;
  row["referee_position"] = true;

  JsonDocument res;
  int code = apiRequest("GET", "/referees/me/assigned-categories/", "", res, &filter);
  if (code != 200) {
    statusDetail = (code < 0)
      ? String("Categoriile: ") + httpErrorText(code) + "."
      : String("Nu s-au putut citi categoriile (cod ") + code + ").";
    return false;
  }

  // Meciurile mele vin din alt capat; le luam acum, o data, ca sa stiu
  // mai tarziu daca meciul pus pe teren e al meu.
  apiLoadMyMatches();

  myCategoryCount = 0;
  for (JsonObject item : res.as<JsonArray>()) {
    if (myCategoryCount >= MAX_CATEGORIES) break;
    const char* type = item["type"] | "";
    if (strcmp(type, "solo") != 0 && strcmp(type, "team") != 0 && strcmp(type, "teams") != 0) continue;
    int id = item["id"] | 0;
    if (!id) continue;
    myCategoryIds[myCategoryCount] = id;
    strlcpy(myCategoryPos[myCategoryCount], item["referee_position"] | "",
            sizeof(myCategoryPos[myCategoryCount]));
    myCategoryCount++;
  }
  return true;
}

// Cand am cerut ultima oara lista de categorii si meciuri ale mele.
//
// Lista se incarca la autentificare, dar asignarile se fac in timpul zilei:
// device-urile se autentifica dimineata, iar secretariatul pune arbitrii pe
// categorii pe masura ce se desfasoara competitia. Fara reimprospatare,
// device-ul ramane cu lista de dimineata - vede ca masa centrala a pus o
// categorie pe teren, nu o recunoaste ca fiind a ei, si sta "in asteptare"
// la nesfarsit desi arbitrul chiar e asignat.
unsigned long lastAssignmentsLoad = 0;
#define ASSIGNMENTS_REFRESH_MS 30000

bool isMyCategory(int categoryId) {
  for (int i = 0; i < myCategoryCount; i++) {
    if (myCategoryIds[i] == categoryId) return true;
  }
  return false;
}

const char* myPositionIn(int categoryId) {
  for (int i = 0; i < myCategoryCount; i++) {
    if (myCategoryIds[i] == categoryId) return myCategoryPos[i];
  }
  return "";
}


// ─────────────────────────── LUPTE ───────────────────────────
//
// Culorile colturilor. Numele proprii, nu RED/BLUE din Arduino_GFX:
// albastrul bibliotecii (0x001F) e prea inchis ca fundal plin, textul
// alb pe el nu se citeste de la distanta.
#define SIDE_RED   0xE882
#define SIDE_BLUE  0x1C9F

#define MAX_MATCHES 40
int  myMatchIds[MAX_MATCHES];
char myMatchPos[MAX_MATCHES][4];
int  myMatchCount = 0;

int  liveMatchId        = 0;
int  liveMatchCategoryId = 0;
char liveRedName[22]    = "";
char liveBlueName[22]   = "";
bool liveMatchRealTime  = false;
int  activeRoundId      = 0;
int  activeRoundNumber  = 0;
bool activeRoundPaused  = false;
bool roundsKnown        = false;

// Modul "reveal_final": nu se trimit puncte care se valideaza in doi, ci
// fiecare arbitru isi tine propriul total pe repriza, dezvaluit la final.
// Ecranul se imparte in doua si arata exact cele doua numere pe care le
// tine arbitrul - altfel n-ar avea de unde sti ce a acumulat.
int  myRoundScoreId  = 0;
int  myRedScore      = 0;
int  myBlueScore     = 0;
bool roundScoreKnown = false;

// Decizia finala: dupa ce toate reprizele s-au incheiat, fiecare arbitru
// alege un castigator. Se trimite ca un rand fara repriza (round=null) cu
// 1 la castigator si 0 la celalalt - acelasi lucru pe care il face
// aplicatia din telefon.
//
// E o actiune ireversibila de pe placa: odata trimisa, serverul o mai
// accepta doar daca o sterge competition admin. De aceea nu se trimite
// din prima apasare, ci dintr-o a doua, pe aceeasi culoare.
bool allRoundsDone      = false;
bool finalDecided       = false;
bool finalChoiceRed     = false;
int  finalDecisionId    = 0;
int  myTotalRed         = 0;
int  myTotalBlue        = 0;
bool totalsKnown        = false;

bool          decisionArmed    = false;   // o culoare asteapta confirmarea
bool          decisionArmedRed = false;
unsigned long decisionArmedAt  = 0;
unsigned long lastDecisionTick = 0;

// Cat ramane armata confirmarea. Destul cat sa apesi a doua oara linistit,
// prea putin cat sa ramana armata pana cand o atingi din greseala.
const unsigned long DECISION_ARM_MS = 6000;

// Ultimele puncte pe care le-am dat, cu ce s-a ales de ele. Un singur
// punct urmarit nu ajunge: la doua faze la doua secunda distanta, primul
// poate fi inca in asteptare cand il trimit pe al doilea, si atunci i-as
// pierde urma. Banda asta e si raspunsul la "a intrat a doua apasare?".
#define MAX_RECENT 3
struct MyPoint {
  int        eventId;
  bool       isRed;
  int        points;
  PointState state;
};
MyPoint recent[MAX_RECENT];
int     recentCount = 0;

void pushRecent(int eventId, bool isRed, int points, PointState st) {
  if (recentCount == MAX_RECENT) {
    for (int i = 1; i < MAX_RECENT; i++) recent[i - 1] = recent[i];
    recentCount = MAX_RECENT - 1;
  }
  recent[recentCount].eventId = eventId;
  recent[recentCount].isRed   = isRed;
  recent[recentCount].points  = points;
  recent[recentCount].state   = st;
  recentCount++;
}

PointState    pointState   = POINT_NONE;
bool          pointSideRed = true;
int           pointValue   = 0;
int           pointEventId = 0;
unsigned long pointShownAt = 0;

// Cat tinem ecranul de punct inainte sa revenim la meci. Confirmarea se
// vede scurt, asteptarea mai mult - daca ceilalti arbitri n-au apasat in
// 4 secunde, punctul aproape sigur nu se mai valideaza si arbitrul
// trebuie sa vada din nou scorul, nu un ecran inghetat.
// Cat sta ecranul de punct peste meci. Scurt, intentionat: intr-o
// repriza care curge, patru secunde de ecran acoperit sunt o eternitate,
// iar arbitrul are nevoie sa vada saltea si repriza. Starea punctului nu
// se pierde - continua in banda de jos a ecranului de meci.
const unsigned long POINT_OK_MS      = 1200;
const unsigned long POINT_PENDING_MS = 1500;
const unsigned long POINT_FAST_MS    = 900;

// Cele patru sferturi de punctaj. Pe placa cu encoder erau butoane
// lipite, citite pe intrerupere fiindca loop() sta blocat in cereri HTTP.
// Aici sunt zone de ecran, si problema e aceeasi: cat tine o cerere,
// nimeni nu citeste touch-ul. De-asta ecranul e citit de un task propriu
// pe celalalt nucleu - vezi sectiunea TOUCH.
struct PointButton {
  bool        isRed;
  int         points;
  volatile unsigned long lastAcceptedMs;
};

// Ordinea sferturilor pe ecran. Nu se schimba: stanga-sus, stanga-jos,
// dreapta-sus, dreapta-jos. Ce se schimba e ROLUL fiecaruia - vezi mai jos.
PointButton pointButtons[4] = {
  { true,  2, 0 },   // stanga sus
  { true,  1, 0 },   // stanga jos
  { false, 2, 0 },   // dreapta sus
  { false, 1, 0 },   // dreapta jos
};

// Ce punct da fiecare sfert de ecran.
//
// Un arbitru stangaci vrea rosul in dreapta, altul vrea punctul mare jos
// - iar la lupte mana merge singura, nu se citeste eticheta. Fara asta,
// orice schimbare inseamna reprogramat device-ul; asa se face din
// launcher, prin cablu, in cateva secunde.
//
void aplicaRoluri() {
  for (int i = 0; i < 4; i++) {
    pointButtons[i].isRed  = (rolButoane[i][0] == 'r');
    pointButtons[i].points = (rolButoane[i][1] == '2') ? 2 : 1;
  }
}

void incarcaRoluri() {
  prefs.begin(PREFS_NAMESPACE, true);
  String salvat = prefs.getString("btn", "");
  prefs.end();

  // Formatul e "r1,r2,a1,a2" - patru roluri, despartite de virgula.
  if (salvat.length() == 11) {
    for (int i = 0; i < 4; i++) {
      rolButoane[i][0] = salvat[i * 3];
      rolButoane[i][1] = salvat[i * 3 + 1];
      rolButoane[i][2] = '\0';
    }
  }
  aplicaRoluri();
}

// Doua apasari pe acelasi buton mai apropiate decat atat sunt aceeasi
// intentie, nu doua puncte. Nimeni nu arbitreaza doua faze distincte la
// 400ms; in schimb un deget nervos sau o atingere dubla da exact asta.
//
// Nu e o preferinta de interfata, e o problema de scor. Serverul refuza
// sa valideze o faza vazuta de mai putin de ARBITRI_PENTRU_FAZA arbitri
// (trei din cinci, vezi backend/api/views/_common.py), dar daca doi colegi
// apasa in aceeasi fereastra de 1,5 secunde, atunci AMBELE apasari ale mele
// se valideaza si sportivul ia 2 puncte
// in loc de 1. Filtrul de aici e singurul loc unde asta se poate opri
// fara sa schimbam backendul.
//
// Pragul e generos fata de arbitrajul real: doi pumni la doua secunde,
// sau doua puncte la 1,5 secunde, trec amandoua fara sa fie atinse.
const unsigned long POINT_GUARD_MS = 400;

// O apasare respinsa nu se inghite in tacere: arbitrul trebuie sa stie
// ca punctul al doilea NU a plecat, altfel crede ca a dat doua.
bool pressTooFast = false;

// Coada de apasari a disparut, si e bine asa: pe placa cu butoane,
// intreruperea nota apasarea si o lasa pentru loop(), fiindca nu putea face
// nimic altceva de acolo. Aici coada e chiar coada de atingeri din
// sectiunea TOUCH, umpluta de taskul de pe celalalt nucleu - deci apasarea
// ajunge intreaga in bucla, cu coordonate, si garda se poate aplica pe loc.
//
// Intoarce true daca sfertul chiar trebuie punctat acum.
bool acceptaApasare(int index) {
  unsigned long now = millis();
  if (now - pointButtons[index].lastAcceptedMs < POINT_GUARD_MS) {
    pressTooFast = true;
    return false;
  }
  pointButtons[index].lastAcceptedMs = now;
  return true;
}

bool apiLoadMyMatches() {
  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["id"] = true;
  row["referee_position"] = true;

  JsonDocument res;
  if (apiRequest("GET", "/referees/me/assigned-matches/", "", res, &filter) != 200) {
    myMatchCount = 0;
    return false;
  }

  myMatchCount = 0;
  for (JsonObject item : res.as<JsonArray>()) {
    if (myMatchCount >= MAX_MATCHES) break;
    int id = item["id"] | 0;
    if (!id) continue;
    myMatchIds[myMatchCount] = id;
    strlcpy(myMatchPos[myMatchCount], item["referee_position"] | "",
            sizeof(myMatchPos[myMatchCount]));
    myMatchCount++;
  }
  return true;
}

bool isMyMatch(int matchId) {
  for (int i = 0; i < myMatchCount; i++) if (myMatchIds[i] == matchId) return true;
  return false;
}

const char* myPositionInMatch(int matchId) {
  for (int i = 0; i < myMatchCount; i++) if (myMatchIds[i] == matchId) return myMatchPos[i];
  return "";
}

// Numele colturilor si modul de afisare. `display_mode` decide totul:
// doar pe "real_time" serverul cere confirmarea a trei arbitri. In rest
// punctul intra direct, si atunci n-are rost sa aratam "astept".
void apiLoadMatch(int matchId) {
  liveRedName[0] = '\0';
  liveBlueName[0] = '\0';
  liveMatchRealTime = false;
  liveMatchCategoryId = 0;
  if (!matchId) return;

  JsonDocument filter;
  filter["red_corner_full_name"]  = true;
  filter["blue_corner_full_name"] = true;
  filter["display_mode"]          = true;
  filter["category"]              = true;

  JsonDocument res;
  if (apiRequest("GET", String("/matches/") + matchId + "/", "", res, &filter) != 200) return;

  toSurnameFirst(res["red_corner_full_name"]  | "", liveRedName,  sizeof(liveRedName));
  toSurnameFirst(res["blue_corner_full_name"] | "", liveBlueName, sizeof(liveBlueName));
  liveMatchRealTime = (strcmp(res["display_mode"] | "", "real_time") == 0);
  // Prezenta se raporteaza pe categorie, nu pe meci. Fara asta arbitrul
  // ramane rosu in admin cat tine meciul - adica exact cand operatorul
  // verifica daca toata lumea e pe pozitie.
  liveMatchCategoryId = res["category"] | 0;
}

// Repriza activa. Fara ea nu se puncteaza: aceeasi regula ca in
// aplicatia din telefon, unde butoanele sunt stinse in pauza.
void apiLoadActiveRound(int matchId) {
  activeRoundId = 0;
  activeRoundNumber = 0;
  activeRoundPaused = false;
  roundsKnown = false;
  if (!matchId) return;

  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["id"]           = true;
  row["round_number"] = true;
  row["status"]       = true;
  row["is_paused"]    = true;

  JsonDocument res;
  if (apiRequestFast("GET", String("/match-rounds/?match_id=") + matchId, res, &filter) != 200) return;

  roundsKnown = true;
  int roundCount = 0;
  bool anyUnfinished = false;
  for (JsonObject item : res.as<JsonArray>()) {
    roundCount++;
    const char* st = item["status"] | "";
    if (strcmp(st, "active") == 0) {
      activeRoundId     = item["id"] | 0;
      activeRoundNumber = item["round_number"] | 0;
      activeRoundPaused = item["is_paused"] | false;
    }
    // Orice repriza care nu s-a incheiat inseamna ca meciul continua.
    if (strcmp(st, "completed") != 0) anyUnfinished = true;
  }
  allRoundsDone = (roundCount > 0 && !anyUnfinished);
}

// Totalurile mele pe tot meciul, plus decizia finala daca am dat-o deja.
// Un singur raspuns le da pe amandoua: randurile cu repriza sunt notele,
// cel fara repriza e decizia.
void apiLoadMyTotals(int matchId) {
  myTotalRed = 0;
  myTotalBlue = 0;
  finalDecided = false;
  finalDecisionId = 0;
  totalsKnown = false;
  if (!matchId) return;

  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["id"]                = true;
  row["referee"]           = true;
  row["round"]             = true;
  row["red_corner_score"]  = true;
  row["blue_corner_score"] = true;

  JsonDocument res;
  if (apiRequestFast("GET", String("/match-referee-scores/?match_id=") + matchId, res, &filter) != 200) return;

  totalsKnown = true;
  for (JsonObject item : res.as<JsonArray>()) {
    if ((item["referee"] | 0) != myAthleteId) continue;
    int red  = scoreFromJson(item["red_corner_score"]);
    int blue = scoreFromJson(item["blue_corner_score"]);
    if (item["round"].isNull()) {
      finalDecided    = true;
      finalDecisionId = item["id"] | 0;
      finalChoiceRed  = (red > blue);
    } else {
      myTotalRed  += red;
      myTotalBlue += blue;
    }
  }
}

// Trimite castigatorul ales. 1 la el, 0 la celalalt, fara repriza.
bool apiSubmitDecision(bool redWins) {
  JsonDocument body;
  body["match"]             = liveMatchId;
  body["round"]             = nullptr;
  body["red_corner_score"]  = redWins ? 1 : 0;
  body["blue_corner_score"] = redWins ? 0 : 1;

  String payload;
  serializeJson(body, payload);

  JsonDocument res;
  httpTimeoutMs = POLL_TIMEOUT_MS;
  int code = finalDecisionId
    ? apiRequest("PATCH", String("/match-referee-scores/") + finalDecisionId + "/", payload, res, nullptr)
    : apiRequest("POST", "/match-referee-scores/", payload, res, nullptr);
  httpTimeoutMs = HTTP_TIMEOUT_MS;

  if (code != 200 && code != 201) return false;
  if (!finalDecisionId) finalDecisionId = res["id"] | 0;
  finalDecided   = true;
  finalChoiceRed = redWins;
  return true;
}

// Totalul meu pentru repriza activa. Vine de la server, nu din memoria
// placii: o repornire in mijlocul meciului nu trebuie sa reseteze scorul
// pe care l-am dat deja.
void apiLoadMyRoundScore(int matchId, int roundId) {
  myRoundScoreId  = 0;
  myRedScore      = 0;
  myBlueScore     = 0;
  roundScoreKnown = false;
  if (!matchId || !roundId) return;

  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["id"]                = true;
  row["referee"]           = true;
  row["red_corner_score"]  = true;
  row["blue_corner_score"] = true;

  JsonDocument res;
  if (apiRequestFast("GET",
        String("/match-referee-scores/?match_id=") + matchId + "&round_id=" + roundId,
        res, &filter) != 200) return;

  roundScoreKnown = true;
  for (JsonObject item : res.as<JsonArray>()) {
    if ((item["referee"] | 0) != myAthleteId) continue;   // randul altui arbitru
    myRoundScoreId = item["id"] | 0;
    myRedScore     = scoreFromJson(item["red_corner_score"]);
    myBlueScore    = scoreFromJson(item["blue_corner_score"]);
    break;
  }
}

// Salveaza ambele totaluri deodata, ca aplicatia din telefon: serverul
// tine un singur rand per arbitru si repriza, deci se creeaza o data si
// pe urma se corecteaza.
bool apiSaveRoundScore() {
  JsonDocument body;
  body["match"]             = liveMatchId;
  body["round"]             = activeRoundId;
  body["red_corner_score"]  = myRedScore;
  body["blue_corner_score"] = myBlueScore;

  String payload;
  serializeJson(body, payload);

  JsonDocument res;
  httpTimeoutMs = POLL_TIMEOUT_MS;
  int code = myRoundScoreId
    ? apiRequest("PATCH", String("/match-referee-scores/") + myRoundScoreId + "/", payload, res, nullptr)
    : apiRequest("POST", "/match-referee-scores/", payload, res, nullptr);
  httpTimeoutMs = HTTP_TIMEOUT_MS;

  if (code != 200 && code != 201) return false;
  if (!myRoundScoreId) myRoundScoreId = res["id"] | 0;
  return true;
}

// Decizia finala se da doar la meciurile cu afisare finala. In timp
// real castigatorul iese din punctele validate pe parcurs - acolo
// arbitrul a decis deja, apasand butoanele, si nu mai are ce sa declare.
bool needsFinalDecision() {
  return allRoundsDone && !liveMatchRealTime;
}

bool canScoreNow() {
  return liveMatchId && activeRoundId && !activeRoundPaused;
}

// Trimite punctul. Nu punem `client_timestamp_ms`: placa n-are ceas -
// am scos NTP-ul, care oricum nu mergea fara internet. Serverul cade
// atunci pe propriul `timestamp` (vezi
// _get_point_event_comparison_timestamp_ms), iar cum trimitem imediat ce
// se apasa butonul, diferenta e latenta retelei - zeci de milisecunde
// intr-o fereastra de 1500. Un ceas gresit ar fi fost mai rau decat
// niciun ceas: ar fi impiedicat validarea in loc s-o ajute.
void sendPoint(bool isRed, int points) {
  pointSideRed = isRed;
  pointValue   = points;
  pointEventId = 0;
  pointState   = POINT_SENDING;
  pointShownAt = millis();
  screen = SCREEN_MATCH;
  redraw();

  JsonDocument body;
  body["side"]       = isRed ? "red" : "blue";
  body["points"]     = points;
  body["event_type"] = "score";
  JsonObject meta = body["metadata"].to<JsonObject>();
  if (activeRoundNumber) meta["round"] = activeRoundNumber;
  if (activeRoundId)     meta["round_id"] = activeRoundId;
  meta["origin"] = "referee_device";

  String payload;
  serializeJson(body, payload);

  // Timp scurt, intentionat. apiRequest reincearca de trei ori cu
  // 10 secunde fiecare, ceea ce aici ar fi contraproductiv: fereastra
  // de validare are 1500ms, iar serverul compara momentul sosirii. Un
  // punct care ajunge dupa cinci secunde tot se inregistreaza, dar nu
  // se mai potriveste cu apasarea colegului - si intre timp placa ar
  // sta blocata si n-ar putea trimite punctul urmator.
  JsonDocument res;
  httpTimeoutMs = POLL_TIMEOUT_MS;
  int code = apiRequest("POST", String("/matches/") + liveMatchId + "/point_events/",
                        payload, res, nullptr);
  httpTimeoutMs = HTTP_TIMEOUT_MS;

  if (code != 201) {
    pointState = POINT_FAILED;
    pointShownAt = millis();
    redraw();
    return;
  }

  pointEventId = res["id"] | 0;
  // Raspunsul spune deja daca a prins: daca un coleg apasase inaintea
  // mea, punctul se valideaza chiar la trimiterea mea si vine
  // "validated" din prima. Daca sunt primul, raman in asteptare.
  pointState = (strcmp(res["validation_status"] | "pending", "validated") == 0)
                 ? POINT_VALIDATED : POINT_PENDING;
  pushRecent(pointEventId, isRed, points, pointState);
  pointShownAt = millis();
  redraw();
}

// Un punct in modul "reveal_final". Numarul creste pe loc, inainte sa
// plece cererea: arbitrul apasa cu ochii pe saltea si are nevoie de
// raspuns imediat. Daca salvarea pica, numarul se intoarce de unde a
// plecat si o spunem - un total gresit pe ecran ar fi mai rau decat o
// eroare vizibila.
void addRoundPoint(bool isRed, int points) {
  int prevRed  = myRedScore;
  int prevBlue = myBlueScore;

  if (isRed) myRedScore  += points;
  else       myBlueScore += points;

  pointState = POINT_NONE;
  screen = SCREEN_MATCH;
  redraw();

  if (!apiSaveRoundScore()) {
    myRedScore   = prevRed;
    myBlueScore  = prevBlue;
    pointSideRed = isRed;
    pointValue   = points;
    pointState   = POINT_FAILED;
    pointShownAt = millis();
    redraw();
  }
}

// Cat timp punctul meu e in asteptare, intreb serverul daca intre timp a
// apasat si ceilalti arbitri.
bool anyPendingRecent() {
  for (int i = 0; i < recentCount; i++) if (recent[i].state == POINT_PENDING) return true;
  return false;
}

void pollPointValidation() {
  if (!liveMatchId || !anyPendingRecent()) return;

  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["id"] = true;
  row["validation_status"] = true;

  JsonDocument res;
  if (apiRequestFast("GET",
        String("/matches/") + liveMatchId + "/point_events/?referee_id=" + myAthleteId,
        res, &filter) != 200) return;

  bool changed = false;
  for (JsonObject item : res.as<JsonArray>()) {
    int id = item["id"] | 0;
    if (!id) continue;
    bool ok = (strcmp(item["validation_status"] | "", "validated") == 0);
    if (!ok) continue;

    for (int i = 0; i < recentCount; i++) {
      if (recent[i].eventId != id || recent[i].state == POINT_VALIDATED) continue;
      recent[i].state = POINT_VALIDATED;
      changed = true;
      // Daca tocmai punctul aflat pe ecran s-a validat, fundalul trece
      // pe auriu si cronometrul o ia de la capat, ca sa se vada.
      if (id == pointEventId && pointState == POINT_PENDING) {
        pointState = POINT_VALIDATED;
        pointShownAt = millis();
      }
    }
  }
  if (changed) redraw();
}

// DRF serializeaza zecimalele ca text: scorul vine "88.00", nu 88. Citit
// ca numar, ArduinoJson nu converteste implicit si intoarce valoarea
// implicita - adica 0. De aici veneau notele de 0 dupa reconectare si
// istoricul plin de zerouri.
int scoreFromJson(JsonVariantConst value) {
  if (value.is<const char*>()) return (int)lroundf(atof(value.as<const char*>()));
  return (int)lroundf(value.as<float>());
}

// Notele mele din categoria curenta: cea pentru sportivul de pe saltea
// (ca sa stiu daca am notat deja) si ultimele cateva, pentru istoric.
void apiLoadMyScores(int categoryId, int athleteId) {
  mySubmittedScore = -1;
  historyCount = 0;
  if (!categoryId) return;

  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["athlete"]      = true;
  row["athlete_name"] = true;
  row["score"]        = true;

  JsonDocument res;
  if (apiRequest("GET", String("/category-referee-score/?category=") + categoryId, "", res, &filter) != 200) return;

  for (JsonObject item : res.as<JsonArray>()) {
    int id = item["athlete"] | 0;
    int score = scoreFromJson(item["score"]);
    if (id && id == athleteId) mySubmittedScore = score;

    {
      // Lista vine de la server in ordinea inserarii, deci ultimele sunt
      // cele recente. Cand se umple, impingem la stanga si pastram coada
      // - altfel istoricul ar ingheta pe primii notati din proba.
      if (historyCount == MAX_HISTORY) {
        for (int k = 1; k < MAX_HISTORY; k++) history[k - 1] = history[k];
        historyCount = MAX_HISTORY - 1;
      }
      // Doar numele de familie, si scurtat: pe 240px nu incape mai mult,
      // iar arbitrul stie pe cine a notat acum doua minute.
      char full[40];
      toAsciiName(item["athlete_name"] | "?", full, sizeof(full));
      const char* surname = strrchr(full, ' ');
      strlcpy(history[historyCount].name, surname ? surname + 1 : full,
              sizeof(history[historyCount].name));
      history[historyCount].score = score;
      historyCount++;
    }
  }
}

// Ce s-a ales de nota mea dupa dezvaluire: a intrat in total sau a fost
// taiata ca extrema. Serverul raspunde doar cat timp masa centrala chiar
// e pe "scoruri dezvaluite" - altfel intoarce revealed:false si nu avem
// ce afisa.
void apiLoadReveal(int categoryId) {
  JsonDocument filter;
  filter["revealed"] = true;
  filter["total"]    = true;
  JsonObject row = filter["scores"].add<JsonObject>();
  row["mine"]  = true;
  row["mark"]  = true;
  row["score"] = true;

  JsonDocument res;
  if (apiRequestFast("GET", String("/category-referee-score/reveal/?category=") + categoryId, res, &filter) != 200) {
    return;
  }
  if (!(res["revealed"] | false)) return;

  revealTotal = (int)lroundf(res["total"] | 0.0f);
  for (JsonObject item : res["scores"].as<JsonArray>()) {
    if (item["mine"] | false) {
      strlcpy(revealMark, item["mark"] | "counted", sizeof(revealMark));
      mySubmittedScore = scoreFromJson(item["score"]);
      revealKnown = true;
      return;
    }
  }
}

// Inima noului flux: ce are masa centrala pe ecran. Sesiunea aduce si
// numele categoriei si al sportivului, deci un singur raspuns de ~500
// octeti tine tot ecranul la zi.
//
// Intoarce true daca ceva s-a schimbat si merita redesenat.
bool pollMonitor() {
  if (!activeEventId) return false;

  JsonDocument filter;
  JsonObject row = filter.add<JsonObject>();
  row["field_name"]             = true;
  row["current_category"]       = true;
  row["current_match"]          = true;
  row["current_category_name"]  = true;
  row["current_athlete"]        = true;
  row["current_athlete_name"]   = true;
  row["current_team_name"]      = true;
  row["current_athlete_score_id"] = true;
  row["status"]                 = true;
  row["updated_at"]             = true;

  JsonDocument res;
  if (apiRequestFast("GET", String("/monitor-sessions/?event_id=") + activeEventId, res, &filter) != 200) {
    return false;
  }

  int  foundCategory = 0, foundAthlete = 0, foundScoreId = 0, foundMatch = 0;
  bool foundTeam = false, foundRevealed = false;
  const char* foundCategoryName = "";
  const char* foundName = "";
  const char* foundField = "";

  // Pot fi mai multe terenuri deschise pe categorii de-ale mele, iar unul
  // poate fi ramas din proba anterioara. Luam sesiunea modificata cel mai
  // recent, nu prima din lista - altfel ecranul arata alt sportiv decat
  // cel pe care tocmai l-a pus masa centrala.
  const char* bestStamp = "";
  for (JsonObject item : res.as<JsonArray>()) {
    int categoryId = item["current_category"] | 0;
    int matchId    = item["current_match"] | 0;
    const char* st = item["status"] | "idle";
    if (strcmp(st, "idle") == 0) continue;
    // Terenul e al meu daca e a mea fie proba tehnica, fie meciul de pe
    // el. Masa centrala pune ori una, ori alta.
    bool mine = (categoryId && isMyCategory(categoryId)) || (matchId && isMyMatch(matchId));
    if (!mine) continue;

    // Marcajele de timp vin ISO-8601 in UTC, deci se compara ca text.
    const char* stamp = item["updated_at"] | "";
    if (foundCategory && strcmp(stamp, bestStamp) <= 0) continue;
    bestStamp = stamp;

    foundCategory     = categoryId;
    foundMatch        = matchId;
    foundRevealed     = (strcmp(st, "scores_revealed") == 0);
    foundCategoryName = item["current_category_name"] | "";
    foundField        = item["field_name"] | "";
    foundScoreId      = item["current_athlete_score_id"] | 0;

    const char* teamName = item["current_team_name"] | "";
    if (teamName && teamName[0]) {
      foundTeam = true;
      foundName = teamName;
      foundAthlete = item["current_athlete"] | 0;
    } else {
      foundTeam = false;
      foundAthlete = item["current_athlete"] | 0;
      foundName = item["current_athlete_name"] | "";
    }
  }

  bool matchChanged = (foundMatch != liveMatchId);
  bool changed = matchChanged || (foundCategory != liveCategoryId) || (foundAthlete != liveAthleteId);
  liveMatchId = foundMatch;
  if (matchChanged) {
    // Meci nou pe saltea: numele colturilor, si orice punct ramas pe
    // ecran de la meciul anterior dispare. Un "+2 VALIDAT" lasat
    // peste doi sportivi noi ar fi mai rau decat un ecran gol.
    apiLoadMatch(foundMatch);
    pointState = POINT_NONE;
    recentCount = 0;
    pointEventId = 0;
    myRoundScoreId = 0;
    myRedScore = 0;
    myBlueScore = 0;
    roundScoreKnown = false;
    allRoundsDone = false;
    finalDecided = false;
    finalDecisionId = 0;
    totalsKnown = false;
    decisionArmed = false;
    activeRoundId = 0;
    roundsKnown = false;
  }

  liveCategoryId     = foundCategory;
  liveAthleteId      = foundAthlete;
  liveAthleteScoreId = foundScoreId;
  liveIsTeam         = foundTeam;
  if (foundRevealed != liveRevealed) {
    liveRevealed = foundRevealed;
    revealKnown = false;        // stare noua, cerem din nou de la server
  }
  toAsciiName(foundCategoryName, liveCategoryName,   sizeof(liveCategoryName));
  if (foundTeam) toAsciiName(foundName, liveCompetitorName, sizeof(liveCompetitorName));
  else           toSurnameFirst(foundName, liveCompetitorName, sizeof(liveCompetitorName));
  // "Teren 1" -> "T1": in bara de sus nu e loc de cuvinte intregi.
  char fieldFull[24];
  toAsciiName(foundField, fieldFull, sizeof(fieldFull));
  const char* digits = fieldFull;
  while (*digits && (*digits < '0' || *digits > '9')) digits++;
  if (*digits) snprintf(liveFieldName, sizeof(liveFieldName), "T%s", digits);
  else         strlcpy(liveFieldName, fieldFull, sizeof(liveFieldName));

    strlcpy(liveRefPosition,
          foundMatch ? myPositionInMatch(foundMatch) : myPositionIn(foundCategory),
          sizeof(liveRefPosition));

  if (changed) {
    apiLoadMyScores(liveCategoryId, liveAthleteId);

    if (mySubmittedScore >= 0) {
      // Am notat deja acest concurent - fie acum un minut, fie inainte de
      // o deconectare. Nota ramane blocata: starea vine de la server, nu
      // din memoria dispozitivului, altfel o repornire ar redeschide o
      // nota deja data.
      submittedScore = mySubmittedScore;
      submittedShown = true;
    } else {
      submittedShown = false;
      draftScore = MAX_SCORE;
    }
    revealKnown = false;
    revealMark[0] = '\0';
  }
  return changed;
}

// Prezenta pe meci. Adminul intreaba prezenta dupa meci
// (/referee-presence/?match=N), iar un rand salvat pe categorie nu e
// gasit de interogarea aia - de-asta arbitrul de pe placa aparea
// deconectat cat tinea meciul, desi trimitea puncte in acelasi timp.
void apiPingPresenceForMatch(int matchId) {
  if (!myAthleteId || !matchId) return;
  JsonDocument body;
  body["match"]   = matchId;
  body["referee"] = myAthleteId;
  String payload;
  serializeJson(body, payload);

  JsonDocument res;
  httpTimeoutMs = POLL_TIMEOUT_MS;
  apiRequestOnce("POST", "/referee-presence/", payload, res, nullptr);
  httpTimeoutMs = HTTP_TIMEOUT_MS;
}

void apiPingPresence(int categoryId) {
  if (!myAthleteId) return;
  JsonDocument body;
  body["category"] = categoryId;
  body["referee"]  = myAthleteId;
  String payload;
  serializeJson(body, payload);

  JsonDocument res;
  httpTimeoutMs = POLL_TIMEOUT_MS;
  apiRequestOnce("POST", "/referee-presence/", payload, res, nullptr);
  httpTimeoutMs = HTTP_TIMEOUT_MS;
}

// Acelasi apel pe care il face butonul de trimitere din aplicatia web.
// Serverul face upsert: daca am notat deja, nota se corecteaza in loc sa
// apara o a doua inregistrare.
//
// Cand masa centrala a deschis deja randul de scor, trimitem direct pe el
// (`athlete_score`): asa merg si echipele, unde nu exista un singur
// sportiv de indicat. Altfel, categoria plus sportivul.
int apiSubmitScore(int score) {
  JsonDocument body;
  if (liveAthleteScoreId) {
    body["athlete_score"] = liveAthleteScoreId;
  } else {
    body["category"] = liveCategoryId;
    body["athlete"]  = liveAthleteId;
  }
  body["score"] = score;
  String payload;
  serializeJson(body, payload);

  JsonDocument res;
  return apiRequest("POST", "/category-referee-score/", payload, res, nullptr);
}


// ───────────────────────────── DESEN ─────────────────────────────
//
// Toate zonele atinse stau in tabelele de mai jos, si acelea sunt folosite
// si la desen. Nu e o eleganta, e singura aparare impotriva greselii pe care
// o face un ecran tactil si un buton nu: butonul desenat intr-un loc si
// atingerea verificata in altul. Daca schimbi un numar, se muta si desenul.

// Latimea a ramas 240, iar fontul are 6px pe caracter: cam 38 de caractere
// pe rand. Fara taiere pe cuvinte, un mesaj mai lung se scrie pur si
// simplu peste marginea ecranului - si se pierde tocmai coada, unde sta
// codul de eroare, adica singura parte care spune ceva.
int drawWrapped(int x, int y, int lineHeight, int maxChars, const String& text) {
  int start = 0;
  int len = text.length();
  while (start < len) {
    int take = (len - start < maxChars) ? (len - start) : maxChars;
    if (start + take < len) {
      int space = text.lastIndexOf(' ', start + take);
      if (space > start) take = space - start;
    }
    gfx->setCursor(x, y);
    gfx->print(text.substring(start, start + take));
    y += lineHeight;
    start += take;
    while (start < len && text[start] == ' ') start++;
  }
  return y;
}

// Patru bare de semnal, ca pe telefon. Un numar in dBm nu spune nimic
// cuiva de la masa de arbitraj; barele spun daca merita mutat aparatul.
void drawSignalBars(int x, int y) {
  int rssi = WiFi.RSSI();
  int bars = 0;
  if (WiFi.status() == WL_CONNECTED) {
    if      (rssi > -58) bars = 4;
    else if (rssi > -68) bars = 3;
    else if (rssi > -76) bars = 2;
    else                 bars = 1;
  }
  for (int i = 0; i < 4; i++) {
    int h = 4 + i * 3;
    int bx = x + i * 5;
    uint16_t color = (i < bars) ? (bars <= 1 ? RED : (bars == 2 ? YELLOW : GREEN)) : DARKGRAY;
    gfx->fillRect(bx, y + (13 - h), 3, h, color);
  }
}

// Scrie centrat pe latimea ecranului. Fontul are 6px pe caracter la
// dimensiunea 1, si se scaleaza liniar.
void printCentered(const char* text, int y, int size, uint16_t color) {
  gfx->setTextSize(size);
  gfx->setTextColor(color);
  int w = strlen(text) * 6 * size;
  gfx->setCursor((SCREEN_W - w) / 2, y);
  gfx->print(text);
}

// Centrat pe o zona, nu pe ecran. Cu butoane desenate din tabel, asta e
// singurul fel in care eticheta sta sigur in mijlocul zonei care raspunde.
void printCenteredIn(const TouchZone& z, const char* text, int size, uint16_t color) {
  gfx->setTextSize(size);
  gfx->setTextColor(color);
  int w = strlen(text) * 6 * size;
  int h = 8 * size;
  gfx->setCursor(z.x + (z.w - w) / 2, z.y + (z.h - h) / 2);
  gfx->print(text);
}

// Un buton, desenat exact peste zona care il asculta.
void drawButton(const TouchZone& z, const char* label, uint16_t bg, uint16_t ink, int size) {
  gfx->fillRect(z.x, z.y, z.w, z.h, bg);
  gfx->drawRect(z.x, z.y, z.w, z.h, LIGHTGRAY);
  printCenteredIn(z, label, size, ink);
}

// Bara de sus e si butonul de predare a dispozitivului. Nu are eticheta: pe
// un aparat care trece din mana in mana, un "IESIRE" vizibil permanent e
// mai mult o invitatie decat o informatie, iar predarea cere oricum o
// confirmare dupa.
const TouchZone ZONA_BARA_SUS = { 0, 0, SCREEN_W, 26 };

// Ecranele pline - predarea, confirmarea deciziei - acopera bara de sus.
// Reimprospatarea de o secunda trebuie sa stie, altfel trage o dunga gri
// peste ele. Steagul se pune din desen, nu se deduce din stare: starea are
// patru conditii si se schimba, desenul e un singur loc.
bool topBarVisible = false;

// Reluarea, pe ecranele de eroare. Pe placa veche scria "apasa encoderul";
// aici e un buton, fiindca nu mai exista nimic altceva de apasat.
const TouchZone ZONA_REIA = { 20, 246, 200, 56 };

// Tastatura de PIN. Trei coloane care umplu latimea si patru randuri: cifrele
// in ordinea de pe telefon, iar jos sterge, zero si intrarea.
const TouchZone PIN_KEYS[12] = {
  {   0, 126, 76, 44 }, {  82, 126, 76, 44 }, { 164, 126, 76, 44 },
  {   0, 173, 76, 44 }, {  82, 173, 76, 44 }, { 164, 173, 76, 44 },
  {   0, 220, 76, 44 }, {  82, 220, 76, 44 }, { 164, 220, 76, 44 },
  {   0, 267, 76, 44 }, {  82, 267, 76, 44 }, { 164, 267, 76, 44 },
};
const char* PIN_LABELS[12] = { "1", "2", "3", "4", "5", "6",
                               "7", "8", "9", "<", "0", "OK" };

// Nota la tehnica. Patru trepte si trimiterea.
//
// Pe encoder nota se invartea in jos dintr-un maxim, cate un punct. Aici
// treptele de zece exista fiindca degetul nu are inertie: de la 100 la 72 sunt
// cinci apasari, nu douazeci si opt de clicuri.
const TouchZone SCORE_STEPS[4] = {
  {   1, 200, 58, 48 },
  {  61, 200, 58, 48 },
  { 121, 200, 58, 48 },
  { 181, 200, 58, 48 },
};
const int   SCORE_STEP_DELTA[4]  = { -10, -1, 1, 10 };
const char* SCORE_STEP_LABEL[4]  = { "-10", "-1", "+1", "+10" };
const TouchZone SCORE_SEND = { 8, 256, 224, 56 };

// Cele patru sferturi de la lupte in timp real. Umplu exact suprafata dintre
// bara de sus si banda de jos: nicio fasie neatribuita, ca sa nu existe loc
// pe ecran in care arbitrul apasa si nu se intampla nimic.
const TouchZone QUADRANTS[4] = {
  {   0,  26, 120, 133 },   // stanga sus
  {   0, 159, 120, 133 },   // stanga jos
  { 120,  26, 120, 133 },   // dreapta sus
  { 120, 159, 120, 133 },   // dreapta jos
};
#define MATCH_BAND_Y 292

// La afisare finala arbitrul isi tine propriul total, deci jumatatile de
// ecran arata numerele si butoanele stau dedesubt. Ordinea e aceeasi ca la
// sferturi, ca sa nu se invete doua obiceiuri pentru acelasi punct.
const TouchZone HALF_BTN[4] = {
  {   2, 126, 116, 74 },
  {   2, 204, 116, 74 },
  { 122, 126, 116, 74 },
  { 122, 204, 116, 74 },
};

// Decizia finala: doua butoane cat jumatatea ecranului.
const TouchZone DECISION_BTN[2] = {
  {   2, 212, 116, 66 },
  { 122, 212, 116, 66 },
};

// Predarea dispozitivului. Separate si mari: e singura actiune din care nu te
// poti intoarce fara sa stii din nou PIN-ul.
const TouchZone HANDOVER_DA = { 16, 170, 208, 62 };
const TouchZone HANDOVER_NU = { 16, 244, 208, 62 };

// Ecranul de pornire. Pana acum, la alimentare aparea un ecran negru cu
// un rand de text - arata a placa de test, nu a aparat de concurs. Si,
// mai practic: fara o bara care avanseaza, arbitrul nu stie daca placa
// lucreaza sau s-a blocat, iar conectarea la WiFi poate dura secunde bune.
void drawSplash(int percent, const char* step) {
  topBarVisible = false;
  gfx->fillScreen(NAVY);

  // Sigla e deja compusa peste acelasi navy, deci se aseaza fara contur.
  gfx->draw16bitRGBBitmap((SCREEN_W - FRVV_LOGO_W) / 2, 28,
                          FRVV_LOGO, FRVV_LOGO_W, FRVV_LOGO_H);

  printCentered("APLICATIE ARBITRI", 172, 2, GOLD);

  String version = String("v") + FW_VERSION + "  -  " + FW_UPDATED;
  printCentered(version.c_str(), 198, 1, LIGHTGRAY);

  // Bara de progres: fara ea, o conectare la WiFi de cateva secunde pare
  // un aparat blocat.
  const int barX = 30, barY = 230, barW = 180, barH = 14;
  gfx->drawRect(barX, barY, barW, barH, LIGHTGRAY);
  int fill = (barW - 4) * percent / 100;
  if (fill > 0) gfx->fillRect(barX + 2, barY + 2, fill, barH - 4, GOLD);

  if (step && step[0]) printCentered(step, 262, 1, WHITE);
}

// In locul ceasului: cat a durat ultimul dus-intors. Verde sub
// 150ms, galben sub 400, rosu peste, "!!" cand ultima cerere a
// picat de tot. La montaj, plimbat pe la fiecare masa, arata unde e
// legatura slaba inainte sa inceapa concursul - acolo unde barele
// pline ar spune ca totul e in regula.
void drawLastRequest(int x, int y) {
  gfx->setCursor(x, y);
  if (!lastRequestDone) {
    gfx->setTextColor(DARKGRAY);
    gfx->print("--");
    return;
  }
  if (!lastRequestOk) {
    gfx->setTextColor(RED);
    gfx->print("!!");
    return;
  }
  gfx->setTextColor(lastRequestMs < 150 ? GREEN : (lastRequestMs < 400 ? YELLOW : RED));
  gfx->print(lastRequestMs);
  gfx->print("ms");
}

void drawTopBar() {
  topBarVisible = true;
  gfx->fillRect(0, 0, SCREEN_W, 25, DARKGRAY);
  gfx->drawFastHLine(0, 25, SCREEN_W, LIGHTGRAY);
  gfx->setTextSize(1);

  drawSignalBars(6, 6);

  gfx->setCursor(30, 9);
  if (WiFi.status() == WL_CONNECTED) {
    gfx->setTextColor(WHITE);
    gfx->print(refereeShort.length() ? refereeShort : String("WiFi"));
  } else {
    gfx->setTextColor(RED);
    gfx->print("FARA WIFI");
  }

  // Terenul si pozitia de arbitru, in dreapta - astea doua spun, dintr-o
  // privire, daca dispozitivul e pe locul potrivit. Cat nu e nimic
  // pe saltea locul e liber, si atunci arata calitatea legaturii -
  // adica exact in perioada in care umbli la AP-uri si vrei sa stii
  // daca ai reusit.
  if (liveFieldName[0] || liveRefPosition[0]) {
    gfx->setCursor(186, 9);
    gfx->setTextColor(YELLOW);
    gfx->print(liveFieldName);
    if (liveFieldName[0] && liveRefPosition[0]) gfx->print("|");
    gfx->print(liveRefPosition);
  } else {
    drawLastRequest(186, 9);
  }
}

// Ecranul de meci in timp real: patru dreptunghiuri cat tot ecranul, asezate
// ca butoanele care erau pe masa. Rosu in stanga, albastru in dreapta, +2 sus
// si +1 jos - sau cum spune BTN=.
//
// Fara numele sportivilor si fara scor. Arbitrul nu citeste ecranul in
// timpul reprizei - are ochii pe saltea. Ecranul e oglinda mainii lui:
// la apasare, dreptunghiul corespunzator se face galben, si atat trebuie sa
// prinda din coltul ochiului ca sa stie ca punctul a plecat. Verde
// inseamna ca l-au confirmat si ceilalti arbitri.
//
// Pe touch, dimensiunea lor nu e doar estetica: un sfert de ecran se
// nimereste fara sa te uiti, un buton de 40 de pixeli nu.
void drawQuadrant(int index) {
  const TouchZone& z = QUADRANTS[index];
  bool isRed  = pointButtons[index].isRed;
  int  points = pointButtons[index].points;

  uint16_t bg = isRed ? SIDE_RED : SIDE_BLUE;

  // Dreptunghiul apasat acum. Il recunoastem dupa culoare si valoare, nu
  // dupa pozitie, ca sa nu existe doua adevaruri despre aceeasi apasare.
  bool mine = (pointState != POINT_NONE)
              && (pointSideRed == isRed)
              && (pointValue == points);
  if (mine) {
    if      (pointState == POINT_VALIDATED) bg = GREEN;
    else if (pointState == POINT_FAILED)    bg = DARKGRAY;
    else if (pointState == POINT_SENDING
          || pointState == POINT_PENDING)   bg = YELLOW;
  }

  gfx->fillRect(z.x, z.y, z.w, z.h, bg);
  gfx->drawRect(z.x, z.y, z.w, z.h, BLACK);

  char label[4];
  snprintf(label, sizeof(label), "+%d", points);
  // Pe galben si pe verde, textul alb dispare.
  printCenteredIn(z, label, 6, (bg == YELLOW || bg == GREEN) ? BLACK : WHITE);
}

void drawMatchScreen() {
  drawTopBar();

  for (int i = 0; i < 4; i++) drawQuadrant(i);

  // Banda de jos spune ori in ce repriza suntem, ori ce s-a ales de
  // ultima apasare. Nicio apasare nu dispare in tacere.
  gfx->fillRect(0, MATCH_BAND_Y, SCREEN_W, SCREEN_H - MATCH_BAND_Y, BLACK);
  switch (pointState) {
    case POINT_SENDING:
      printCentered("SE TRIMITE...", MATCH_BAND_Y + 6, 1, YELLOW);
      break;
    case POINT_PENDING:
      printCentered("TRIMIS - e nevoie de 3 arbitri", MATCH_BAND_Y + 6, 1, YELLOW);
      break;
    case POINT_VALIDATED:
      printCentered("VALIDAT", MATCH_BAND_Y + 4, 2, GREEN);
      break;
    case POINT_FAILED:
      printCentered("NETRIMIS - fara legatura", MATCH_BAND_Y + 6, 1, RED);
      break;
    case POINT_TOO_FAST:
      printCentered("PREA REPEDE - punctul NU a plecat", MATCH_BAND_Y + 6, 1, ORANGE);
      break;
    case POINT_CLOSED:
      printCentered(allRoundsDone ? "MECI INCHEIAT - nu se puncteaza"
                                  : "NU SE PUNCTEAZA ACUM", MATCH_BAND_Y + 6, 1, ORANGE);
      break;
    default:
      if (!roundsKnown) {
        printCentered("...", MATCH_BAND_Y + 4, 2, LIGHTGRAY);
      } else if (allRoundsDone) {
        printCentered("MECI INCHEIAT", MATCH_BAND_Y + 4, 2, GOLD);
      } else if (activeRoundPaused) {
        printCentered("PAUZA", MATCH_BAND_Y + 4, 2, ORANGE);
      } else if (!activeRoundId) {
        printCentered("INTRE REPRIZE", MATCH_BAND_Y + 4, 2, ORANGE);
      } else {
        char line[24];
        snprintf(line, sizeof(line), "REPRIZA %d", activeRoundNumber);
        printCentered(line, MATCH_BAND_Y + 4, 2, GREEN);
      }
      break;
  }
}

// O jumatate de ecran: coltul, sportivul, si totalul meu.
void drawHalfScoreAt(int x0, int y0, int h, uint16_t bg,
                     const char* corner, const char* name, int value) {
  gfx->fillRect(x0, y0, 120, h, bg);

  gfx->setTextSize(1);
  gfx->setTextColor(WHITE);
  gfx->setCursor(x0 + 6, y0 + 8);
  gfx->print(corner);

  // 120px la marimea 1 inseamna 20 de caractere; taiem, nu lasam numele
  // sa curga peste jumatatea cealalta.
  char shortName[19];
  strlcpy(shortName, name[0] ? name : "-", sizeof(shortName));
  gfx->setCursor(x0 + 6, y0 + 22);
  gfx->print(shortName);

  char buf[6];
  snprintf(buf, sizeof(buf), "%d", value);

  gfx->setTextSize(6);
  int w = strlen(buf) * 6 * 6;
  gfx->setCursor(x0 + (120 - w) / 2, y0 + 40);
  gfx->print(buf);
}

// Modul "reveal_final": nu exista validare in doi, fiecare arbitru isi
// tine propriul total. Ecranul se imparte in doua pentru ca arbitrul
// trebuie sa vada permanent ambele numere - ele sunt nota lui, nu un
// simplu semnal ca apasarea a fost primita.
//
// Jumatatile arata, butoanele de dedesubt dau. Pe encoder nu era nevoie de
// despartirea asta - butonul era in afara ecranului.
void drawMatchScoreScreen() {
  drawTopBar();

  // Care colt sta in stanga nu e o alegere de desen: iese din BTN=, ca sa nu
  // existe un arbitru care a pus rosul in dreapta la sferturi si il
  // gaseste in stanga aici.
  bool leftRed  = pointButtons[0].isRed;
  bool rightRed = pointButtons[2].isRed;

  int leftScore  = leftRed  ? myRedScore : myBlueScore;
  int rightScore = rightRed ? myRedScore : myBlueScore;

  drawHalfScoreAt(0,   26, 96, leftRed  ? SIDE_RED : SIDE_BLUE,
                  leftRed  ? "ROSU" : "ALBASTRU",
                  leftRed  ? liveRedName : liveBlueName,
                  roundScoreKnown ? leftScore : 0);
  drawHalfScoreAt(120, 26, 96, rightRed ? SIDE_RED : SIDE_BLUE,
                  rightRed ? "ROSU" : "ALBASTRU",
                  rightRed ? liveRedName : liveBlueName,
                  roundScoreKnown ? rightScore : 0);
  gfx->drawFastVLine(120, 26, 96, BLACK);

  if (!roundScoreKnown) {
    // Pana vine nota de la server nu aratam zero: un zero neadevarat se
    // citeste ca "n-am dat niciun punct". Caseta acopera numarul intreg,
    // pana la marginea de jos a jumatatii - cifrele au 48 de pixeli, si o
    // caseta mai scunda le lasa coada la vedere sub text.
    gfx->fillRect(0, 60, SCREEN_W, 62, BLACK);
    printCentered("se incarca...", 78, 2, LIGHTGRAY);
  }

  // Butoanele. Stinse cand nu se puncteaza: un buton care arata viu si nu
  // face nimic e mai rau decat unul care arata stins.
  bool viu = canScoreNow();
  for (int i = 0; i < 4; i++) {
    bool isRed  = pointButtons[i].isRed;
    int  points = pointButtons[i].points;
    char label[4];
    snprintf(label, sizeof(label), "+%d", points);
    uint16_t bg = viu ? (isRed ? SIDE_RED : SIDE_BLUE) : DARKGRAY;
    drawButton(HALF_BTN[i], label, bg, viu ? WHITE : LIGHTGRAY, 5);
  }

  gfx->fillRect(0, 282, SCREEN_W, SCREEN_H - 282, BLACK);
  if (!roundsKnown) {
    printCentered("...", 290, 2, LIGHTGRAY);
  } else if (activeRoundPaused) {
    printCentered("PAUZA", 290, 2, ORANGE);
  } else if (allRoundsDone) {
    printCentered("MECI INCHEIAT", 290, 2, GOLD);
  } else if (!activeRoundId) {
    printCentered("INTRE REPRIZE", 290, 2, ORANGE);
  } else {
    char line[24];
    snprintf(line, sizeof(line), "REPRIZA %d", activeRoundNumber);
    printCentered(line, 290, 2, GREEN);
  }
}

// Decizia finala. Trei stari pe acelasi ecran: alegerea, confirmarea, si
// decizia deja trimisa.
void drawDecisionScreen() {
  // Deja am decis: nu mai are ce sa faca atingerea. Serverul oricum n-ar
  // accepta o schimbare fara ca adminul sa stearga randul, iar un ecran
  // care pare sa astepte o apasare ar minti.
  if (finalDecided) {
    topBarVisible = false;
    gfx->fillScreen(finalChoiceRed ? SIDE_RED : SIDE_BLUE);
    printCentered("DECIZIA TA", 80, 2, WHITE);
    printCentered(finalChoiceRed ? "ROSU" : "ALBASTRU", 130, 4, WHITE);
    printCentered("trimisa", 190, 2, WHITE);
    printCentered("se schimba doar de la masa centrala", 240, 1, WHITE);
    return;
  }

  // O culoare asteapta confirmarea. Ecran plin, ca sa nu existe dubiu
  // despre ce urmeaza sa trimiti.
  if (decisionArmed) {
    topBarVisible = false;
    gfx->fillScreen(decisionArmedRed ? SIDE_RED : SIDE_BLUE);
    printCentered(decisionArmedRed ? "ROSU" : "ALBASTRU", 40, 4, WHITE);
    printCentered("APASA DIN NOU", 96, 2, WHITE);
    printCentered("ca sa confirmi castigatorul", 124, 1, WHITE);
    unsigned long left = DECISION_ARM_MS - (millis() - decisionArmedAt);
    char line[24];
    snprintf(line, sizeof(line), "%lus", (left / 1000) + 1);
    printCentered(line, 148, 2, WHITE);
    printCentered("cealalta culoare schimba alegerea", 186, 1, WHITE);

    // Butoanele raman exact unde erau. Pe placa cu butoane confirmarea se
    // dadea pe acelasi buton fiindca butonul nu se muta niciodata; pe ecran,
    // daca le-am scoate, a doua apasare ar fi un ghicit - si ea e cea care
    // trimite decizia.
    bool leftRed = pointButtons[0].isRed;
    drawButton(DECISION_BTN[0], leftRed ? "ROSU" : "ALBASTRU",
               leftRed ? SIDE_RED : SIDE_BLUE, WHITE, 2);
    drawButton(DECISION_BTN[1], leftRed ? "ALBASTRU" : "ROSU",
               leftRed ? SIDE_BLUE : SIDE_RED, WHITE, 2);
    return;
  }

  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();
  printCentered("CINE A CASTIGAT?", 32, 1, GOLD);

  // Totalurile mele, nu ale meciului: arbitrul decide pe ce a notat el.
  bool leftRed = pointButtons[0].isRed;
  drawHalfScoreAt(0,   46, 158, leftRed ? SIDE_RED : SIDE_BLUE,
                  leftRed ? "ROSU" : "ALBASTRU",
                  leftRed ? liveRedName : liveBlueName,
                  leftRed ? myTotalRed : myTotalBlue);
  drawHalfScoreAt(120, 46, 158, leftRed ? SIDE_BLUE : SIDE_RED,
                  leftRed ? "ALBASTRU" : "ROSU",
                  leftRed ? liveBlueName : liveRedName,
                  leftRed ? myTotalBlue : myTotalRed);
  gfx->drawFastVLine(120, 46, 158, BLACK);

  drawButton(DECISION_BTN[0], leftRed ? "ROSU" : "ALBASTRU",
             leftRed ? SIDE_RED : SIDE_BLUE, WHITE, 2);
  drawButton(DECISION_BTN[1], leftRed ? "ALBASTRU" : "ROSU",
             leftRed ? SIDE_BLUE : SIDE_RED, WHITE, 2);

  gfx->fillRect(0, 282, SCREEN_W, SCREEN_H - 282, BLACK);
  if (!totalsKnown) {
    printCentered("se incarca notele...", 290, 1, LIGHTGRAY);
  } else if (myTotalRed == myTotalBlue) {
    printCentered("EGALITATE - alegi tu", 288, 1, ORANGE);
    printCentered("apasa culoarea castigatoare", 302, 1, LIGHTGRAY);
  } else {
    printCentered("apasa culoarea castigatoare", 295, 1, LIGHTGRAY);
  }
}

// Confirmarea apasarii, pe tot ecranul. Fundalul spune cui i-am dat
// punctul inainte sa citesti ceva: rosu sau albastru la apasare, auriu
// cand punctul a fost validat. Arbitrul se uita la saltea, nu la cutie -
// trebuie sa-i spuna culoarea, din coltul ochiului.
void drawPointOverlay() {
  uint16_t bg = pointSideRed ? SIDE_RED : SIDE_BLUE;
  if (pointState == POINT_VALIDATED) bg = GOLD;
  if (pointState == POINT_FAILED)    bg = DARKGRAY;
  if (pointState == POINT_TOO_FAST)  bg = ORANGE;
  if (pointState == POINT_CLOSED)    bg = DARKGRAY;

  // Bara de sus ramane vizibila. Semnalul, numele arbitrului si terenul
  // sunt exact ce vrei sa poti verifica dintr-o privire tocmai cand
  // tocmai ai trimis un punct - daca le acoperim, arbitrul nu mai are
  // cum sa vada ca a pierdut legatura fix in momentul care conteaza.
  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, bg);
  drawTopBar();

  uint16_t ink = (pointState == POINT_VALIDATED) ? BLACK : WHITE;

  // Numarul mare doar cand chiar exista un punct in spatele lui. La
  // "prea repede" nu stim care sfert a fost respins, iar un "+2" ramas
  // de la apasarea anterioara ar minti.
  if (pointState != POINT_TOO_FAST && pointValue > 0) {
    char big[6];
    snprintf(big, sizeof(big), "+%d", pointValue);
    printCentered(big, 70, pointState == POINT_CLOSED ? 6 : 9, ink);
  }

  // La validare scriem si cine a luat punctul, in culoarea lui: auriul
  // spune "confirmat", cuvantul spune "al cui".
  if (pointState == POINT_VALIDATED) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 200, 3,
                  pointSideRed ? SIDE_RED : SIDE_BLUE);
    printCentered("VALIDAT", 250, 2, BLACK);
  } else if (pointState == POINT_PENDING) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 200, 3, ink);
    printCentered("ASTEPT AL 2-LEA ARBITRU", 260, 1, ink);
  } else if (pointState == POINT_SENDING) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 200, 3, ink);
    printCentered("SE TRIMITE...", 260, 1, ink);
  } else if (pointState == POINT_CLOSED) {
    printCentered("NU SE PUNCTEAZA", 180, 2, WHITE);
    printCentered(allRoundsDone ? "meciul s-a incheiat"
                  : (activeRoundPaused ? "repriza e in pauza" : "esti intre reprize"),
                  220, 1, WHITE);
    printCentered("punctul NU a fost trimis", 250, 1, ORANGE);
  } else if (pointState == POINT_TOO_FAST) {
    printCentered("PREA REPEDE", 170, 2, WHITE);
    printCentered("punctul NU a fost trimis", 215, 1, WHITE);
    printCentered("apasa din nou daca e o faza noua", 240, 1, WHITE);
  } else {
    printCentered("NETRIMIS", 200, 3, RED);
    printCentered("fara legatura cu serverul", 260, 1, WHITE);
  }
}

void drawStatusScreen() {
  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(statusIsError ? RED : CYAN);
  gfx->setCursor(12, 90);
  gfx->println(statusTitle);

  gfx->setTextSize(1);
  gfx->setTextColor(WHITE);
  drawWrapped(12, 128, 14, 37, statusDetail);

  if (statusIsError) drawButton(ZONA_REIA, "INCEARCA DIN NOU", NAVY, GOLD, 2);
}

void setStatus(const String& title, const String& detail, bool isError) {
  statusTitle  = title;
  statusDetail = detail;
  statusIsError = isError;
  screen = SCREEN_STATUS;
  drawStatusScreen();
}

// Lista retelelor gasite, cand conectarea a picat. Fara ea, "FARA WIFI"
// nu spune daca reteaua lipseste, e pe 5GHz, sau doar respinge parola -
// si nu ai unde sa te uiti, placa n-are consola la indemana in sala.
void drawWifiDiagScreen() {
  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(RED);
  gfx->setCursor(10, 34);
  gfx->println("FARA WIFI");

  gfx->setTextSize(1);
  gfx->setTextColor(scanFoundOurs ? GREEN : RED);
  gfx->setCursor(150, 36);
  gfx->print("v");
  gfx->print(FW_VERSION);
  gfx->print(scanFoundOurs ? " gasit" : " negasit");

  gfx->setTextColor(YELLOW);
  drawWrapped(10, 58, 11, 38, statusDetail);

  gfx->setTextColor(CYAN);
  gfx->setCursor(10, 110);
  if (scanCount == 0) {
    gfx->println("Nicio retea 2.4GHz in jur.");
  } else {
    gfx->print("Retele gasite (");
    gfx->print(scanCount);
    gfx->println("):");
  }

  for (int i = 0; i < scanCount; i++) {
    int y = 128 + i * 16;
    bool ours = (wifiSsid == scanRows[i].ssid);
    gfx->setTextColor(ours ? GREEN : WHITE);
    gfx->setCursor(10, y);
    gfx->print(scanRows[i].ssid);
    gfx->setCursor(158, y);
    gfx->print("c");
    gfx->print(scanRows[i].channel);
    gfx->setCursor(196, y);
    gfx->print(scanRows[i].rssi);
  }

  drawButton(ZONA_REIA, "INCEARCA DIN NOU", NAVY, GOLD, 2);
}

// Cinci cifre, tastate. Pe encoder fiecare cifra se invartea pe loc si
// trebuia confirmata ca sa treci la urmatoarea; aici se tasteaza ca pe
// telefon, "<" sterge ultima si OK intra. Cele neintroduse se arata cu o
// liniuta, nu cu zero: un zero scris acolo s-ar citi ca o cifra data.
void drawPinScreen() {
  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(CYAN);
  gfx->setCursor(10, 34);
  gfx->println("PIN ARBITRU");

  gfx->setTextSize(1);
  gfx->setTextColor(LIGHTGRAY);
  gfx->setCursor(10, 56);
  gfx->print("Server: ");
  gfx->println(serverLabel);

  const int boxW = 38;
  const int boxH = 48;
  const int gap  = 6;
  const int totalW = PIN_DIGITS * boxW + (PIN_DIGITS - 1) * gap;
  int x0 = (SCREEN_W - totalW) / 2;

  for (int i = 0; i < PIN_DIGITS; i++) {
    int x = x0 + i * (boxW + gap);
    bool filled = (i < pinCursor);
    bool here   = (i == pinCursor);

    gfx->fillRect(x, 70, boxW, boxH, here ? BLUE : BLACK);
    gfx->drawRect(x, 70, boxW, boxH, here ? WHITE : DARKGRAY);

    gfx->setTextSize(4);
    gfx->setTextColor(filled ? WHITE : DARKGRAY);
    gfx->setCursor(x + 7, 82);
    gfx->print(filled ? pinDigits[i] : '-');
  }

  for (int i = 0; i < 12; i++) {
    bool isOk  = (i == 11);
    bool isDel = (i == 9);
    // OK se aprinde numai cu PIN-ul complet: un buton care arata gata si
    // raspunde cu o eroare e mai rau decat unul stins.
    uint16_t bg = isOk ? (pinCursor == PIN_DIGITS ? GREEN : DARKGRAY)
                       : (isDel ? NAVY : DARKGRAY);
    uint16_t ink = (isOk && pinCursor == PIN_DIGITS) ? BLACK : WHITE;
    drawButton(PIN_KEYS[i], PIN_LABELS[i], bg, ink, isOk ? 3 : 4);
  }
}

// Conectat, dar masa centrala inca nu a pus pe ecran un sportiv dintr-o
// categorie de-a mea. Nu e o eroare si nu e nimic de apasat - asta e
// starea normala intre doi concurenti.
void drawStandbyScreen() {
  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(CYAN);
  gfx->setCursor(10, 60);
  gfx->println("IN ASTEPTARE");

  gfx->setTextSize(2);
  gfx->setTextColor(WHITE);
  drawWrapped(10, 110, 20, 19, refereeName);

  gfx->setTextSize(1);
  gfx->setTextColor(LIGHTGRAY);
  drawWrapped(10, 180, 14, 37,
              "Astept ca masa centrala sa afiseze un sportiv dintr-o categorie a mea.");

  gfx->setTextColor(DARKGRAY);
  gfx->setCursor(10, 280);
  gfx->print(myCategoryCount);
  gfx->println(" categorii alocate");
  gfx->setCursor(10, 296);
  gfx->println("Bara de sus: predai dispozitivul");
}

void drawScoreScreen() {
  gfx->fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  // Dupa trimitere ramanem pe acelasi ecran cu confirmarea la vedere -
  // altfel arbitrul nu are de unde sti daca a plecat nota.
  if (submittedShown) {
    gfx->setTextSize(2);
    gfx->setTextColor(WHITE);
    drawWrapped(8, 40, 20, 19, liveCompetitorName);

    gfx->setTextSize(4);
    gfx->setTextColor(GREEN);
    gfx->setCursor(30, 110);
    gfx->print("TRIMIS");

    bool cut = revealKnown &&
               ((strcmp(revealMark, "low") == 0) || (strcmp(revealMark, "high") == 0));

    // Nota, la dimensiunea 6: fiecare caracter are 36px latime si 48
    // inaltime. Le calculam ca sa putem trage linia exact peste cifre,
    // oricate ar fi.
    int digits   = (submittedScore >= 100) ? 3 : (submittedScore >= 10 ? 2 : 1);
    int charW    = 36;
    int scoreW   = digits * charW - 6;   // ultima coloana a fontului e spatiu
    int scoreH   = 48;
    int scoreX   = (SCREEN_W - scoreW) / 2;
    int scoreY   = 180;

    gfx->setTextSize(6);
    gfx->setTextColor(WHITE);
    gfx->setCursor(scoreX, scoreY);
    gfx->print(submittedScore);

    // Taiata inseamna taiata: o linie rosie peste nota spune asta dintr-o
    // privire, de la distanta, fara sa fie citita. Groasa de trei pixeli,
    // ca sa se vada peste cifre de 48px.
    if (cut) {
      for (int i = -1; i <= 1; i++) {
        gfx->drawLine(scoreX - 8, scoreY + scoreH + 6 + i,
                      scoreX + scoreW + 8, scoreY - 6 + i, RED);
      }
    }

    // Dupa dezvaluire, arbitrul afla ce s-a ales de nota lui. Cea mai
    // mica si cea mai mare cad din total; e diferenta dintre a fi contat
    // si a nu fi contat, si pana acum nu o afla niciodata.
    if (revealKnown) {
      gfx->setTextSize(2);
      gfx->setTextColor(cut ? RED : GREEN);
      gfx->setCursor(8, 256);
      if (cut) gfx->print(strcmp(revealMark, "low") == 0 ? "cea mai mica" : "cea mai mare");
      else     gfx->print("A CONTAT");

      gfx->setTextSize(1);
      gfx->setTextColor(LIGHTGRAY);
      gfx->setCursor(8, 292);
      gfx->print("Total sportiv: ");
      gfx->print(revealTotal);
      return;
    }

    gfx->setTextSize(1);
    gfx->setTextColor(DARKGRAY);
    gfx->setCursor(8, 292);
    gfx->print("Astept urmatorul sportiv");
    return;
  }

  // Istoricul notelor mele din proba asta, sus, peste tot restul. Un
  // arbitru nu noteaza in gol: se raporteaza la ce a dat inainte in
  // aceeasi categorie, si pana acum trebuia sa tina minte singur.
  gfx->setTextSize(1);
  int historyBottom = 42;
  if (historyCount == 0) {
    gfx->setTextColor(DARKGRAY);
    gfx->setCursor(8, 31);
    gfx->print("Primul notat din aceasta proba");
  } else {
    int x = 8, y = 31;
    for (int i = 0; i < historyCount; i++) {
      int nameW  = strlen(history[i].name) * 6;
      int scoreW = (history[i].score >= 100 ? 3 : 2) * 6;
      int entryW = nameW + 3 + scoreW + 10;

      if (x + entryW > 236) {      // nu mai incape pe randul asta
        x = 8;
        y += 12;
        if (y > 55) break;         // trei randuri sunt destule
      }

      gfx->setTextColor(LIGHTGRAY);
      gfx->setCursor(x, y);
      gfx->print(history[i].name);
      gfx->setTextColor(WHITE);
      gfx->setCursor(x + nameW + 3, y);
      gfx->print(history[i].score);
      x += entryW;
    }
    historyBottom = y + 12;
  }
  gfx->drawFastHLine(0, historyBottom, SCREEN_W, DARKGRAY);

  // Cine e pe saltea - partea care conteaza, cat de mare incape.
  gfx->setTextSize(2);
  gfx->setTextColor(liveIsTeam ? YELLOW : WHITE);
  int afterName = drawWrapped(8, historyBottom + 9, 20, 19, liveCompetitorName);

  if (mySubmittedScore >= 0) {
    gfx->setTextSize(1);
    gfx->setTextColor(GREEN);
    gfx->setCursor(8, afterName + 1);
    gfx->print("Trimis: ");
    gfx->print(mySubmittedScore);
    gfx->print(" - poti corecta");
  }

  gfx->setTextSize(6);
  gfx->setTextColor(draftScore >= 90 ? GREEN : (draftScore >= 70 ? YELLOW : ORANGE));
  gfx->setCursor(draftScore == MAX_SCORE ? 60 : 78, 140);
  gfx->print(draftScore);

  for (int i = 0; i < 4; i++) {
    // Treapta care ar iasa din 0..100 se stinge. Pe encoder nota se oprea
    // singura la capat si nu era nimic de aratat; un buton insa trebuie sa
    // spuna de ce nu face nimic.
    int rezultat = draftScore + SCORE_STEP_DELTA[i];
    bool posibil = (rezultat >= 0 && rezultat <= MAX_SCORE);
    drawButton(SCORE_STEPS[i], SCORE_STEP_LABEL[i],
               posibil ? NAVY : BLACK, posibil ? GOLD : DARKGRAY, 2);
  }

  char trimite[20];
  snprintf(trimite, sizeof(trimite), "TRIMITE %d", draftScore);
  drawButton(SCORE_SEND, trimite, GREEN, BLACK, 2);
}

// Predarea dispozitivului. Pe encoder era o apasare lunga, iar o apasare
// lunga nu se face din greseala. Bara de sus se atinge insa cu cotul, deci
// aici se intreaba - si intrebarea spune pe cine da afara, altfel arbitrul
// care a apasat din reflex nu stie ce pierde.
void drawHandoverScreen() {
  topBarVisible = false;
  gfx->fillScreen(NAVY);

  printCentered("PREDAI DISPOZITIVUL?", 40, 2, GOLD);

  gfx->setTextSize(1);
  gfx->setTextColor(WHITE);
  drawWrapped(12, 78, 14, 37,
              String("Sesiunea lui ") + (refereeName.length() ? refereeName : String("arbitru")) +
              " se inchide, si urmatorul isi formeaza propriul PIN.");

  drawButton(HANDOVER_DA, "DA, PREDAU", RED, WHITE, 2);
  drawButton(HANDOVER_NU, "NU, CONTINUI", DARKGRAY, WHITE, 2);
}

void redraw() {
  switch (screen) {
    case SCREEN_STATUS:     drawStatusScreen();     break;
    case SCREEN_WIFI_DIAG:  drawWifiDiagScreen();   break;
    case SCREEN_PIN:        drawPinScreen();        break;
    case SCREEN_STANDBY:    drawStandbyScreen();    break;
    case SCREEN_SCORE:      drawScoreScreen();      break;
    case SCREEN_HANDOVER:   drawHandoverScreen();   break;
    case SCREEN_MATCH:
      // In timp real ecranul isi arata singur starea, in sfertul
      // apasat - nu-l mai acoperim cu nimic.
      if (liveMatchRealTime)             drawMatchScreen();
      else if (pointState != POINT_NONE) drawPointOverlay();
      else if (needsFinalDecision())     drawDecisionScreen();
      else                               drawMatchScoreScreen();
      break;
  }
}

// ───────────────────────────── FLUX ─────────────────────────────

// Codurile vin din esp_wifi_types.h. Le traducem doar pe cele pe care
// chiar le intalnesti; restul se arata ca numar, tot e mai mult decat
// nimic.
String disconnectReasonText(int reason) {
  switch (reason) {
    case 2:   return "autentificare expirata";
    case 4:   return "asociere expirata";
    case 15:  return "parola gresita (handshake picat)";
    case 201: return "AP-ul nu a fost gasit";
    case 202: return "autentificare respinsa";
    case 203: return "asociere respinsa";
    case 204: return "handshake expirat";
    case 205: return "conexiune pierduta";
    case 0:   return "";
    default:  return String("cod ") + reason;
  }
}

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    lastDisconnectReason = info.wifi_sta_disconnected.reason;
    Serial.printf("WiFi deconectat, motiv %d (%s)\n",
                  lastDisconnectReason,
                  disconnectReasonText(lastDisconnectReason).c_str());
  }
}

// Ce vede placa in jur. Rulata doar cand conectarea a esuat: altfel nu
// merita cele cateva secunde, iar informatia e utila exact atunci.
void scanWifi() {
  scanCount = 0;
  scanFoundOurs = false;
  ourChannel = 0;

  // Opreste incercarea de conectare inainte de scanare, altfel radioul e
  // ocupat cu reconectarile si scanarea se intoarce goala - ceea ce arata
  // exact ca "nu exista nicio retea in jur", desi sunt.
  WiFi.disconnect(false, false);
  delay(200);

  int found = WiFi.scanNetworks(false, true);   // sincron, arata si retelele ascunse
  if (found < 0) {
    Serial.printf("Scanare esuata (cod %d)\n", found);
    return;
  }

  for (int i = 0; i < found; i++) {
    if (WiFi.SSID(i) == wifiSsid) {
      scanFoundOurs = true;
      ourChannel = WiFi.channel(i);
    }
    // Retelele ascunse se scaneaza (al doilea argument de mai sus), dar nu
    // intra in lista: nu au nume, deci nu pot fi alese, iar locurile sunt
    // doar sase. Una ascunsa ar impinge afara una la care chiar te poti
    // conecta.
    if (!WiFi.SSID(i).length()) continue;

    if (scanCount < MAX_SCAN) {
      strlcpy(scanRows[scanCount].ssid, WiFi.SSID(i).c_str(), sizeof(scanRows[scanCount].ssid));
      scanRows[scanCount].rssi = WiFi.RSSI(i);
      scanRows[scanCount].channel = WiFi.channel(i);
      scanCount++;
    }
  }
  WiFi.scanDelete();
}

// O incercare de conectare. `reducedPower` taie puterea de emisie: pe
// placile SuperMini regulatorul de pe placa nu tine varful de curent de
// la emisie, iar cipul se reseteaza sau pierde handshake-ul exact atunci.
// Sunt mai putini metri, dar o conexiune care exista bate una teoretica.
bool attemptConnect(bool reducedPower, unsigned long timeoutMs) {
  lastDisconnectReason = 0;

  WiFi.mode(WIFI_STA);
  // (false, true): radioul RAMANE pornit, se sterge doar reteaua tinuta
  // minte. Cu argumentele invers - usor de gresit, prima e `wifioff` -
  // placa isi stinge singura radioul si apoi "nu vede nicio retea".
  WiFi.disconnect(false, true);
  delay(100);

  // Canalele 12 si 13 sunt legale in Romania, dar ESP32 porneste cu o
  // regiune care le exclude si atunci reteaua nici nu apare la scanare.
  esp_wifi_set_country_code("RO", true);
  WiFi.setSleep(false);
  // Core-ul refuza din start orice sub WPA2; routerele in mod mixt
  // "WPA/WPA2" pica atunci fara sa spuna de ce.
  WiFi.setMinSecurity(WIFI_AUTH_WPA_PSK);

  // Latime de banda 20MHz si ratele lente din 802.11b activate: ambele
  // fac legatura mai rezistenta la distanta, cu pretul vitezei maxime -
  // care aici nu conteaza, cererile sunt de cateva sute de octeti.
  esp_wifi_set_bandwidth(WIFI_IF_STA, WIFI_BW_HT20);
  esp_wifi_set_protocol(WIFI_IF_STA,
                        WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);

  if (reducedPower) WiFi.setTxPower(WIFI_POWER_8_5dBm);

  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - started) < timeoutMs) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool connectWifi() {
  WiFi.onEvent(onWifiEvent);

  drawSplash(20, (String("Conectare la ") + wifiSsid).c_str());
  if (attemptConnect(false, 15000)) return true;

  // A doua incercare cu emisie redusa: daca asta trece iar prima nu,
  // problema e alimentarea placii, nu reteaua.
  drawSplash(35, "Reincerc, emisie redusa...");
  if (attemptConnect(true, 15000)) {
    Serial.println("Conectat abia cu putere redusa - verifica alimentarea placii.");
    return true;
  }

  // A esuat de doua ori: nu spune doar "fara WiFi", arata de ce.
  wl_status_t st = WiFi.status();
  drawSplash(35, "Caut retelele din jur...");
  scanWifi();

  // Motivul de la radio bate orice deductie de-a noastra, cand exista.
  String reason = disconnectReasonText(lastDisconnectReason);
  if (scanCount == 0) {
    // Intr-un bloc de locuinte sunt mereu retele. Zero inseamna ca
    // radioul nu aude nimic - antena, alimentare, sau placa.
    statusDetail = "Radioul nu aude nimic. Antena/alimentare?";
  } else if (reason.length()) {
    statusDetail = reason;
  } else if (!scanFoundOurs) {
    statusDetail = wifiSsid + " nu se vede. C3 prinde doar 2.4GHz.";
  } else if (st == WL_CONNECT_FAILED) {
    statusDetail = "Reteaua m-a refuzat - verifica parola.";
  } else {
    statusDetail = String("Se vede pe canal ") + ourChannel + " dar nu ma primeste.";
  }

  statusTitle = "FARA WIFI";
  statusIsError = true;
  screen = SCREEN_WIFI_DIAG;
  redraw();
  return false;
}

// Reia introducerea de la zero. Si la pornire, si dupa un PIN respins:
// niciun caz in care cifrele vechi raman pe ecran.
void askForPin() {
  // Gol, nu "00000". Pe encoder fiecare cifra se invartea pornind de la zero,
  // deci zeroul era punctul de plecare; pe tastatura e o cifra ca oricare
  // alta, si un ecran plin de zerouri s-ar citi ca un PIN deja tastat.
  pinDigits[0] = '\0';
  pinCursor = 0;

  // Tot ce tine de arbitrul anterior pleaca odata cu el. Altfel bara de
  // sus ramane cu numele si cu terenul cuiva care tocmai a predat
  // dispozitivul - iar urmatorul crede ca e deja conectat.
  accessToken = "";
  refereeName = "";
  refereeShort = "";
  myAthleteId = 0;
  myCategoryCount = 0;
  activeEventId = 0;

  liveCategoryId = 0;
  liveAthleteId = 0;
  liveAthleteScoreId = 0;
  liveCategoryName[0] = '\0';
  liveCompetitorName[0] = '\0';
  liveFieldName[0] = '\0';
  liveRefPosition[0] = '\0';
  liveIsTeam = false;
  liveRevealed = false;
  revealKnown = false;
  revealMark[0] = '\0';
  mySubmittedScore = -1;
  historyCount = 0;
  submittedShown = false;

  screen = SCREEN_PIN;
  redraw();
}

// Pornire: WiFi, serverul, apoi ecranul de PIN. Nu se stie inca cine e
// arbitrul - exact asta e ideea, dispozitivul nu e al nimanui pana nu
// formeaza cineva PIN-ul lui.
void startSession() {
  if (!connectWifi()) return;

  drawSplash(65, "Caut serverul din sala...");
  if (!locateServer()) {
    setStatus(
      "FARA SERVER",
      String("Nu raspunde ") + serverLabel + ". Verifica IP-ul din launcher.",
      true
    );
    return;
  }

  drawSplash(100, "Gata");
  delay(400);
  askForPin();
}

// Dupa ce PIN-ul a fost acceptat: aflam la ce categorii sunt alocat si
// trecem in asteptare. Nu se alege nimic - masa centrala decide.
void loadAfterLogin() {
  setStatus("SE INCARCA", "Categoriile alocate...", false);
  if (!apiLoadCategories()) { setStatus("EROARE", statusDetail, true); return; }
  lastAssignmentsLoad = millis();

  liveCategoryId = 0;
  liveAthleteId = 0;
  lastPoll = 0;          // prima verificare imediat, nu peste POLL_MS
  screen = SCREEN_STANDBY;
  redraw();
}

void submitPin() {
  setStatus("SE VERIFICA", "PIN-ul...", false);
  if (!apiLoginWithPin(pinDigits)) {
    setStatus("PIN RESPINS", statusDetail, true);
    return;
  }
  loadAfterLogin();
}

void submitCurrentScore() {
  int code = apiSubmitScore(draftScore);

  if (code == 200 || code == 201) {
    mySubmittedScore = draftScore;
    submittedScore = draftScore;
    submittedShown = true;
    redraw();
    // Nota tocmai trimisa intra si ea in istoric, pentru urmatorul.
    apiLoadMyScores(liveCategoryId, liveAthleteId);
    return;
  }

  String detail;
  if (code == 403)      detail = "Nu esti arbitru alocat acestei categorii.";
  else if (code == 401) detail = "Sesiune expirata - formeaza PIN-ul din nou.";
  else if (code < 0)    detail = String("Serverul din sala: ") + httpErrorText(code) + ".";
  else                  detail = String("Serverul a raspuns cu ") + code + ".";

  setStatus("NETRIMIS", detail, true);
  if (code == 401) accessToken = "";
}


// ───────────────────────────── ATINGERI ─────────────────────────────
//
// Dispecerizarea apasarilor, un ecran pe functie. Pe placa cu encoder toata
// treaba asta era un switch de douazeci de linii in loop(), fiindca existau
// doua intentii - scurt si lung - si nimic mai mult. Pe touch fiecare ecran
// are propriile zone, deci are si propria functie.

void handlePinTouch(const TouchEvent& e) {
  int k = zoneIndex(PIN_KEYS, 12, e.x, e.y);
  if (k < 0) return;

  if (k == 9) {                       // sterge ultima cifra
    if (pinCursor > 0) {
      pinCursor--;
      pinDigits[pinCursor] = '\0';
      redraw();
    }
    return;
  }

  if (k == 11) {                      // intra
    // Numai cu PIN-ul complet. Butonul e si desenat stins pana atunci, deci
    // aici nu se refuza nimic ce ar fi parut posibil.
    if (pinCursor == PIN_DIGITS) submitPin();
    return;
  }

  if (pinCursor >= PIN_DIGITS) return;
  pinDigits[pinCursor++] = (k == 10) ? '0' : (char)('1' + k);
  pinDigits[pinCursor] = '\0';
  redraw();
}

void handleScoreTouch(const TouchEvent& e) {
  // Cat timp confirmarea e pe ecran, nimic nu mai raspunde: nota e data.
  // Se deblocheaza singur cand masa centrala aduce urmatorul sportiv.
  if (submittedShown) return;

  int s = zoneIndex(SCORE_STEPS, 4, e.x, e.y);
  if (s >= 0) {
    // Nu se taie la capat, se refuza. Pe encoder nota se oprea la 100 si
    // continuai sa invarti degeaba; aici treapta care ar iesi din interval e
    // deja desenata stinsa, deci refuzul se potriveste cu ce se vede.
    int rezultat = draftScore + SCORE_STEP_DELTA[s];
    if (rezultat < 0 || rezultat > MAX_SCORE) return;
    draftScore = rezultat;
    redraw();
    return;
  }

  if (zoneHit(SCORE_SEND, e.x, e.y)) submitCurrentScore();
}

void handleMatchTouch(const TouchEvent& e) {
  // Meciul s-a terminat: sferturile nu mai dau puncte, aleg castigatorul.
  // Prima apasare armeaza culoarea, a doua o trimite. O apasare singura nu
  // decide nimic - decizia e ireversibila de pe placa, iar serverul o mai
  // accepta doar daca o sterge masa centrala.
  if (needsFinalDecision()) {
    if (finalDecided) return;

    int d = zoneIndex(DECISION_BTN, 2, e.x, e.y);
    if (d < 0) return;

    // Butonul din stanga e culoarea sfertului din stanga, ca pe ecran. Asa un
    // arbitru care a mutat rosul in dreapta prin BTN= il gaseste in dreapta
    // si cand decide.
    bool leftRed  = pointButtons[0].isRed;
    bool wantRed  = (d == 0) ? leftRed : !leftRed;

    if (decisionArmed && decisionArmedRed == wantRed) {
      decisionArmed = false;
      if (!apiSubmitDecision(wantRed)) {
        pointSideRed = wantRed;
        pointValue   = 0;
        pointState   = POINT_FAILED;
        pointShownAt = millis();
      }
    } else {
      // Fie e prima apasare, fie te-ai razgandit: cealalta culoare
      // schimba alegerea in loc s-o confirme pe cea veche.
      decisionArmed    = true;
      decisionArmedRed = wantRed;
      decisionArmedAt  = millis();
      lastDecisionTick = millis();
    }
    redraw();
    return;
  }

  // Cat timp ecranul de punct acopera totul, nicio atingere nu puncteaza.
  //
  // Pe placa cu butoane nu se punea problema: butonul era in afara ecranului
  // si ramanea acolo orice s-ar fi afisat. Aici butonul ESTE ecranul, iar
  // ecranul arata acum de ce punctul anterior n-a plecat - deci o apasare ar
  // nimeri un buton pe care nimeni nu-l vede. La afisare finala asta apare
  // doar in starile de eroare, exact cand nu vrei un punct dat pe nevazute.
  //
  // In timp real e invers: sferturile raman la vedere si isi arata singure
  // starea in culoare, deci trebuie sa raspunda in continuare.
  if (!liveMatchRealTime && pointState != POINT_NONE) return;

  // Care sfert a fost apasat. In timp real sferturile sunt tot ecranul; la
  // afisare finala sunt butoanele de sub jumatati, fiindca acolo numerele
  // trebuie sa ramana vizibile. Indexul e acelasi in ambele cazuri, deci
  // rolul si garda nu se schimba de la un mod la altul.
  int index = liveMatchRealTime ? zoneIndex(QUADRANTS, 4, e.x, e.y)
                                : zoneIndex(HALF_BTN, 4, e.x, e.y);
  if (index < 0) return;

  // Apasare in pauza sau intre reprize. Regula e a competitiei, nu a
  // noastra - dar arbitrul trebuie sa afle ca punctul n-a plecat, nu
  // sa presupuna ca a intrat.
  if (!canScoreNow()) {
    pointSideRed = pointButtons[index].isRed;
    pointValue   = pointButtons[index].points;
    pointState   = POINT_CLOSED;
    pointShownAt = millis();
    redraw();
    return;
  }

  // Garda de dubla apasare. Respingerea se arata din loop(), ca pe placa
  // veche: acolo venea din intrerupere si nu avea unde altundeva.
  if (!acceptaApasare(index)) return;

  if (liveMatchRealTime) sendPoint(pointButtons[index].isRed, pointButtons[index].points);
  else                   addRoundPoint(pointButtons[index].isRed, pointButtons[index].points);
}

void handleTouch(const TouchEvent& e) {
  // In proba, nicio atingere nu face nimic in afara de a se raporta pe cablu.
  // Asa se verifica, inainte de competitie, daca panoul e montat pe aceleasi
  // axe ca ecranul - coordonata bruta si cea dusa in ecran, una langa alta.
  if (modTest) {
    int sfert = zoneIndex(QUADRANTS, 4, e.x, e.y);

    // Doua linii pe aceeasi apasare, pentru doi cititori diferiti.
    //
    // ATINGERE e cea noua si singura care conteaza aici: coordonata bruta a
    // panoului langa cea dusa in ecran. Daca panoul e montat pe alte axe, doar
    // perechea asta o arata - pe ecran totul pare in regula, doar punctul
    // pleaca culorii gresite.
    Serial.printf("ATINGERE\t%u\t%u\t%d\t%d\t%s\n",
                  e.rawX, e.rawY, e.x, e.y,
                  sfert >= 0 ? rolButoane[sfert] : "-");

    // BUTON e cea veche, pe care launcherul o asteapta deja ca sa aprinda
    // punctul fiecarui sfert (vezi DeviceWifiPage.jsx). O trimitem ca pagina
    // de proba sa functioneze nemodificata: sfertul de ecran raspunde la
    // aceeasi intrebare la care raspundea butonul lipit - "a reactionat?".
    if (sfert >= 0) Serial.printf("BUTON\t%d\t%s\n", sfert + 1, rolButoane[sfert]);
    return;
  }

  // Bara de sus preda dispozitivul, dar numai de pe ecranele in care exista o
  // sesiune de predat. Nu cand o decizie asteapta confirmarea: acolo ecranul e
  // plin si bara nici nu se vede, deci o apasare sus e un ghicit, nu o
  // intentie.
  if (zoneHit(ZONA_BARA_SUS, e.x, e.y) && !decisionArmed &&
      (screen == SCREEN_STANDBY || screen == SCREEN_SCORE || screen == SCREEN_MATCH)) {
    screenBeforeHandover = screen;
    screen = SCREEN_HANDOVER;
    redraw();
    return;
  }

  switch (screen) {
    case SCREEN_STATUS:
      // Ca pe placa veche: daca WiFi-ul e in regula ne intoarce la PIN, daca
      // nu, incearca din nou conexiunea.
      if (statusIsError && zoneHit(ZONA_REIA, e.x, e.y)) {
        if (WiFi.status() == WL_CONNECTED) askForPin();
        else startSession();
      }
      break;

    case SCREEN_WIFI_DIAG:
      if (zoneHit(ZONA_REIA, e.x, e.y)) startSession();
      break;

    case SCREEN_HANDOVER:
      if (zoneHit(HANDOVER_DA, e.x, e.y)) {
        askForPin();
      } else if (zoneHit(HANDOVER_NU, e.x, e.y)) {
        screen = screenBeforeHandover;
        redraw();
      }
      break;

    case SCREEN_PIN:     handlePinTouch(e);   break;
    case SCREEN_SCORE:   handleScoreTouch(e); break;
    case SCREEN_MATCH:   handleMatchTouch(e); break;

    // Nimic de apasat: asta e starea normala intre doi concurenti.
    case SCREEN_STANDBY: break;
  }
}

// ───────────────────────────── ARDUINO ─────────────────────────────

void setup() {
  Serial.begin(115200);
  // Pe USB CDC, scrierea asteapta pana la 100ms cand gazda e
  // conectata dar nu citeste - adica ori de cate ori placa e in
  // priza calculatorului fara monitor deschis. Cum logam la
  // fiecare cerere, asta punea sute de milisecunde exact in
  // drumul notei arbitrului. 0 = nu astepta; ce nu incape se
  // pierde, si logul merita mai putin decat raspunsul pe ecran.
  Serial.setTxTimeoutMs(0);

  // Lumina de fundal stinsa pana avem ce arata. Controlerul porneste cu ce
  // i-a ramas in memorie, si fara asta la fiecare alimentare se vede o
  // jumatate de secunda de zgomot colorat inainte de sigla.
  alimentareInit();

  pinMode(TFT_BL, OUTPUT);
  incarcaPolaritateLumina();
  aprindeLumina(false);

  // Raportam ce a raspuns controlerul - dar cu masura: ST7789 se comanda fara
  // citire, deci "reusita" inseamna doar ca magistrala SPI a pornit si
  // comenzile au plecat. NU dovedeste ca panoul le-a primit. Un ecran negru cu
  // "reusita" pe serial e perfect posibil, si atunci vina e la alimentare sau
  // la lumina de fundal, nu la SPI.
  bool spiPornit = gfx->begin();
  Serial.printf("ST7789: magistrala SPI %s (%dx%d, lumina GPIO%d pe %s)\n",
                spiPornit ? "pornita" : "NEPORNITA",
                SCREEN_W, SCREEN_H, TFT_BL, blAprinsPeHigh ? "HIGH" : "LOW");
  if (!spiPornit) Serial.println("Verifica pinii de SPI. Scrie ECRAN ca sa probezi lumina.");

  gfx->fillScreen(NAVY);
  aprindeLumina(true);

  drawSplash(5, "Pornire...");

  // Inainte de orice incercare de conectare: daca a fost configurata prin
  // cablu, reteaua din memorie e cea buna, nu cea din cod.
  incarcaWifiSalvat();
  incarcaRoluri();

  // Panoul intai, taskul care il citeste dupa. In ordinea asta pornirea
  // atinge I2C de pe nucleul principal, si cat timp taskul nu exista nu e
  // nimeni care sa i-o ia din mana - deci nu e nevoie de nicio sincronizare
  // pe magistrala, nici acum nici mai tarziu.
  touchQueue = xQueueCreate(8, sizeof(TouchEvent));

  // Panoul tactil, prin driverul producatorului. El stie pinii placii si isi
  // verifica singur cipul prin suma de control; daca aia nu iese, nu are rost
  // sa-l mai intrebam de coordonate.
  bool panou = Touch_Init();
  Serial.printf("CST328: %s\n", panou ? "pornit" : "NU RASPUNDE");

  if (!panou) {
    // Fara panou aparatul nu are nicio intrare: nu se poate forma PIN-ul,
    // deci nu se poate face nimic. O spunem pe ecran si continuam oricum -
    // restul pornirii arata daca WiFi-ul si serverul sunt in regula, si
    // atunci se stie ca singura piesa de vina e panoul.
    drawSplash(5, "PANOUL TACTIL NU RASPUNDE");
    delay(3000);
  } else {
    // Prioritate 2: peste firul de repaus, mult sub WiFi. Panoul nu are
    // nevoie de mai mult - e o citire de 27 de octeti la 15ms - si daca ar
    // avea mai mult ar intarzia exact radioul pe care pleaca nota.
    xTaskCreatePinnedToCore(touchTask, "touch", 3072, nullptr, 2, nullptr, 0);
  }

  startSession();
}

void loop() {
  // Si cand device-ul nu prinde reteaua: tocmai atunci e nevoie sa i-o poti
  // schimba prin cablu, nu doar cand merge totul.
  citesteComenziSerial();

  if (modTest && millis() > modTestPanaLa) {
    modTest = false;
    Serial.println("OK TEST s-a incheiat (3 minute).");
  }

  // Atingerile, inaintea oricarei cereri. Nu se pierd cat tine una - taskul
  // de pe celalalt nucleu le-a pus in coada - dar se consuma aici, ca sa nu
  // plece o cerere de doua secunde peste o apasare care deja asteapta.
  TouchEvent atingere;
  while (takeTouch(&atingere)) handleTouch(atingere);

  // Apasarea oprita de garda: aratam explicit ca n-a plecat. Tacerea ar
  // fi cea mai proasta varianta - arbitrul ar crede ca a dat doua puncte.
  if (pressTooFast) {
    pressTooFast = false;
    if (screen == SCREEN_MATCH && canScoreNow()) {
      pointState   = POINT_TOO_FAST;
      pointShownAt = millis();
      redraw();
    }
  }

  // Starea WiFi din bara de sus, o data pe secunda, fara sa redesenam tot
  // ecranul sub degetul arbitrului. Doar pe ecranele care au bara: pe cele
  // pline ar fi o dunga gri peste ceva ce ocupa tot ecranul.
  if (topBarVisible && millis() - lastTopBarDraw >= 1000) {
    lastTopBarDraw = millis();
    drawTopBar();
  }

  // Cat suntem in sesiune, urmarim masa centrala. Si pe ecranul de nota:
  // daca a trecut la alt sportiv, dispozitivul trebuie sa il urmeze, nu
  // sa ramana cu cine tocmai a iesit de pe saltea.
  //
  // Ecranul de predare nu intra in lista: cat timp cineva se uita la
  // intrebare, nu are rost sa i se schimbe ecranul de sub ea.
  if ((screen == SCREEN_STANDBY || screen == SCREEN_SCORE || screen == SCREEN_MATCH) &&
      (millis() - lastPoll >= POLL_MS) && !userIsBusy()) {
    lastPoll = millis();

    // Cat stam in asteptare, recitim din cand in cand ce ni s-a dat. Doar
    // atunci: pe ecranul de nota sau in meci device-ul are treaba, iar lista
    // nu se schimba sub ea.
    if (screen == SCREEN_STANDBY &&
        (millis() - lastAssignmentsLoad >= ASSIGNMENTS_REFRESH_MS)) {
      lastAssignmentsLoad = millis();
      apiLoadCategories();
    }

    bool changed = pollMonitor();

    // Repriza se schimba des si independent de cine e pe saltea, deci o
    // cerem la fiecare tura cat suntem pe un meci.
    if (liveMatchId) {
      int wasRound = activeRoundId;
      bool wasPaused = activeRoundPaused;
      bool wasAllDone = allRoundsDone;
      apiLoadActiveRound(liveMatchId);

      // Meciul tocmai s-a incheiat: aducem notele mele si decizia, daca
      // am dat-o deja de pe telefon sau de pe alta placa.
      if (needsFinalDecision() && (!wasAllDone || !totalsKnown)) {
        apiLoadMyTotals(liveMatchId);
        changed = true;
      }
      if (!allRoundsDone && wasAllDone) changed = true;
      if (activeRoundId != wasRound) {
        // Punctele apartin reprizei in care au fost date. Lasate pe ecran
        // peste repriza urmatoare, ar fi citite gresit.
        recentCount = 0;
        pointEventId = 0;
        if (!liveMatchRealTime) apiLoadMyRoundScore(liveMatchId, activeRoundId);
        changed = true;
      }
      if (activeRoundPaused != wasPaused) changed = true;
    }

    pollPointValidation();

    if (liveRevealed && !revealKnown && liveCategoryId) {
      apiLoadReveal(liveCategoryId);
      if (revealKnown) changed = true;
    }

    // Meciul are prioritate: daca masa centrala a pus un meci pe
    // teren, dispozitivul trece pe sferturi, oricat de recenta ar fi
    // proba tehnica dinainte.
    Screen want;
    if (liveMatchId)                                                     want = SCREEN_MATCH;
    else if (liveCategoryId && (liveAthleteId || liveCompetitorName[0])) want = SCREEN_SCORE;
    else                                                                 want = SCREEN_STANDBY;
    if (want != screen) {
      screen = want;
      redraw();
    } else if (changed) {
      redraw();
    }
  }

  // Prezenta, separat de interogare: un arbitru conectat trebuie sa apara
  // verde in admin si cat asteapta, nu doar cat e cineva pe saltea. Fara
  // asta ramanea rosu pana intra primul concurent, adica exact cand
  // operatorul verifica daca toata lumea e pe pozitie.
  if (screen == SCREEN_STANDBY || screen == SCREEN_SCORE || screen == SCREEN_MATCH ||
      screen == SCREEN_HANDOVER) {
    if (millis() - lastPresence >= PRESENCE_MS) {
      lastPresence = millis();
      if (liveMatchId) {
        // Pe meci raportam pe meci, altfel adminul nu ne vede deloc.
        apiPingPresenceForMatch(liveMatchId);
        // Si pe categorie, pentru ecranele care inca intreaba asa.
        if (liveMatchCategoryId) apiPingPresence(liveMatchCategoryId);
      } else if (liveCategoryId) {
        apiPingPresence(liveCategoryId);
      } else {
        int upTo = myCategoryCount < PRESENCE_MAX_CATEGORIES ? myCategoryCount : PRESENCE_MAX_CATEGORIES;
        for (int i = 0; i < upTo; i++) apiPingPresence(myCategoryIds[i]);
      }
    }
  }

  // Confirmarea nu ramane armata la nesfarsit, si cat e armata numaram
  // invers pe ecran - altfel arbitrul n-ar sti cat mai are.
  if (decisionArmed) {
    if (millis() - decisionArmedAt >= DECISION_ARM_MS) {
      decisionArmed = false;
      if (screen == SCREEN_MATCH) redraw();
    } else if (millis() - lastDecisionTick >= 1000) {
      lastDecisionTick = millis();
      if (screen == SCREEN_MATCH && pointState == POINT_NONE) redraw();
    }
  }

  // Ecranul de punct nu ramane la nesfarsit: confirmarea se vede scurt,
  // asteptarea mai mult. Daca ceilalti arbitri n-au apasat in secunda si
  // jumatate, punctul nu se mai valideaza si arbitrul trebuie sa vada din
  // nou meciul, nu un ecran inghetat.
  if (pointState != POINT_NONE && pointState != POINT_SENDING) {
    unsigned long hold = POINT_PENDING_MS;
    if (pointState == POINT_VALIDATED) hold = POINT_OK_MS;
    if (pointState == POINT_TOO_FAST)  hold = POINT_FAST_MS;
    if (pointState == POINT_CLOSED)    hold = POINT_FAST_MS;
    if (millis() - pointShownAt >= hold) {
      pointState = POINT_NONE;
      if (screen == SCREEN_MATCH) redraw();
    }
  }
}
