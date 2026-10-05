// Arbitru FRVV pe Waveshare ESP32-S3-Touch-LCD-2.8B.
//
// Acelasi dispozitiv ca variantele dinainte (devices/referee-esp32c3 cu
// encoder, devices/referee-esp32s3-touch pentru placa 2.8 cu ST7789), pe o
// placa cu ecran mult mai mare: ST7701 pe interfata RGB paralela, 480x640,
// cu panou tactil GT911.
//
// Doua lucruri de stiut despre cum e construit, fiindca niciunul nu e evident:
//
// 1. ECRANUL NU E CONDUS DE ARDUINO_GFX. Fisierele Display_ST7701, TCA9554PWR,
//    I2C_Driver si Touch_GT911 de langa sketch sunt driverul producatorului,
//    luat ca atare din arhiva lui oficiala. Varianta prin Arduino_GFX a ramas
//    neagra oricat am reglat timpi si secvente de initializare, iar firmware-ul
//    precompilat al producatorului afisa pe aceeasi placa - deci placa era buna
//    si drumul era gresit. Pe hardware necunoscut, "merge cu ce livreaza
//    producatorul?" e intrebarea zero, nu ultima.
//
// 2. DESENUL ESTE Arduino_GFX, SCRIIND DIRECT IN MEMORIA PANOULUI. Driverul
//    producatorului stie sa porneasca panoul dar nu stie sa deseneze: n-are
//    text, n-are forme. Arduino_GFX stie. Se leaga prin ecran.h, fara nicio
//    copiere intre ele - altfel fiecare desen ar insemna un memcpy de 600KB.
//
// 3. REGLAJELE PANOULUI SE SCHIMBA PRIN CABLU, NU PRIN REPROGRAMARE. Vezi
//    reglaje.h: pixel clock, marginile stinse si bounce buffer-ul stau in
//    memoria device-ului, iar ecranul raporteaza singur cati Hz face. Exista
//    fiindca imaginea tremura cand radioul e pornit, si combinatia care scapa
//    de tremurat nu se poate deduce - trebuie masurata. Acolo e si ce am
//    gasit despre cauza: un bug de paritate in driverul RGB al nucleului
//    Arduino, care se declanseaza doar cu bounce buffers pornite.
//
//    Interfata NU foloseste LVGL. A existat o varianta cu LVGL; n-a schimbat
//    nimic la tremurat, fiindca si ea isi tine tampoanele in aceeasi PSRAM,
//    si a adus un strat in plus de depanat degeaba.
//
// Interfata ramane scrisa in unitatile placii vechi, 240x320, si se scaleaza
// cu doi la desen (vezi `ui` mai jos). Nu e lene: tine macheta intr-un singur
// sistem de coordonate, cu un singur numar de schimbat. Alternativa - inmultit
// cu doi opt sute de literali - ar fi fost opt sute de ocazii de greseala.
//
// Ecranul mai mare nu e doar estetica: la 480x640 un sfert de ecran are
// 240x266 pixeli, adica o tinta care se nimereste fara sa te uiti. La lupte,
// cu ochii pe saltea, aia e singura masura care conteaza.
//
// Biblioteci: GFX Library for Arduino (Arduino_GFX), ArduinoJson v7.
//
// Placa: "ESP32S3 Dev Module", cu:
//   PSRAM: OPI PSRAM              (obligatoriu - memoria de ecran are 600KB)
//   Flash Size: 16MB (128Mb)
//   Partition Scheme: 16M Flash (3MB APP/9.9MB FATFS)
//   USB CDC On Boot: Enabled      (altfel Serial nu e USB-ul si nu compileaza)

#include <WiFi.h>
#include <esp_wifi.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "ecran.h"
#include "reglaje.h"
#include "Touch_GT911.h"
#include "frvv_logo.h"
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
// Pinii nu apar aici fiindca nu sunt ai nostri: ecranul, panoul tactil,
// expanderul si lumina de fundal sunt toate in driverul producatorului, de
// langa sketch. Noi ii cerem sa porneasca si desenam peste.

