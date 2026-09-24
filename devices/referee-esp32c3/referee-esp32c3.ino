// Arbitru FRVV pe ESP32-C3 + ST7789 240x240 + encoder KY-040.
//
// Face exact ce face aplicatia web de arbitraj pentru probele de tehnica
// (apps/referee-scoring, ecranul ScoringPanel), fara browser:
//
//   1. se conecteaza la WiFi-ul salii
//   2. arbitrul formeaza din encoder PIN-ul lui de 5 cifre
//   3. sta in asteptare, fara sa aleaga nimic
//   4. cand masa centrala pune un sportiv pe ecran intr-o categorie la
//      care acest arbitru e alocat, sportivul apare direct pe dispozitiv
//   5. arbitrul roteste nota si o trimite (0..100)
//
// Arbitrul nu alege nici categorie, nici sportiv: urmareste masa centrala,
// exact ca ecranele din sala. Singurul lucru pe care il face e nota.
//
// Serverul e cel local, din sala - acelasi pe care il porneste launcher-ul.
// Nu e nevoie de HTTPS: totul sta in LAN-ul salii.
//
// Biblioteci (Library Manager): Arduino_GFX, ArduinoJson (v7).
// Placa: "ESP32C3 Dev Module", cu "USB CDC On Boot: Enabled" daca vrei
// Serial pe USB.

#include <Arduino_GFX_Library.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "frvv_logo.h"

// ─────────────────────────── CONFIGURARE ───────────────────────────

const char* WIFI_SSID = "Zignative2";
const char* WIFI_PASS = "Rrdspider1";

// Calculatorul din sala. IP-ul e cel afisat mare in launcher.
const char* API_HOST = "192.168.0.197";
const int   API_PORT = 8000;

// Plasa de siguranta pentru cand IP-ul se schimba - si se schimba: e dat
// de DHCP, iar o simpla trecere de pe o retea pe alta l-a mutat deja
// odata. Daca adresa de mai sus nu raspunde, placa intreaba reteaua unde
// e calculatorul asta dupa nume (Bonjour/mDNS, ce anunta macOS singur) si
// merge mai departe fara sa fie reprogramata. Numele se vede pe Mac cu
// `scutil --get LocalHostName`; lasa gol ca sa dezactivezi cautarea.
const char* API_MDNS_NAME = "Gabis-MacBook-Pro";

// Nu se configureaza nimic per arbitru: PIN-ul se formeaza din encoder la
// pornire, iar serverul stie din el cine e si la ce eveniment. Acelasi
// dispozitiv trece de la un arbitru la altul fara sa fie reprogramat.

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
// bucla - adica encoderul si butonul.
const unsigned long POLL_TIMEOUT_MS = 2500;
int httpTimeoutMs = HTTP_TIMEOUT_MS;

const int MAX_SCORE = 100;

// Se vede pe ecranul de pornire. Singurul mod sigur de a sti, din sala,
// daca placa chiar are versiunea pe care credem ca am incarcat-o.
// Versionare semantica: MAJOR.MINOR.PATCH. Se urca MINOR la functii
// noi si corecturi, MAJOR doar cand se schimba felul in care se
// foloseste aparatul. 2.0.0 e prima cu arbitraj la lupte - pana
// atunci placa stia doar probe tehnice.
const char* FW_VERSION = "2.0.2";
// Se vede pe ecranul de pornire. Cand ai pe masa cinci dispozitive
// incarcate in zile diferite, data spune mai mult decat numarul.
const char* FW_UPDATED = "24.09.2026";

// ───────────────────────────── HARDWARE ─────────────────────────────

#define TFT_DC    8
#define TFT_RST  10
#define TFT_MOSI  6
#define TFT_SCLK  4

#define ENCODER_CLK 7
#define ENCODER_DT  3
#define ENCODER_SW  5

// Cele patru butoane de punctaj la lupte. Encoderul ramane pentru
// tehnica, unde nota porneste de la 10.0 si se roteste in jos - fix
// cum gandeste un arbitru care scade dintr-un maxim. La lupte insa
// punctul se da intr-o jumatate de secunda, cu ochii pe saltea, si
// acolo un buton gasit pe pipaite bate orice rotire.
#define BTN_RED_1   20
#define BTN_RED_2    0
#define BTN_BLUE_1  21
#define BTN_BLUE_2   1

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

Arduino_DataBus *bus = new Arduino_ESP32SPI(TFT_DC, -1, TFT_SCLK, TFT_MOSI, -1);
Arduino_GFX *gfx = new Arduino_ST7789(bus, TFT_RST, 0, true, 240, 240);

// ─────────────────────────── STARE APLICATIE ───────────────────────────

