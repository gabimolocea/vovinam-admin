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
#include <time.h>

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

const char* NTP_SERVER = "pool.ntp.org";
const char* TZ_INFO    = "EET-2EEST,M3.5.0/3,M10.5.0/4";

// Cat de des intrebam masa centrala ce are pe ecran. E o singura cerere
// de ~500 de octeti, dar in sala sunt zeci de dispozitive pe acelasi
// WiFi si acelasi server - doua secunde sunt destul de prompte pentru un
// om care tocmai a intrat pe saltea.
const unsigned long POLL_MS         = 1000;
const unsigned long PRESENCE_MS     = 20000;
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
const char* FW_VERSION = "v14";

// ───────────────────────────── HARDWARE ─────────────────────────────

#define TFT_DC    8
#define TFT_RST  10
#define TFT_MOSI  6
#define TFT_SCLK  4

#define ENCODER_CLK 7
#define ENCODER_DT  3
#define ENCODER_SW  5

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

Arduino_DataBus *bus = new Arduino_ESP32SPI(TFT_DC, -1, TFT_SCLK, TFT_MOSI, -1);
Arduino_GFX *gfx = new Arduino_ST7789(bus, TFT_RST, 0, true, 240, 240);

// ─────────────────────────── STARE APLICATIE ───────────────────────────

enum Screen {
  SCREEN_STATUS,      // pornire, erori, reconectare
  SCREEN_WIFI_DIAG,   // ce retele vede placa, cand nu prinde WiFi
  SCREEN_PIN,         // arbitrul isi formeaza PIN-ul
  SCREEN_STANDBY,     // conectat, astept sa fiu pus pe o categorie
  SCREEN_SCORE        // sportivul e pe saltea: rotesti nota si o trimiti
};

// Sus, nu langa readButton(): Arduino genereaza singur prototipurile
// functiilor si le pune imediat dupa #include-uri, deci orice tip folosit
// intr-o semnatura trebuie sa existe inainte de prima functie.
enum ButtonEvent { BTN_NONE, BTN_SHORT, BTN_LONG };

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
unsigned long liveUpdatedAt = 0;  // cat de recenta e sesiunea aleasa

// Ultimele note date de mine in categoria curenta, cea mai recenta prima.
// Un arbitru nu noteaza in gol: se raporteaza la ce a dat inainte in
// aceeasi proba, si pana acum trebuia sa tina minte.
#define MAX_HISTORY 4
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