// Interfata, in unitatile in care e scrisa macheta.
#define SCREEN_W UI_LAT     // 240
#define SCREEN_H UI_INAL    // 320

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

// O zona atinsa pe ecran, in unitati de interfata.
//
// Desenul si verificarea atingerii folosesc aceleasi numere, din acelasi
// tabel. Nu e eleganta, e singura aparare impotriva singurei greseli pe care
// un ecran tactil o face si un buton nu: sa arate butonul intr-un loc si sa
// raspunda in altul.
struct TouchZone { int16_t x, y, w, h; };

// O atingere, asa cum ajunge in bucla principala. Coordonatele brute merg cu
// ea ca sa poata fi raportate in proba de ecran.
struct TouchEvent {
  int16_t  x, y;
  uint16_t rawX, rawY;
};

// Stratul care scaleaza.
//
// Tot desenul trece pe aici: primeste coordonate in unitati de interfata si le
// inmulteste cu SCARA. Metodele care nu au coordonate - culoare, text - trec
// neatinse, si exista doar ca sa nu fie nevoie sa amesteci `ui.` cu `gfx->`
// prin acelasi bloc de desen.
struct Unitati {
  // Fiecare metoda verifica intai ca ecranul exista.
  //
  // Nu e paranoia, e lectie platita: cand panoul nu porneste - placa pornita
  // in mod gresit de PSRAM, de exemplu - `gfx` ramane null, si primul desen
  // transforma un avertisment citibil pe serial intr-o bucla de panica.
  // Mesajul care spune de ce s-a intamplat trece atunci prea repede ca sa fie
  // citit, si se pare ca placa e moarta cand de fapt doar n-are memorie.
  //
  // Garda sta aici, nu in functiile de desen, fiindca aici trece tot desenul
  // din firmware. Pusa in redraw() si drawTopBar() acoperea doar doua drumuri
  // din multe - si exact unul dintre cele neacoperite a crapat.
  void fillScreen(uint16_t c) { if (!gfx) return; gfx->fillScreen(c); }

  void fillRect(int x, int y, int w, int h, uint16_t c) {
    if (!gfx) return;
    gfx->fillRect(x * SCARA, y * SCARA, w * SCARA, h * SCARA, c);
  }
  void drawRect(int x, int y, int w, int h, uint16_t c) {
    if (!gfx) return;
    gfx->drawRect(x * SCARA, y * SCARA, w * SCARA, h * SCARA, c);
  }
  void drawFastHLine(int x, int y, int w, uint16_t c) {
    if (!gfx) return;
    gfx->drawFastHLine(x * SCARA, y * SCARA, w * SCARA, c);
  }
  void drawFastVLine(int x, int y, int h, uint16_t c) {
    if (!gfx) return;
    gfx->drawFastVLine(x * SCARA, y * SCARA, h * SCARA, c);
  }
  void drawLine(int x0, int y0, int x1, int y1, uint16_t c) {
    if (!gfx) return;
    gfx->drawLine(x0 * SCARA, y0 * SCARA, x1 * SCARA, y1 * SCARA, c);
  }

  void setCursor(int x, int y)   { if (!gfx) return; gfx->setCursor(x * SCARA, y * SCARA); }
  void setTextSize(int s)        { if (!gfx) return; gfx->setTextSize(s * SCARA); }
  void setTextColor(uint16_t c)  { if (!gfx) return; gfx->setTextColor(c); }

  template <typename T> void print(T v)   { if (!gfx) return; gfx->print(v); }
  template <typename T> void println(T v) { if (!gfx) return; gfx->println(v); }
};

Unitati ui;