enum Screen {
  SCREEN_STATUS,      // pornire, erori, reconectare
  SCREEN_WIFI_DIAG,   // ce retele vede placa, cand nu prinde WiFi
  SCREEN_PIN,         // arbitrul isi formeaza PIN-ul
  SCREEN_STANDBY,     // conectat, astept sa fiu pus pe o categorie
  SCREEN_SCORE,       // sportivul e pe saltea: rotesti nota si o trimiti
  SCREEN_MATCH        // meci de lupta: patru butoane, puncte in timp real
};

// Sus, nu langa readButton(): Arduino genereaza singur prototipurile
// functiilor si le pune imediat dupa #include-uri, deci orice tip folosit
// intr-o semnatura trebuie sa existe inainte de prima functie.
enum ButtonEvent { BTN_NONE, BTN_SHORT, BTN_LONG };

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
// data nu se retrage dintr-o rotire de buton. Daca chiar trebuie
// schimbata, se face de la masa centrala, unde ramane urma.
bool submittedShown  = false;
int  submittedScore  = 0;


// ───────────────────────────── ENCODER ─────────────────────────────

// Pe intreruperi, nu citit din loop(). Bucla principala petrece cea mai
// mare parte a timpului blocata intr-o cerere HTTP - cat dureaza aia,
// orice rotire si orice apasare s-ar pierde pur si simplu, si asa si era:
// invarteai de nota si nu se intampla nimic. Acum evenimentele se aduna
// in variabile si se consuma cand bucla ajunge iar la ele.
volatile int           encoderDelta   = 0;
volatile bool          pendingShort   = false;
volatile bool          pendingLong    = false;
volatile unsigned long btnDownAt      = 0;
volatile unsigned long lastBtnEdge    = 0;
volatile unsigned long lastTurnMicros = 0;
volatile unsigned long lastInputAt    = 0;

const unsigned long DEBOUNCE_MS   = 40;
const unsigned long LONG_PRESS_MS = 700;

void IRAM_ATTR onEncoderTurn() {
  // Contactele encoderului sar; sub 1.5ms e zgomot, nu o treapta.
  unsigned long now = micros();
  if (now - lastTurnMicros < 1500) return;
  lastTurnMicros = now;

  encoderDelta += (digitalRead(ENCODER_DT) != LOW) ? 1 : -1;
  lastInputAt = millis();
}

// Durata apasarii se masoara aici, la eliberare, nu in loop(): daca bucla
// e blocata intr-o cerere cand arbitrul apasa, o apasare lunga tot trebuie
// recunoscuta corect.
void IRAM_ATTR onButtonChange() {
  unsigned long now = millis();
  if (now - lastBtnEdge < 15) return;   // debounce pe front
  lastBtnEdge = now;
  lastInputAt = now;

  if (digitalRead(ENCODER_SW) == LOW) {
    btnDownAt = now;
  } else if (btnDownAt) {
    unsigned long held = now - btnDownAt;
    btnDownAt = 0;
    if (held >= LONG_PRESS_MS)      pendingLong = true;
    else if (held >= DEBOUNCE_MS)   pendingShort = true;
  }
}

int readEncoderDelta() {
  noInterrupts();
  int d = encoderDelta;
  encoderDelta = 0;
  interrupts();
  return d;
}

ButtonEvent readButton() {
  ButtonEvent e = BTN_NONE;
  noInterrupts();
  if (pendingLong)       { pendingLong = false;  e = BTN_LONG; }
  else if (pendingShort) { pendingShort = false; e = BTN_SHORT; }
  interrupts();
  return e;
}