// O singura incercare. Intoarce codul HTTP, sau unul negativ de la
// HTTPClient / de-al nostru (-20 fara WiFi, -21 raspuns neparsabil).
int apiRequestOnce(const char* method, const String& path, const String& body,
                   JsonDocument& out, JsonDocument* filter) {
  if (WiFi.status() != WL_CONNECTED) return -20;

  HTTPClient http;
  String url = apiBase + path;
  if (!http.begin(url)) return -4;

  http.setTimeout(httpTimeoutMs);
  http.setConnectTimeout(httpTimeoutMs);
  // Django/gunicorn raspund chunked, iar parsarea din stream nu se
  // impaca cu asta; HTTP/1.0 cere raspunsul intreg, cu Content-Length.
  http.useHTTP10(true);

  if (accessToken.length()) http.addHeader("Authorization", "Bearer " + accessToken);
  if (body.length())        http.addHeader("Content-Type", "application/json");

  unsigned long startedAt = millis();
  int code = (strcmp(method, "POST") == 0) ? http.POST(body) : http.GET();

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
      http.end();
      return -21;
    }
  }

  http.end();
  Serial.printf("%s %s -> %d in %lums (%d octeti, RSSI %d, heap %u)\n",
                method, path.c_str(), code, millis() - startedAt,
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

  setStatus("CAUT SERVERUL", String(API_HOST) + " nu raspunde, caut dupa nume...", false);
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
    int score = (int)roundf(item["score"] | 0.0f);
    if (id && id == athleteId) mySubmittedScore = score;

    if (historyCount < MAX_HISTORY) {
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

  int  foundCategory = 0, foundAthlete = 0, foundScoreId = 0;
  bool foundTeam = false;
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
    const char* st = item["status"] | "idle";
    if (!categoryId || strcmp(st, "idle") == 0) continue;
    if (!isMyCategory(categoryId)) continue;   // terenul altui arbitru

    // Marcajele de timp vin ISO-8601 in UTC, deci se compara ca text.
    const char* stamp = item["updated_at"] | "";
    if (foundCategory && strcmp(stamp, bestStamp) <= 0) continue;
    bestStamp = stamp;

    foundCategory     = categoryId;
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

  bool changed = (foundCategory != liveCategoryId) || (foundAthlete != liveAthleteId);

  liveCategoryId     = foundCategory;
  liveAthleteId      = foundAthlete;
  liveAthleteScoreId = foundScoreId;
  liveIsTeam         = foundTeam;
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

  strlcpy(liveRefPosition, myPositionIn(foundCategory), sizeof(liveRefPosition));

  if (changed) {
    // Sportiv nou pe saltea: pornim de la nota deja trimisa daca exista
    // (o corectura e mai des o ajustare mica), altfel de la maxim.
    apiLoadMyScores(liveCategoryId, liveAthleteId);
    draftScore = (mySubmittedScore >= 0) ? mySubmittedScore : MAX_SCORE;
    submittedShown = false;   // sportiv nou, confirmarea celui dinainte nu mai are ce cauta
  }
  return changed;
}

void apiPingPresence(int categoryId) {
  if (!myAthleteId) return;
  JsonDocument body;
  body["category"] = categoryId;
  body["referee"]  = myAthleteId;
  String payload;
  serializeJson(body, payload);

  JsonDocument res;
  apiRequest("POST", "/referee-presence/", payload, res, nullptr);
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

String clockText() {
  struct tm t;
  if (!getLocalTime(&t)) return "--:--";
  char buf[8];
  strftime(buf, sizeof(buf), "%H:%M", &t);
  return String(buf);
}

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
  // privire, daca dispozitivul e pe locul potrivit. Pana e ceva pe
  // saltea, ceasul e mai util decat un spatiu gol.
  gfx->setCursor(186, 9);
  if (liveFieldName[0] || liveRefPosition[0]) {
    gfx->setTextColor(YELLOW);
    gfx->print(liveFieldName);
    if (liveFieldName[0] && liveRefPosition[0]) gfx->print("|");
    gfx->print(liveRefPosition);
  } else {
    gfx->setTextColor(LIGHTGRAY);
    gfx->print(clockText());
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

    gfx->setTextSize(6);
    gfx->setTextColor(WHITE);
    gfx->setCursor(submittedScore == MAX_SCORE ? 60 : 78, 142);
    gfx->print(submittedScore);

    gfx->setTextSize(1);
    gfx->setTextColor(DARKGRAY);
    gfx->setCursor(8, 226);
    gfx->print("Astept urmatorul sportiv");
    return;
  }

  // Istoricul notelor mele din proba asta, sus, peste tot restul. Un
  // arbitru nu noteaza in gol: se raporteaza la ce a dat inainte in
  // aceeasi categorie, si pana acum trebuia sa tina minte singur.
  gfx->setTextSize(1);
  if (historyCount == 0) {
    gfx->setTextColor(DARKGRAY);
    gfx->setCursor(8, 33);
    gfx->print("Primul notat din aceasta proba");
  } else {
    int x = 8;
    for (int i = 0; i < historyCount && x < 230; i++) {
      gfx->setTextColor(LIGHTGRAY);
      gfx->setCursor(x, 33);
      gfx->print(history[i].name);
      x += strlen(history[i].name) * 6 + 3;
      gfx->setTextColor(WHITE);
      gfx->setCursor(x, 33);
      gfx->print(history[i].score);
      x += (history[i].score >= 100 ? 3 : 2) * 6 + 8;
    }
  }
  gfx->drawFastHLine(0, 45, 240, DARKGRAY);

  // Cine e pe saltea - partea care conteaza, cat de mare incape.
  gfx->setTextSize(2);
  gfx->setTextColor(liveIsTeam ? YELLOW : WHITE);
  int afterName = drawWrapped(8, 54, 20, 19, liveCompetitorName);

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
  gfx->setCursor(draftScore == MAX_SCORE ? 60 : 78, 130);
  gfx->print(draftScore);

  gfx->drawRect(20, 194, 200, 10, DARKGRAY);
  gfx->fillRect(21, 195, (198 * draftScore) / MAX_SCORE, 8, BLUE);

  gfx->setTextSize(1);
  gfx->setTextColor(LIGHTGRAY);
  gfx->setCursor(8, 216);
  gfx->println("Roteste: nota");
  gfx->setCursor(8, 230);
  gfx->println("Apasa: trimite   Lung: iesire");
}

void redraw() {
  switch (screen) {
    case SCREEN_STATUS:     drawStatusScreen();     break;
    case SCREEN_WIFI_DIAG:  drawWifiDiagScreen();   break;
    case SCREEN_PIN:        drawPinScreen();        break;
    case SCREEN_STANDBY:    drawStandbyScreen();    break;
    case SCREEN_SCORE:      drawScoreScreen();      break;
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

  setStatus(String("CONECTARE ") + FW_VERSION, String("WiFi: ") + WIFI_SSID, false);
  if (attemptConnect(false, 15000)) {
    configTzTime(TZ_INFO, NTP_SERVER);
    return true;
  }

  // A doua incercare cu emisie redusa: daca asta trece iar prima nu,
  // problema e alimentarea placii, nu reteaua.
  setStatus("REINCERC", "Cu putere de emisie redusa...", false);
  if (attemptConnect(true, 15000)) {
    configTzTime(TZ_INFO, NTP_SERVER);
    Serial.println("Conectat abia cu putere redusa - verifica alimentarea placii.");
    return true;
  }

  // A esuat de doua ori: nu spune doar "fara WiFi", arata de ce.
  wl_status_t st = WiFi.status();
  setStatus("SE VERIFICA", "Caut retelele din jur...", false);
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
  accessToken = "";
  refereeName = "";
  myAthleteId = 0;
  screen = SCREEN_PIN;
  redraw();
}

// Pornire: WiFi, serverul, apoi ecranul de PIN. Nu se stie inca cine e
// arbitrul - exact asta e ideea, dispozitivul nu e al nimanui pana nu
// formeaza cineva PIN-ul lui.
void startSession() {
  if (!connectWifi()) return;

  setStatus("SE CAUTA", "Serverul din sala...", false);
  if (!locateServer()) {
    setStatus(
      "FARA SERVER",
      String("Nu raspunde ") + serverLabel + ". Verifica IP-ul din launcher.",
      true
    );
    return;
  }

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

  pinMode(ENCODER_CLK, INPUT_PULLUP);
  pinMode(ENCODER_DT,  INPUT_PULLUP);
  pinMode(ENCODER_SW,  INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENCODER_CLK), onEncoderTurn,   FALLING);
  attachInterrupt(digitalPinToInterrupt(ENCODER_SW),  onButtonChange, CHANGE);

  gfx->begin();
  gfx->fillScreen(BLACK);

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
  if ((screen == SCREEN_STANDBY || screen == SCREEN_SCORE) &&
      (millis() - lastPoll >= POLL_MS) && !userIsBusy()) {
    lastPoll = millis();
    bool changed = pollMonitor();

    Screen want = (liveCategoryId && (liveAthleteId || liveCompetitorName[0]))
                  ? SCREEN_SCORE : SCREEN_STANDBY;
    if (want != screen) {
      screen = want;
      redraw();
    } else if (changed) {
      redraw();
    }

    if (liveCategoryId && (millis() - lastPresence >= PRESENCE_MS)) {
      lastPresence = millis();
      apiPingPresence(liveCategoryId);
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