// Sigla se deseneaza in sectiunea DESEN, nu aici. Aici e doar declaratia.
//
// Arduino aseaza prototipurile pe care le genereaza singur chiar inaintea
// PRIMEI definitii de functie din fisier. O functie definita in sectiunea asta
// ar muta punctul ala inaintea enumerarilor de mai jos, si fisierul s-ar opri
// cu "'PointState' has not been declared" - o eroare care pare de tip, dar e
// doar o ordine gresita. Aici se declara, nu se executa.
void deseneazaSigla(int x, int y);
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
  POINT_PENDING,     // serverul l-a primit, asteapta al doilea arbitru
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
char liveFieldName[26]   = "";   // "T" + cifrele din fieldFull[24]
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
// Definite mai jos, langa lucrurile de care tin.

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
//   LUMINA=0..100 ........ cat de tare lumineaza ecranul
//   TOUCH? / TOUCH=nyn ... cum se duce atingerea panoului in ecran
//   BTN?   / BTN=r2,r1,a2,a1 ... ce punct da fiecare sfert de ecran
//   TEST   / TEST! ....... proba ecranului, pornita si oprita
//
// Numele si parola sunt despartite de TAB, nu de spatiu sau virgula:
// amandoua apar in parole adevarate, TAB-ul nu.
const char* PREFS_NAMESPACE = "frvv";

// ─────────────────────── DECLARATII DE FUNCTII ───────────────────────
//
// Lista asta exista ca sursa sa poata fi compilata si fara Arduino IDE.
//
// Arduino genereaza singur prototipurile si le insereaza exact aici, inaintea
// primei definitii de functie - de-aia un sketch poate chema o functie scrisa
// mai jos in fisier. ESP-IDF compileaza C++ obisnuit si nu face asta, deci
// fara declaratiile de mai jos jumatate din apeluri n-ar gasi ce cheama.
//
// Sunt chiar cele generate de Arduino, extrase din build-ul lui, nu scrise de
// mana. Pentru build-ul din Arduino IDE sunt redundante - acolo ajung
// declarate de doua ori, ceea ce in C++ e permis si nu costa nimic. Pentru
// ESP-IDF sunt obligatorii.
//
// Locul lor nu e la intamplare: deasupra sunt tipurile pe care le folosesc in
// semnaturi (TouchEvent, TouchZone, Timpi, PointState). Mutate mai sus, n-ar
// compila. Daca adaugi o functie noua chemata inainte de definitia ei,
// adauga-i si declaratia aici.