// Cat de demult a atins cineva butonul. Cat timp arbitrul invarte nota,
// nu plecam dupa date: o cerere blocheaza bucla si ecranul s-ar misca
// sacadat exact cand are nevoie sa raspunda prompt.
bool userIsBusy() {
  noInterrupts();
  unsigned long last = lastInputAt;
  interrupts();
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

// Doar id-urile, o singura data dupa login. Categoriile de lupta se
// arbitreaza pe puncte in timpul meciului, alt flux - aici notam tehnica.
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

// Butoanele de punctaj. Ca si encoderul, se citesc pe intrerupere:
// loop() sta blocat in cereri HTTP, iar o apasare citita prin polling
// s-ar pierde acolo fara urma.
struct PointButton {
  uint8_t     pin;
  bool        isRed;
  int         points;
  volatile unsigned long lastEdgeMs;
  volatile unsigned long lastAcceptedMs;
};

PointButton pointButtons[4] = {
  { BTN_RED_1,  true,  1, 0, 0 },
  { BTN_RED_2,  true,  2, 0, 0 },
  { BTN_BLUE_1, false, 1, 0, 0 },
  { BTN_BLUE_2, false, 2, 0, 0 },
};

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
volatile bool pressTooFast = false;

// Coada de apasari: intreruperea doar noteaza, trimiterea se face din
// loop(). Opt locuri sunt mai mult decat poate apasa un om cat tine o
// cerere; ce trece peste se pierde, si e mai bine asa decat sa blocam
// intreruperea.
volatile int pressQueue[8];
volatile int pressHead = 0;
volatile int pressTail = 0;

void IRAM_ATTR onPointButton(void* arg) {
  PointButton* b = (PointButton*) arg;
  unsigned long now = millis();
  if (now - b->lastEdgeMs < DEBOUNCE_MS) return;
  b->lastEdgeMs = now;

  // Doar frontul de apasare. Eliberarea nu ne intereseaza: un punct se
  // da cand degetul atinge butonul, nu cand il ridica.
  if (digitalRead(b->pin) != LOW) return;

  if (now - b->lastAcceptedMs < POINT_GUARD_MS) {
    pressTooFast = true;
    return;
  }
  b->lastAcceptedMs = now;

  int next = (pressHead + 1) % 8;
  if (next == pressTail) return;     // coada plina
  pressQueue[pressHead] = (int) (b - pointButtons);
  pressHead = next;
}

bool takePress(int* index) {
  if (pressTail == pressHead) return false;
  *index = pressQueue[pressTail];
  pressTail = (pressTail + 1) % 8;
  return true;
}

// La ce meciuri sunt arbitru. Ca si la categorii, lista serveste doar ca
// sa stiu daca meciul pe care il pune masa centrala e al meu - nu se
// alege nimic de pe dispozitiv.
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

// Ecranul are 240px, iar fontul are 6px pe caracter: cam 38 de caractere
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
  gfx->setCursor((240 - w) / 2, y);
  gfx->print(text);
}