String disconnectReasonText(int reason);
String httpErrorText(int code);
bool acceptaApasare(int index);
bool anyPendingRecent();
bool apiLoadCategories();
bool apiLoadMyMatches();
bool apiLoginWithPin(const char* pin);
bool apiSaveRoundScore();
bool apiSubmitDecision(bool redWins);
bool attemptConnect(bool reducedPower, unsigned long timeoutMs);
bool canScoreNow();
bool connectWifi();
bool isMyCategory(int categoryId);
bool isMyMatch(int matchId);
bool locateServer();
bool needsFinalDecision();
bool pollMonitor();
bool serverAnswers();
bool takeTouch(TouchEvent* e);
bool userIsBusy();
bool zoneHit(const TouchZone& z, int x, int y);
const char * myPositionIn(int categoryId);
const char * myPositionInMatch(int matchId);
int apiRequest(const char* method, const String& path, const String& body, JsonDocument& out, JsonDocument* filter);
int apiRequestFast(const char* method, const String& path, JsonDocument& out, JsonDocument* filter);
int apiRequestOnce(const char* method, const String& path, const String& body, JsonDocument& out, JsonDocument* filter);
int apiSubmitScore(int score);
int drawWrapped(int x, int y, int lineHeight, int maxChars, const String& text);
int scoreFromJson(JsonVariantConst value);
int zoneIndex(const TouchZone* zones, int count, int x, int y);
void addRoundPoint(bool isRed, int points);
void apiLoadActiveRound(int matchId);
void apiLoadMatch(int matchId);
void apiLoadMyRoundScore(int matchId, int roundId);
void apiLoadMyScores(int categoryId, int athleteId);
void apiLoadMyTotals(int matchId);
void apiLoadReveal(int categoryId);
void apiPingPresence(int categoryId);
void apiPingPresenceForMatch(int matchId);
void askForPin();
void citesteComenziSerial();
void drawButton(const TouchZone& z, const char* label, uint16_t bg, uint16_t ink, int size);
void drawDecisionScreen();
void drawHalfScoreAt(int x0, int y0, int h, uint16_t bg, const char* corner, const char* name, int value);
void drawHandoverScreen();
void drawLastRequest(int x, int y);
void drawMatchScoreScreen();
void drawMatchScreen();
void drawPinScreen();
void drawPointOverlay();
void drawQuadrant(int index);
void drawScoreScreen();
void drawSignalBars(int x, int y);
void drawSplash(int percent, const char* step);
void drawStandbyScreen();
void drawStatusScreen();
void drawTopBar();
void drawWifiDiagScreen();
void handleMatchTouch(const TouchEvent& e);
void handlePinTouch(const TouchEvent& e);
void handleScoreTouch(const TouchEvent& e);
void handleTouch(const TouchEvent& e);
void incarcaWifiSalvat();
void loadAfterLogin();
void loop();
void noteRequest(unsigned long ms, bool ok);
void onWifiEvent(arduino_event_id_t event, arduino_event_info_t info);
void pollPointValidation();
void printCentered(const char* text, int y, int size, uint16_t color);
void printCenteredIn(const TouchZone& z, const char* text, int size, uint16_t color);
void pushRecent(int eventId, bool isRed, int points, PointState st);
void raspundeWifi();
void redraw();
void salveazaWifi(const String& ssid, const String& pass);
void sendPoint(bool isRed, int points);
void setApiBase(const char* host);
void setStatus(const String& title, const String& detail, bool isError);
void setup();
void startSession();
void submitCurrentScore();
void submitPin();
void toAsciiName(const char* src, char* dst, size_t dstSize);
void toSurnameFirst(const char* src, char* dst, size_t dstSize);
void touchTask(void*);
void uitaWifiSalvat();

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

    // Reglajele panoului intai: sunt in reglaje.cpp, ca sa nu amestec
    // instrumentarul de depanare a ecranului cu comenzile aplicatiei.
    if (reglajeComanda(linie)) {
      // tratata acolo
    } else if (linie.startsWith("LUMINA=")) {
      // Lumina de fundal, prin driverul producatorului. Pe placa veche
      // comanda umbla la polaritatea unui pin; aici panoul si lumina sunt
      // ale lui, si le stie mai bine decat noi.
      int procent = linie.substring(7).toInt();
      if (procent < 0) procent = 0;
      if (procent > 100) procent = 100;
      Set_Backlight(procent);
      Serial.printf("OK LUMINA=%d%%\n", procent);
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
      Serial.println("EROARE comanda necunoscuta (WIFI? / WIFI! / LUMINA=n / BTN? / TEST / PANOU? / PCLK=n / BOUNCE=n / PORCH=.. / EDGE=n / PSLEEP=n / RESYNC / REPORNESTE)");
    }

    linie = "";
  }
}


// ───────────────────────────── ATINGERI ─────────────────────────────
//
// Panoul se citeste dintr-un task propriu, pe nucleul 0.
//
// Motivul nu s-a schimbat de la placa cu encoder: bucla principala petrece cea
// mai mare parte a timpului blocata intr-o cerere HTTP, iar orice apasare
// facuta atunci s-ar pierde. La lupte asta inseamna un punct care nu exista.
//
// Pe ESP32-C3 solutia era intreruperea, fiindca avea un singur nucleu. Aici
// sunt doua, si o atingere nu se poate citi oricum din intrerupere - panoul
// raspunde pe I2C. Deci se citeste in paralel, se pune in coada, si bucla o
// gaseste acolo cand se intoarce.
QueueHandle_t touchQueue = nullptr;
volatile unsigned long lastInputAt = 0;

// Cat de des intrebam panoul. 15ms e mult mai des decat poate apasa un om si
// mult mai rar decat ar incarca magistrala.
#define TOUCH_POLL_MS 15

// Doua atingeri mai apropiate decat atat sunt degetul care s-a rostogolit pe
// sticla, nu doua apasari.
const unsigned long TOUCH_DEBOUNCE_MS = 80;

void touchTask(void*) {
  bool          jos       = false;
  unsigned long ultimaJos = 0;

  for (;;) {
    // Doua apeluri, in ordinea asta, si nu e redundanta: Touch_Read_Data()
    // intreaba cipul, Touch_Get_XY() doar citeste ce-a adus. Fara primul, al
    // doilea intoarce la nesfarsit aceeasi memorie goala - si pare ca panoul
    // nu raspunde, desi nimeni nu l-a intrebat nimic.
    Touch_Read_Data();
    uint16_t x[5], y[5], forta[5];
    uint8_t  degete = 0;
    Touch_Get_XY(x, y, forta, &degete, 5);

    unsigned long now = millis();

    // Numai frontul de apasare, si numai cu un singur deget.
    //
    // La lupte arbitrul sta cu mainile peste aparat, iar o palma lasata pe
    // sticla raporteaza mai multe contacte - adica un punct pe care nimeni nu
    // l-a dat. Un prag de apasare ar fi ghicit; numarul de degete e o masura.
    if (degete >= 1 && !jos) {
      jos = true;
      if (degete == 1 && now - ultimaJos >= TOUCH_DEBOUNCE_MS) {
        ultimaJos = now;
        TouchEvent e;
        e.rawX = x[0];
        e.rawY = y[0];
        // Din pixelii ecranului in unitatile interfetei: impartirea se face o
        // singura data, aici, deci tabelele de zone raman scrise in 240x320.
        e.x = (int16_t)(x[0] / SCARA);
        e.y = (int16_t)(y[0] / SCARA);
        lastInputAt = now;
        xQueueSend(touchQueue, &e, 0);
      }
    } else if (degete == 0) {
      jos = false;
    }

    vTaskDelay(pdMS_TO_TICKS(TOUCH_POLL_MS));
  }
}

bool takeTouch(TouchEvent* e) {
  if (!touchQueue) return false;
  return xQueueReceive(touchQueue, e, 0) == pdTRUE;
}

// Cat de demult a atins cineva ecranul. Cat timp arbitrul pune nota, nu plecam
// dupa date: o cerere blocheaza bucla si ecranul s-ar misca sacadat exact cand
// are nevoie sa raspunda prompt.
bool userIsBusy() {
  unsigned long last = lastInputAt;
  return last && (millis() - last) < 1500;
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
                payloadLen, WiFi.RSSI(), (unsigned)ESP.getFreeHeap());
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
// vede scurt, asteptarea mai mult - daca al doilea arbitru n-a apasat in
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
// sa valideze un punct pe apasarile unui singur arbitru (unique_referees
// >= 2), dar daca un coleg apasa in aceeasi fereastra de 1,5 secunde,
// atunci AMBELE apasari ale mele se valideaza si sportivul ia 2 puncte
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
// doar pe "real_time" serverul cere confirmarea a doi arbitri. In rest
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
// apasat si al doilea arbitru.
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

// Sigla, marita de doua ori.
//
// `draw16bitRGBBitmap` muta imaginea, dar n-o scaleaza - sigla de 120x120 ar
// iesi un sfert din cat trebuie pe un ecran dublu. O desenam pixel cu pixel,
// fiecare ca un patrat de 2x2. Se intampla o data, la pornire; nu merita nimic
// mai destept.
void deseneazaSigla(int x, int y) {
  for (int sy = 0; sy < FRVV_LOGO_H; sy++) {
    for (int sx = 0; sx < FRVV_LOGO_W; sx++) {
      gfx->fillRect((x + sx) * SCARA, (y + sy) * SCARA, SCARA, SCARA,
                    FRVV_LOGO[sy * FRVV_LOGO_W + sx]);
    }
  }
}






// Bara de sus e si butonul de predare a dispozitivului. Nu are eticheta: pe
// un aparat care trece din mana in mana, un "IESIRE" vizibil permanent e
// mai mult o invitatie decat o informatie, iar predarea cere oricum o
// confirmare dupa.

// Ecranele pline - predarea, confirmarea deciziei - acopera bara de sus.
// Reimprospatarea de o secunda trebuie sa stie, altfel trage o dunga gri
// peste ele. Steagul se pune din desen, nu se deduce din stare: starea are
// patru conditii si se schimba, desenul e un singur loc.
bool topBarVisible = false;