// Ecranul de pornire. Pana acum, la alimentare aparea un ecran negru cu
// un rand de text - arata a placa de test, nu a aparat de concurs. Si,
// mai practic: fara o bara care avanseaza, arbitrul nu stie daca placa
// lucreaza sau s-a blocat, iar conectarea la WiFi poate dura secunde bune.
void drawSplash(int percent, const char* step) {
  gfx->fillScreen(NAVY);

  // Sigla e deja compusa peste acelasi navy, deci se aseaza fara contur.
  gfx->draw16bitRGBBitmap((240 - FRVV_LOGO_W) / 2, 8, FRVV_LOGO, FRVV_LOGO_W, FRVV_LOGO_H);

  printCentered("APLICATIE ARBITRI", 138, 2, GOLD);

  String version = String("v") + FW_VERSION + "  -  " + FW_UPDATED;
  printCentered(version.c_str(), 160, 1, LIGHTGRAY);

  // Bara de progres: fara ea, o conectare la WiFi de cateva secunde pare
  // un aparat blocat.
  const int barX = 30, barY = 180, barW = 180, barH = 12;
  gfx->drawRect(barX, barY, barW, barH, LIGHTGRAY);
  int fill = (barW - 4) * percent / 100;
  if (fill > 0) gfx->fillRect(barX + 2, barY + 2, fill, barH - 4, GOLD);

  if (step && step[0]) printCentered(step, 204, 1, WHITE);
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
  gfx->fillRect(0, 0, 240, 25, DARKGRAY);
  gfx->drawFastHLine(0, 25, 240, LIGHTGRAY);
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

// Ecranul de meci: cine e in fiecare colt, ce repriza e, si daca am
// voie sa punctez acum. Nu afisam scorul total - arbitrul de margine
// nu-l tine el, iar un numar gresit pe ecran ar cantari mai mult decat
// niciun numar.
void drawMatchScreen() {
  gfx->fillRect(0, 26, 240, 214, BLACK);
  drawTopBar();

  gfx->fillRect(0, 30, 240, 74, SIDE_RED);
  gfx->setTextSize(2);
  gfx->setTextColor(WHITE);
  gfx->setCursor(8, 40);
  gfx->print("ROSU");
  gfx->setTextSize(1);
  gfx->setCursor(8, 62);
  gfx->print(liveRedName[0] ? liveRedName : "-");
  gfx->setTextSize(3);
  gfx->setCursor(170, 48);
  gfx->print("1 2");

  gfx->fillRect(0, 108, 240, 74, SIDE_BLUE);
  gfx->setTextSize(2);
  gfx->setTextColor(WHITE);
  gfx->setCursor(8, 118);
  gfx->print("ALBASTRU");
  gfx->setTextSize(1);
  gfx->setCursor(8, 140);
  gfx->print(liveBlueName[0] ? liveBlueName : "-");
  gfx->setTextSize(3);
  gfx->setCursor(170, 126);
  gfx->print("1 2");

  gfx->setTextSize(2);
  if (!roundsKnown) {
    gfx->setTextColor(LIGHTGRAY);
    printCentered("...", 196, 2, LIGHTGRAY);
  } else if (activeRoundPaused) {
    printCentered("PAUZA", 196, 2, ORANGE);
  } else if (allRoundsDone) {
    printCentered("MECI INCHEIAT", 196, 2, GOLD);
  } else if (!activeRoundId) {
    printCentered("INTRE REPRIZE", 196, 2, ORANGE);
  } else {
    char line[24];
    snprintf(line, sizeof(line), "REPRIZA %d", activeRoundNumber);
    printCentered(line, 196, 2, GREEN);
  }

  if (!canScoreNow()) {
    printCentered("nu se puncteaza acum", 222, 1, LIGHTGRAY);
    return;
  }

  // Ultimele puncte date de mine, cu ce s-a ales de ele. Cutia are
  // culoarea coltului; conturul auriu inseamna validat. Fara banda asta
  // arbitrul n-ar avea cum sa stie daca a doua apasare a intrat sau a
  // fost oprita de garda.
  for (int i = 0; i < recentCount; i++) {
    int x = 10 + i * 74;
    uint16_t bg = recent[i].isRed ? SIDE_RED : SIDE_BLUE;
    gfx->fillRect(x, 214, 66, 24, bg);
    if (recent[i].state == POINT_VALIDATED) {
      gfx->drawRect(x,     214,     66,     24,     GOLD);
      gfx->drawRect(x + 1, 214 + 1, 66 - 2, 24 - 2, GOLD);
    }
    gfx->setTextSize(2);
    gfx->setTextColor(recent[i].state == POINT_VALIDATED ? GOLD : WHITE);
    gfx->setCursor(x + 6, 218);
    gfx->print("+");
    gfx->print(recent[i].points);
    if (recent[i].state == POINT_PENDING) {
      gfx->setTextSize(1);
      gfx->setTextColor(WHITE);
      gfx->setCursor(x + 46, 222);
      gfx->print("?");
    }
  }
}

// O jumatate de ecran: coltul, sportivul, si totalul meu pentru repriza.
void drawHalfScoreAt(int x0, uint16_t bg, const char* corner, const char* name, int value, int y0) {
  gfx->fillRect(x0, y0, 120, 207 - y0, bg);

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
  gfx->setCursor(x0 + (120 - w) / 2, y0 + 78);
  gfx->print(buf);
}

void drawHalfScore(int x0, uint16_t bg, const char* corner, const char* name, int value) {
  drawHalfScoreAt(x0, bg, corner, name, value, 26);
}

// Modul "reveal_final": nu exista validare in doi, fiecare arbitru isi
// tine propriul total. Ecranul se imparte in doua pentru ca arbitrul
// trebuie sa vada permanent ambele numere - ele sunt nota lui, nu un
// simplu semnal ca apasarea a fost primita.
void drawMatchScoreScreen() {
  drawTopBar();
  if (roundScoreKnown) {
    drawHalfScore(0,   SIDE_RED,  "ROSU",     liveRedName,  myRedScore);
    drawHalfScore(120, SIDE_BLUE, "ALBASTRU", liveBlueName, myBlueScore);
  } else {
    // Pana vine nota de la server nu aratam zero: un zero neadevarat se
    // citeste ca "n-am dat niciun punct".
    drawHalfScoreAt(0,   SIDE_RED,  "ROSU",     liveRedName,  0, 26);
    drawHalfScoreAt(120, SIDE_BLUE, "ALBASTRU", liveBlueName, 0, 26);
    gfx->fillRect(0, 100, 240, 60, BLACK);
    printCentered("se incarca...", 120, 2, LIGHTGRAY);
  }
  gfx->drawFastVLine(120, 26, 181, BLACK);

  gfx->fillRect(0, 207, 240, 33, BLACK);
  if (!roundsKnown) {
    printCentered("...", 214, 2, LIGHTGRAY);
  } else if (activeRoundPaused) {
    printCentered("PAUZA", 214, 2, ORANGE);
  } else if (allRoundsDone) {
    printCentered("MECI INCHEIAT", 216, 2, GOLD);
  } else if (!activeRoundId) {
    printCentered("INTRE REPRIZE", 216, 2, ORANGE);
  } else {
    char line[24];
    snprintf(line, sizeof(line), "REPRIZA %d", activeRoundNumber);
    printCentered(line, 214, 2, GREEN);
  }
}

// Decizia finala. Trei stari pe acelasi ecran: alegerea, confirmarea, si
// decizia deja trimisa.
void drawDecisionScreen() {
  // Deja am decis: nu mai are ce sa faca butonul. Serverul oricum n-ar
  // accepta o schimbare fara ca adminul sa stearga randul, iar un ecran
  // care pare sa astepte o apasare ar minti.
  if (finalDecided) {
    gfx->fillScreen(finalChoiceRed ? SIDE_RED : SIDE_BLUE);
    printCentered("DECIZIA TA", 50, 2, WHITE);
    printCentered(finalChoiceRed ? "ROSU" : "ALBASTRU", 100, 4, WHITE);
    printCentered("trimisa", 160, 2, WHITE);
    printCentered("se schimba doar de la masa centrala", 200, 1, WHITE);
    return;
  }

  // O culoare asteapta confirmarea. Ecran plin, ca sa nu existe dubiu
  // despre ce urmeaza sa trimiti.
  if (decisionArmed) {
    gfx->fillScreen(decisionArmedRed ? SIDE_RED : SIDE_BLUE);
    printCentered(decisionArmedRed ? "ROSU" : "ALBASTRU", 40, 4, WHITE);
    printCentered("APASA DIN NOU", 100, 2, WHITE);
    printCentered("ca sa confirmi castigatorul", 130, 1, WHITE);
    unsigned long left = DECISION_ARM_MS - (millis() - decisionArmedAt);
    char line[24];
    snprintf(line, sizeof(line), "%lus", (left / 1000) + 1);
    printCentered(line, 160, 2, WHITE);
    printCentered("cealalta culoare schimba alegerea", 200, 1, WHITE);
    return;
  }

  drawTopBar();
  printCentered("CINE A CASTIGAT?", 32, 1, GOLD);

  // Totalurile mele, nu ale meciului: arbitrul decide pe ce a notat el.
  drawHalfScoreAt(0,   SIDE_RED,  "ROSU",     liveRedName,  myTotalRed,  46);
  drawHalfScoreAt(120, SIDE_BLUE, "ALBASTRU", liveBlueName, myTotalBlue, 46);
  gfx->drawFastVLine(120, 46, 160, BLACK);

  gfx->fillRect(0, 206, 240, 34, BLACK);
  if (!totalsKnown) {
    printCentered("se incarca notele...", 214, 1, LIGHTGRAY);
  } else if (myTotalRed == myTotalBlue) {
    printCentered("EGALITATE - alegi tu", 212, 1, ORANGE);
    printCentered("apasa un buton al culorii", 226, 1, LIGHTGRAY);
  } else {
    printCentered("apasa un buton al culorii", 220, 1, LIGHTGRAY);
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
  gfx->fillRect(0, 26, 240, 214, bg);
  drawTopBar();

  uint16_t ink = (pointState == POINT_VALIDATED) ? BLACK : WHITE;

  // Numarul mare doar cand chiar exista un punct in spatele lui. La
  // "prea repede" nu stim care buton a fost respins, iar un "+2" ramas
  // de la apasarea anterioara ar minti.
  if (pointState != POINT_TOO_FAST && pointValue > 0) {
    char big[6];
    snprintf(big, sizeof(big), "+%d", pointValue);
    printCentered(big, 44, pointState == POINT_CLOSED ? 6 : 9, ink);
  }

  // La validare scriem si cine a luat punctul, in culoarea lui: auriul
  // spune "confirmat", cuvantul spune "al cui".
  if (pointState == POINT_VALIDATED) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 140, 3,
                  pointSideRed ? SIDE_RED : SIDE_BLUE);
    printCentered("VALIDAT", 180, 2, BLACK);
  } else if (pointState == POINT_PENDING) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 140, 3, ink);
    printCentered("ASTEPT AL 2-LEA ARBITRU", 190, 1, ink);
  } else if (pointState == POINT_SENDING) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 140, 3, ink);
    printCentered("SE TRIMITE...", 190, 1, ink);
  } else if (pointState == POINT_CLOSED) {
    printCentered("NU SE PUNCTEAZA", 120, 2, WHITE);
    printCentered(allRoundsDone ? "meciul s-a incheiat"
                  : (activeRoundPaused ? "repriza e in pauza" : "esti intre reprize"),
                  160, 1, WHITE);
    printCentered("punctul NU a fost trimis", 184, 1, ORANGE);
  } else if (pointState == POINT_TOO_FAST) {
    printCentered("PREA REPEDE", 130, 2, WHITE);
    printCentered("punctul NU a fost trimis", 170, 1, WHITE);
    printCentered("apasa din nou daca e o faza noua", 190, 1, WHITE);
  } else {
    printCentered("NETRIMIS", 140, 3, RED);
    printCentered("fara legatura cu serverul", 190, 1, WHITE);
  }
}

void drawStatusScreen() {
  gfx->fillRect(0, 26, 240, 214, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(statusIsError ? RED : CYAN);
  gfx->setCursor(12, 80);
  gfx->println(statusTitle);

  gfx->setTextSize(1);
  gfx->setTextColor(WHITE);
  drawWrapped(12, 115, 14, 37, statusDetail);

  if (statusIsError) {
    gfx->setTextColor(LIGHTGRAY);
    gfx->setCursor(12, 210);
    gfx->println("Apasa encoderul ptr reincercare");
  }
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
  gfx->fillRect(0, 26, 240, 214, BLACK);
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
  gfx->setCursor(10, 96);
  if (scanCount == 0) {
    gfx->println("Nicio retea 2.4GHz in jur.");
  } else {
    gfx->print("Retele gasite (");
    gfx->print(scanCount);
    gfx->println("):");
  }

  for (int i = 0; i < scanCount; i++) {
    int y = 112 + i * 16;
    bool ours = (strcmp(scanRows[i].ssid, WIFI_SSID) == 0);
    gfx->setTextColor(ours ? GREEN : WHITE);
    gfx->setCursor(10, y);
    gfx->print(scanRows[i].ssid);
    gfx->setCursor(158, y);
    gfx->print("c");
    gfx->print(scanRows[i].channel);
    gfx->setCursor(196, y);
    gfx->print(scanRows[i].rssi);
  }

  gfx->setTextColor(LIGHTGRAY);
  gfx->setCursor(10, 228);
  gfx->println("Apasa: incearca din nou");
}

// Cinci cifre, una activa. Rotesti ca sa o schimbi, apesi ca sa treci la
// urmatoarea; dupa ultima, apasarea trimite. Apasarea lunga se intoarce o
// cifra - un encoder nu are Backspace.
void drawPinScreen() {
  gfx->fillRect(0, 26, 240, 214, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(CYAN);
  gfx->setCursor(10, 38);
  gfx->println("PIN ARBITRU");

  gfx->setTextSize(1);
  gfx->setTextColor(LIGHTGRAY);
  gfx->setCursor(10, 62);
  gfx->print("Server: ");
  gfx->println(serverLabel);

  const int boxW = 38;
  const int boxH = 56;
  const int gap  = 6;
  const int totalW = PIN_DIGITS * boxW + (PIN_DIGITS - 1) * gap;
  int x0 = (240 - totalW) / 2;

  for (int i = 0; i < PIN_DIGITS; i++) {
    int x = x0 + i * (boxW + gap);
    bool here = (i == pinCursor);

    gfx->fillRect(x, 92, boxW, boxH, here ? BLUE : BLACK);
    gfx->drawRect(x, 92, boxW, boxH, here ? WHITE : DARKGRAY);

    gfx->setTextSize(4);
    gfx->setTextColor(here ? YELLOW : WHITE);
    gfx->setCursor(x + 7, 106);
    gfx->print(pinDigits[i]);
  }

  gfx->setTextSize(1);
  gfx->setTextColor(LIGHTGRAY);
  gfx->setCursor(10, 202);
  gfx->println("Roteste: cifra");
  gfx->setCursor(10, 216);
  gfx->println(pinCursor == PIN_DIGITS - 1 ? "Apasa: intra" : "Apasa: cifra urmatoare");
  gfx->setCursor(10, 230);
  gfx->println("Lung: cifra anterioara");
}

// Conectat, dar masa centrala inca nu a pus pe ecran un sportiv dintr-o
// categorie de-a mea. Nu e o eroare si nu e nimic de apasat - asta e
// starea normala intre doi concurenti.
void drawStandbyScreen() {
  gfx->fillRect(0, 26, 240, 214, BLACK);
  drawTopBar();

  gfx->setTextSize(2);
  gfx->setTextColor(CYAN);
  gfx->setCursor(10, 52);
  gfx->println("IN ASTEPTARE");

  gfx->setTextSize(2);
  gfx->setTextColor(WHITE);
  drawWrapped(10, 92, 20, 19, refereeName);

  gfx->setTextSize(1);
  gfx->setTextColor(LIGHTGRAY);
  drawWrapped(10, 150, 14, 37,
              "Astept ca masa centrala sa afiseze un sportiv dintr-o categorie a mea.");

  gfx->setTextColor(DARKGRAY);
  gfx->setCursor(10, 230);
  gfx->print(myCategoryCount);
  gfx->print(" categorii alocate   Lung: iesire");
}

void drawScoreScreen() {
  gfx->fillRect(0, 26, 240, 214, BLACK);
  drawTopBar();

  // Dupa trimitere ramanem pe acelasi ecran cateva secunde cu confirmarea
  // la vedere - altfel arbitrul nu are de unde sti daca a plecat nota.
  if (submittedShown) {
    gfx->setTextSize(2);
    gfx->setTextColor(WHITE);
    drawWrapped(8, 34, 20, 19, liveCompetitorName);

    gfx->setTextSize(4);
    gfx->setTextColor(GREEN);
    gfx->setCursor(30, 88);
    gfx->print("TRIMIS");

    bool cut = revealKnown &&
               ((strcmp(revealMark, "low") == 0) || (strcmp(revealMark, "high") == 0));

    // Nota, la dimensiunea 6: fiecare caracter are 36px latime si 48
    // inaltime. Le calculam ca sa putem trage linia exact peste cifre,
    // oricate ar fi.
    int digits   = (submittedScore >= 100) ? 3 : (submittedScore >= 10 ? 2 : 1);
    int charW    = 36;
    int scoreX   = (submittedScore == MAX_SCORE) ? 60 : 78;
    int scoreY   = 142;
    int scoreW   = digits * charW - 6;   // ultima coloana a fontului e spatiu
    int scoreH   = 48;

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
      gfx->setCursor(8, 200);
      if (cut) gfx->print(strcmp(revealMark, "low") == 0 ? "cea mai mica" : "cea mai mare");
      else     gfx->print("A CONTAT");

      gfx->setTextSize(1);
      gfx->setTextColor(LIGHTGRAY);
      gfx->setCursor(8, 228);
      gfx->print("Total sportiv: ");
      gfx->print(revealTotal);
      return;
    }

    gfx->setTextSize(1);
    gfx->setTextColor(DARKGRAY);
    gfx->setCursor(8, 226);
    gfx->print("Astept urmatorul sportiv");
    return;
  }

  // Istoricul notelor mele din proba asta, sus, peste tot restul. Un
  // arbitru nu noteaza in gol: se raporteaza la ce a dat inainte in
  // aceeasi categorie, si pana acum trebuia sa tina minte singur.
  // Se aseaza pe mai multe randuri, cate incap: un singur rand tinea trei
  // nume si restul probei ramanea nevazuta.
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
  gfx->drawFastHLine(0, historyBottom, 240, DARKGRAY);

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
  gfx->setCursor(draftScore == MAX_SCORE ? 60 : 78, 168);
  gfx->print(draftScore);
}

void redraw() {
  switch (screen) {
    case SCREEN_STATUS:     drawStatusScreen();     break;
    case SCREEN_WIFI_DIAG:  drawWifiDiagScreen();   break;
    case SCREEN_PIN:        drawPinScreen();        break;
    case SCREEN_STANDBY:    drawStandbyScreen();    break;
    case SCREEN_SCORE:      drawScoreScreen();      break;
    case SCREEN_MATCH:
      if (pointState != POINT_NONE)   drawPointOverlay();
      else if (needsFinalDecision())  drawDecisionScreen();
      else if (liveMatchRealTime)     drawMatchScreen();
      else                            drawMatchScoreScreen();
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
    if (WiFi.SSID(i) == WIFI_SSID) {
      scanFoundOurs = true;
      ourChannel = WiFi.channel(i);
    }
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

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - started) < timeoutMs) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool connectWifi() {
  WiFi.onEvent(onWifiEvent);

  drawSplash(20, (String("Conectare la ") + WIFI_SSID).c_str());
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
    statusDetail = String(WIFI_SSID) + " nu se vede. C3 prinde doar 2.4GHz.";
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
  for (int i = 0; i < PIN_DIGITS; i++) pinDigits[i] = '0';
  pinDigits[PIN_DIGITS] = '\0';
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

  pinMode(ENCODER_CLK, INPUT_PULLUP);
  pinMode(ENCODER_DT,  INPUT_PULLUP);
  pinMode(ENCODER_SW,  INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_CLK), onEncoderTurn,   FALLING);
  attachInterrupt(digitalPinToInterrupt(ENCODER_SW),  onButtonChange, CHANGE);

  for (int i = 0; i < 4; i++) {
    pinMode(pointButtons[i].pin, INPUT_PULLUP);
    attachInterruptArg(digitalPinToInterrupt(pointButtons[i].pin),
                       onPointButton, &pointButtons[i], FALLING);
  }

  gfx->begin();
  drawSplash(5, "Pornire...");

  startSession();
}