// Reluarea, pe ecranele de eroare. Pe placa veche scria "apasa encoderul";
// aici e un buton, fiindca nu mai exista nimic altceva de apasat.

// Tastatura de PIN. Trei coloane care umplu latimea si patru randuri: cifrele
// in ordinea de pe telefon, iar jos sterge, zero si intrarea.
const char* PIN_LABELS[12] = { "1", "2", "3", "4", "5", "6",
                               "7", "8", "9", "<", "0", "OK" };

// Nota la tehnica. Patru trepte si trimiterea.
//
// Pe encoder nota se invartea in jos dintr-un maxim, cate un punct. Aici
// treptele de zece exista fiindca degetul nu are inertie: de la 100 la 72 sunt
// cinci apasari, nu douazeci si opt de clicuri.
const int   SCORE_STEP_DELTA[4]  = { -10, -1, 1, 10 };
const char* SCORE_STEP_LABEL[4]  = { "-10", "-1", "+1", "+10" };

// Cele patru sferturi de la lupte in timp real. Umplu exact suprafata dintre
// bara de sus si banda de jos: nicio fasie neatribuita, ca sa nu existe loc
// pe ecran in care arbitrul apasa si nu se intampla nimic.
#define MATCH_BAND_Y 292

// La afisare finala arbitrul isi tine propriul total, deci jumatatile de
// ecran arata numerele si butoanele stau dedesubt. Ordinea e aceeasi ca la
// sferturi, ca sa nu se invete doua obiceiuri pentru acelasi punct.

// Decizia finala: doua butoane cat jumatatea ecranului.

// Predarea dispozitivului. Separate si mari: e singura actiune din care nu te
// poti intoarce fara sa stii din nou PIN-ul.






// O jumatate de ecran: coltul, sportivul, si totalul meu.
void drawHalfScoreAt(int x0, int y0, int h, uint16_t bg,
                     const char* corner, const char* name, int value) {
  ui.fillRect(x0, y0, 120, h, bg);

  ui.setTextSize(1);
  ui.setTextColor(WHITE);
  ui.setCursor(x0 + 6, y0 + 8);
  ui.print(corner);

  // 120px la marimea 1 inseamna 20 de caractere; taiem, nu lasam numele
  // sa curga peste jumatatea cealalta.
  char shortName[19];
  strlcpy(shortName, name[0] ? name : "-", sizeof(shortName));
  ui.setCursor(x0 + 6, y0 + 22);
  ui.print(shortName);

  char buf[6];
  snprintf(buf, sizeof(buf), "%d", value);

  ui.setTextSize(6);
  int w = strlen(buf) * 6 * 6;
  ui.setCursor(x0 + (120 - w) / 2, y0 + 40);
  ui.print(buf);
}