void loop() {
  int delta = readEncoderDelta();
  ButtonEvent button = readButton();

  // Ceasul si starea WiFi din bara de sus, o data pe secunda, fara sa
  // redesenam tot ecranul sub degetul arbitrului.
  if (millis() - lastTopBarDraw >= 1000) {
    lastTopBarDraw = millis();
    drawTopBar();
  }

  // Cat suntem in sesiune, urmarim masa centrala. Si pe ecranul de nota:
  // daca a trecut la alt sportiv, dispozitivul trebuie sa il urmeze, nu
  // sa ramana cu cine tocmai a iesit de pe saltea.
  if ((screen == SCREEN_STANDBY || screen == SCREEN_SCORE || screen == SCREEN_MATCH) &&
      (millis() - lastPoll >= POLL_MS) && !userIsBusy()) {
    lastPoll = millis();
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
    // teren, dispozitivul trece pe butoane, oricat de recenta ar fi
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
  if (screen == SCREEN_STANDBY || screen == SCREEN_SCORE || screen == SCREEN_MATCH) {
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

  // Apasarile de punctaj, scoase din coada si trimise. Se trimit doar
  // pe ecranul de meci si doar in repriza activa - aceeasi regula ca in
  // aplicatia din telefon, unde butoanele sunt stinse in pauza. O
  // apasare venita in alt moment se arunca in tacere: mai bine niciun
  // punct decat unul intr-o repriza care nu curge.
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

  int pressed;
  while (takePress(&pressed)) {
    if (screen != SCREEN_MATCH) continue;

    // Meciul s-a terminat: butoanele nu mai dau puncte, aleg castigatorul.
    // Prima apasare armeaza culoarea, a doua o trimite. O apasare
    // singura nu decide nimic - decizia e ireversibila de pe placa, iar
    // serverul o mai accepta doar daca o sterge masa centrala.
    if (needsFinalDecision()) {
      if (finalDecided) continue;
      bool wantRed = pointButtons[pressed].isRed;

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
      continue;
    }
    // Apasare in pauza sau intre reprize. Regula e a competitiei, nu a
    // noastra - dar arbitrul trebuie sa afle ca punctul n-a plecat, nu
    // sa presupuna ca a intrat.
    if (!canScoreNow()) {
      pointSideRed = pointButtons[pressed].isRed;
      pointValue   = pointButtons[pressed].points;
      pointState   = POINT_CLOSED;
      pointShownAt = millis();
      redraw();
      continue;
    }
    if (liveMatchRealTime) sendPoint(pointButtons[pressed].isRed, pointButtons[pressed].points);
    else                   addRoundPoint(pointButtons[pressed].isRed, pointButtons[pressed].points);
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
  // asteptarea mai mult. Daca al doilea arbitru n-a apasat in patru
  // secunde, punctul nu se mai valideaza si arbitrul trebuie sa vada din
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

  switch (screen) {
    case SCREEN_STATUS:
      // Orice apasare reia: daca WiFi-ul e in regula ne intoarce la PIN,
      // daca nu, incearca din nou conexiunea.
      if (button == BTN_SHORT || button == BTN_LONG) {
        if (WiFi.status() == WL_CONNECTED) askForPin();
        else startSession();
      }
      break;

    case SCREEN_WIFI_DIAG:
      if (button == BTN_SHORT || button == BTN_LONG) startSession();
      break;

    case SCREEN_PIN:
      if (delta) {
        int digit = (pinDigits[pinCursor] - '0' + delta + 10) % 10;
        pinDigits[pinCursor] = '0' + digit;
        redraw();
      }
      if (button == BTN_SHORT) {
        if (pinCursor < PIN_DIGITS - 1) { pinCursor++; redraw(); }
        else submitPin();
      }
      if (button == BTN_LONG && pinCursor > 0) { pinCursor--; redraw(); }
      break;

    case SCREEN_STANDBY:
      // Nimic de rotit sau de confirmat aici. Apasarea lunga preda
      // dispozitivul: urmatorul arbitru isi formeaza propriul PIN.
      if (button == BTN_LONG) askForPin();
      break;

    case SCREEN_MATCH:
      // Encoderul nu puncteaza la lupte - doar butoanele. Ii lasam insa
      // apasarea lunga, ca peste tot: iesirea din tura.
      if (button == BTN_LONG) askForPin();
      break;

    case SCREEN_SCORE:
      // Cat timp confirmarea e pe ecran, butonul nu mai face nimic:
      // nota e data. Se deblocheaza singur cand masa centrala aduce
      // urmatorul sportiv.
      if (delta && !submittedShown) {
        draftScore += delta;
        if (draftScore < 0)         draftScore = 0;
        if (draftScore > MAX_SCORE) draftScore = MAX_SCORE;
        redraw();
      }
      if (button == BTN_SHORT && !submittedShown) submitCurrentScore();
      if (button == BTN_LONG) askForPin();
      break;
  }
}