void setStatus(const String& title, const String& detail, bool isError) {
  statusTitle  = title;
  statusDetail = detail;
  statusIsError = isError;
  screen = SCREEN_STATUS;
  drawStatusScreen();
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
  // Economia de energie a radioului e reglabila prin cablu (PSLEEP=0/1)
  // fiindca e una din variabilele care se incearca impotriva tremuratului:
  // un modem care nu doarme niciodata cere magistrala permanent, dar unul
  // care doarme intarzie fiecare cerere cu zeci de milisecunde.
  WiFi.setSleep(rg.wifiSleep);
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

// ─────────────────────────── ACTIUNI ───────────────────────────
//
// Ce poate face arbitrul, scris o singura data si fara nicio referinta la cum
// a cerut-o: o zona apasata pe ecranul desenat de noi si un buton LVGL ajung
// amandoua aici.
//
// Pana acum astea traiau in interiorul tratarii atingerilor, amestecate cu
// gasirea zonei apasate. Mergea cat timp exista o singura interfata. Nu mai
// merge cand a doua interfata nu are zone deloc - LVGL stie singur ce buton
// s-a apasat si cheama direct. Separarea nu schimba nimic in comportament,
// doar muta granita unde trebuia sa fie de la inceput.

void actPinCifra(char cifra) {
  if (pinCursor >= PIN_DIGITS) return;
  pinDigits[pinCursor++] = cifra;
  pinDigits[pinCursor]   = '\0';
  redraw();
}

void actPinSterge() {
  if (pinCursor == 0) return;
  pinDigits[--pinCursor] = '\0';
  redraw();
}

void actPinTrimite() {
  // Numai cu PIN-ul complet. Butonul e desenat stins pana atunci, deci aici
  // nu se refuza nimic ce ar fi parut posibil.
  if (pinCursor == PIN_DIGITS) submitPin();
}

void actNotaPas(int treapta) {
  if (submittedShown) return;
  if (treapta < 0 || treapta > 3) return;
  // Nu se taie la capat, se refuza: treapta care ar iesi din interval e deja
  // desenata stinsa, deci refuzul se potriveste cu ce se vede.
  int rezultat = draftScore + SCORE_STEP_DELTA[treapta];
  if (rezultat < 0 || rezultat > MAX_SCORE) return;
  draftScore = rezultat;
  redraw();
}

void actNotaTrimite() {
  if (submittedShown) return;
  submitCurrentScore();
}

void actDecizie(int buton) {
  if (finalDecided || buton < 0 || buton > 1) return;

  // Butonul din stanga e culoarea sfertului din stanga, ca pe ecran. Asa un
  // arbitru care a mutat rosul in dreapta prin BTN= il gaseste in dreapta si
  // cand decide.
  bool leftRed = pointButtons[0].isRed;
  bool wantRed = (buton == 0) ? leftRed : !leftRed;

  if (decisionArmed && decisionArmedRed == wantRed) {
    decisionArmed = false;
    if (!apiSubmitDecision(wantRed)) {
      pointSideRed = wantRed;
      pointValue   = 0;
      pointState   = POINT_FAILED;
      pointShownAt = millis();
    }
  } else {
    // Fie e prima apasare, fie te-ai razgandit: cealalta culoare schimba
    // alegerea in loc s-o confirme pe cea veche.
    decisionArmed    = true;
    decisionArmedRed = wantRed;
    decisionArmedAt  = millis();
    lastDecisionTick = millis();
  }
  redraw();
}

void actSfert(int index) {
  if (index < 0 || index > 3) return;

  // Cat timp ecranul de punct acopera totul, nicio apasare nu puncteaza. In
  // timp real e invers: sferturile raman la vedere si isi arata singure
  // starea, deci trebuie sa raspunda in continuare.
  if (!liveMatchRealTime && pointState != POINT_NONE) return;

  // Apasare in pauza sau intre reprize. Regula e a competitiei, nu a noastra -
  // dar arbitrul trebuie sa afle ca punctul n-a plecat, nu sa presupuna ca a
  // intrat.
  if (!canScoreNow()) {
    pointSideRed = pointButtons[index].isRed;
    pointValue   = pointButtons[index].points;
    pointState   = POINT_CLOSED;
    pointShownAt = millis();
    redraw();
    return;
  }

  if (!acceptaApasare(index)) return;

  if (liveMatchRealTime) sendPoint(pointButtons[index].isRed, pointButtons[index].points);
  else                   addRoundPoint(pointButtons[index].isRed, pointButtons[index].points);
}

void actCerePredare() {
  // Numai de pe ecranele in care exista o sesiune de predat, si nu cand o
  // decizie asteapta confirmarea.
  if (decisionArmed) return;
  if (screen != SCREEN_STANDBY && screen != SCREEN_SCORE && screen != SCREEN_MATCH) return;
  screenBeforeHandover = screen;
  screen = SCREEN_HANDOVER;
  redraw();
}

void actPredare(bool da) {
  if (da) {
    askForPin();
  } else {
    screen = screenBeforeHandover;
    redraw();
  }
}

void actReia() {
  if (WiFi.status() == WL_CONNECTED) askForPin();
  else                               startSession();
}





// ───────────────────────── INTERFATA ─────────────────────────
//
// Desenul si gasirea zonei apasate, incluse ca text in acelasi fisier, nu
// compilate separat.
//
// Motivul e practic: interfata citeste zeci de variabile de stare ale
// aplicatiei - ecranul curent, nota in lucru, sferturile meciului, numele
// sportivului. Intr-un fisier compilat separat fiecare din ele ar cere o
// declaratie `extern`, adica o a doua copie de intretinut care tace cand se
// desincronizeaza. Inclusa aici, interfata vede tot ce e deasupra ei si nu
// repeta nimic.
//
// Ce se castiga: interfata se schimba intreaga, dintr-o linie. Logica de
// dedesubt - PIN, HTTP, regulile de arbitraj - nu stie care din ele e legata.
#ifdef UI_LVGL
  #include "desen_lvgl.inc"
#else
  #include "desen_gfx.inc"
#endif

// ───────────────────────────── ARDUINO ─────────────────────────────

void setup() {
  Serial.begin(115200);
  // Pe USB CDC, scrierea asteapta pana la 100ms cand gazda e conectata dar nu
  // citeste - adica ori de cate ori placa e in priza calculatorului fara
  // monitor deschis. Cum logam la fiecare cerere, asta punea sute de
  // milisecunde exact in drumul notei arbitrului.
  Serial.setTxTimeoutMs(0);
  delay(400);

  Serial.println();
  Serial.printf("=== Arbitru FRVV 2.8B, compilat %s %s ===\n", __DATE__, __TIME__);
  Serial.printf("PSRAM: %u octeti\n", (unsigned)ESP.getPsramSize());

  // Reglajele panoului, INAINTE de pornirea lui: Display_ST7701 le citeste
  // cand construieste peripheralul RGB, si dupa aia nu se mai pot schimba
  // decat pixel clock-ul.
  reglajeIncarca();

  // Ecranul, prin driverul producatorului, cu desenul legat de memoria lui.
  if (!ecranPorneste()) {
    Serial.println("Panoul nu a dat memoria de ecran. PSRAM: OPI PSRAM in Tools?");
    // Continuam oricare ar fi: restul pornirii spune daca WiFi-ul si serverul
    // sunt in regula, si atunci se stie ca singura piesa de vina e ecranul.
  } else {
    Serial.printf("Ecran %dx%d, interfata %dx%d, scara %d, desen fara copiere\n",
                  ECRAN_LAT, ECRAN_INAL, SCREEN_W, SCREEN_H, SCARA);
  }
  reglajeRaport();

  // Inainte de orice incercare de conectare: daca a fost configurata prin
  // cablu, reteaua din memorie e cea buna, nu cea din cod.
  incarcaWifiSalvat();
  incarcaRoluri();

  // Atingerile, pe celalalt nucleu. Prioritate 2: peste firul de repaus, mult
  // sub WiFi - panoul nu are nevoie de mai mult, si daca ar avea ar intarzia
  // exact radioul pe care pleaca nota.
  touchQueue = xQueueCreate(8, sizeof(TouchEvent));
  xTaskCreatePinnedToCore(touchTask, "touch", 4096, nullptr, 2, nullptr, 0);

  Set_Backlight(100);
  startSession();
}
void loop() {
  // Si cand device-ul nu prinde reteaua: tocmai atunci e nevoie sa i-o poti
  // schimba prin cablu, nu doar cand merge totul.
  citesteComenziSerial();

  // Improspatarea masurata, o data la 5 secunde. Nu e pentru productie - e
  // cum se vede, in cifre, ce face ecranul in timp ce radioul lucreaza. Cand
  // tremuratul apare, numarul de aici spune imediat care din cele doua cauze
  // e: sub 45Hz pulseaza de la sine, la Hz corecti e DMA desincronizat.
  static unsigned long ultimulHz = 0;
  if (millis() - ultimulHz >= 5000) {
    ultimulHz = millis();
    float hz = reglajeHz();
    if (hz > 0) {
      Serial.printf("HZ %.1f (teoretic %.1f) rssi=%d liberPsram=%u\n",
                    hz, reglajeHzTeoretic(), WiFi.RSSI(),
                    (unsigned)ESP.getFreePsram());
    }
  }

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
  // asteptarea mai mult. Daca al doilea arbitru n-a apasat in secunda si
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
