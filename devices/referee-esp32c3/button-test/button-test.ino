// Test pentru patru butoane pe ESP32-C3 SuperMini.
//
// Sketch separat, nu atinge firmware-ul de arbitraj. Raspunde la o
// singura intrebare: butoanele sunt cablate bine si placa le vede?
//
// ATENTIE la pini: GPIO20 si GPIO21 sunt UART0 (RX/TX) pe C3. Sunt
// liberi doar pentru ca C3 are USB nativ si `Serial` merge pe USB -
// deci programeaza cu "USB CDC On Boot: Enabled". Fara setarea aia,
// consola ar folosi exact pinii pe care stau butoanele.

#include <Arduino_GFX_Library.h>

// Aceiasi pini de display ca in firmware-ul de arbitraj.
#define TFT_DC    8
#define TFT_RST  10
#define TFT_MOSI  6
#define TFT_SCLK  4

// GPIO0 si GPIO1 sunt libere si curate pe C3. Evita 2, 8 si 9: sunt
// pini de strapping, iar un buton apasat la pornire pe unul din ei
// baga placa in alt mod de boot.
#define BTN_1_PIN 20
#define BTN_2_PIN 21
#define BTN_3_PIN  0
#define BTN_4_PIN  1

// Cat de repede ignoram tranzitiile. Un buton mecanic "sare" cateva
// milisecunde la fiecare apasare; fara filtru, o apasare se numara de
// trei-patru ori si pare ca butonul e defect.
const unsigned long DEBOUNCE_MS = 15;

// Cat timp tinem "APASAT" pe ecran, chiar daca degetul s-a ridicat
// mai devreme. O apasare de 60ms e reala, dar clipeste prea repede ca
// s-o prinzi cu ochiul - si atunci pare ca butonul n-a mers.
const unsigned long MIN_VISIBLE_MS = 150;

#define BLACK     0x0000
#define WHITE     0xFFFF
#define GREEN     0x07E0
#define YELLOW    0xFFE0
#define CYAN      0x07FF
#define DARKGRAY  0x2104
#define LIGHTGRAY 0x8410
#define RED       0xF800
#define BLUE      0x3D7F
#define NAVY      0x1128
#define GOLD      0xEDAA

Arduino_DataBus *bus = new Arduino_ESP32SPI(TFT_DC, -1, TFT_SCLK, TFT_MOSI, -1);
Arduino_GFX *gfx = new Arduino_ST7789(bus, TFT_RST, 0, true, 240, 240);

struct Button {
  const char*            label;
  uint16_t               labelColor;
  uint8_t                pin;
  volatile bool          isDown;
  volatile uint32_t      presses;
  volatile unsigned long lastDurationMs;
  volatile unsigned long downAtMs;
  volatile unsigned long lastEdgeMs;
  volatile unsigned long showDownUntilMs;
  volatile bool          dirty;
  bool                   shownDown;   // ce e pe ecran acum
};

// Ordinea de pe ecran urmeaza colturile de pe saltea: perechea
// rosie sus, perechea albastra jos. Asa se vede dintr-o privire
// daca butonul apasat e cel care trebuie, nu doar daca pinul merge.
Button buttons[4] = {
  { "ROSU +1",     RED,  BTN_1_PIN, false, 0, 0, 0, 0, 0, true, false },
  { "ROSU +2",     RED,  BTN_3_PIN, false, 0, 0, 0, 0, 0, true, false },
  { "ALBASTRU +1", BLUE, BTN_2_PIN, false, 0, 0, 0, 0, 0, true, false },
  { "ALBASTRU +2", BLUE, BTN_4_PIN, false, 0, 0, 0, 0, 0, true, false },
};

const int ROW_Y[4] = { 38, 88, 138, 188 };

// Cat dureaza, la varf, desenarea unui rand si scrierea pe serial.
// Le masuram pentru ca "pare cu intarziere" nu spune unde se duce
// timpul, iar cele doua se repara complet diferit.
unsigned long maxDrawUs = 0;
unsigned long maxSerialUs = 0;
unsigned long lastTimingMs = 0;

// Pe intreruperi, nu prin citire in loop(). In aplicatia reala loop()
// sta blocat in cereri HTTP, iar o apasare citita prin polling se
// pierde acolo fara urma - bug pe care l-am avut deja cu encoderul.
void IRAM_ATTR onButtonEdge(void* arg) {
  Button* b = (Button*) arg;
  unsigned long now = millis();

  if (now - b->lastEdgeMs < DEBOUNCE_MS) return;
  b->lastEdgeMs = now;

  // INPUT_PULLUP: pinul sta sus si cade la masa cand butonul e apasat.
  bool down = (digitalRead(b->pin) == LOW);
  if (down == b->isDown) return;
  b->isDown = down;

  if (down) {
    b->downAtMs = now;
    b->showDownUntilMs = now + MIN_VISIBLE_MS;
  } else {
    b->lastDurationMs = now - b->downAtMs;
    b->presses++;
  }
  b->dirty = true;
}

// Partea care nu se schimba niciodata: o desenam o singura data, la
// pornire. Aici era problema - stergeam 240x46 pixeli pe rand, pe
// toate patru randurile, la fiecare apasare.
void drawRowStatic(const Button& b, int y) {
  gfx->setTextSize(1);
  gfx->setTextColor(b.labelColor);
  gfx->setCursor(6, y + 4);
  gfx->print(b.label);
  gfx->setTextColor(LIGHTGRAY);
  gfx->print("  GPIO");
  gfx->print(b.pin);
}

// Doar campurile care se schimba, si doar pe randul care s-a schimbat.
void drawRowDynamic(const Button& b, int y, bool down) {
  gfx->fillRect(6, y + 18, 84, 16, BLACK);
  gfx->setTextSize(2);
  gfx->setTextColor(down ? GREEN : DARKGRAY);
  gfx->setCursor(6, y + 18);
  gfx->print(down ? "APASAT" : "liber");

  gfx->fillRect(100, y + 22, 136, 10, BLACK);
  gfx->setTextSize(1);
  gfx->setTextColor(CYAN);
  gfx->setCursor(100, y + 22);
  gfx->print(b.presses);
  gfx->print("x");

  gfx->setTextColor(YELLOW);
  gfx->setCursor(160, y + 22);
  gfx->print(b.lastDurationMs);
  gfx->print("ms");
}

void setup() {
  Serial.begin(115200);

  // USB CDC blocheaza scrierea cand gazda nu citeste - implicit
  // asteapta pana la 100ms la fiecare apel. Cu monitorul inchis,
  // fiecare printf adauga exact intarzierea vazuta pe ecran.
  // 0 inseamna "nu astepta": ce nu incape se pierde, si e in
  // regula - logul e pentru diagnostic, ecranul e pentru arbitru.
  Serial.setTxTimeoutMs(0);

  gfx->begin(40000000);
  gfx->fillScreen(BLACK);

  gfx->fillRect(0, 0, 240, 34, NAVY);
  gfx->setTextSize(2);
  gfx->setTextColor(GOLD);
  gfx->setCursor(8, 10);
  gfx->print("BUTOANE");

  for (int i = 0; i < 4; i++) {
    Button& b = buttons[i];
    pinMode(b.pin, INPUT_PULLUP);
    // Starea reala de la pornire, inainte de prima intrerupere: altfel
    // un buton tinut apasat la alimentare apare ca liber.
    b.isDown = (digitalRead(b.pin) == LOW);
    attachInterruptArg(digitalPinToInterrupt(b.pin), onButtonEdge, &b, CHANGE);

    drawRowStatic(b, ROW_Y[i]);
    Serial.printf("%s pe GPIO%d, stare initiala: %s\n",
                  b.label, b.pin, b.isDown ? "APASAT" : "liber");
  }
}

void loop() {
  unsigned long now = millis();

  for (int i = 0; i < 4; i++) {
    Button& b = buttons[i];

    // Afisam "apasat" cat timp chiar e apasat SAU cat mai tine
    // fereastra minima de vizibilitate.
    bool wantDown = b.isDown || (long)(b.showDownUntilMs - now) > 0;

    if (!b.dirty && wantDown == b.shownDown) continue;

    b.dirty = false;
    b.shownDown = wantDown;

    unsigned long t0 = micros();
    drawRowDynamic(b, ROW_Y[i], wantDown);
    unsigned long t1 = micros();
    Serial.printf("%s GPIO%d: %s  apasari=%lu  ultima=%lums\n",
                  b.label, b.pin, b.isDown ? "APASAT" : "liber",
                  (unsigned long) b.presses, b.lastDurationMs);
    unsigned long t2 = micros();

    if (t1 - t0 > maxDrawUs)   maxDrawUs   = t1 - t0;
    if (t2 - t1 > maxSerialUs) maxSerialUs = t2 - t1;
  }

  // Varfurile ultimei jumatati de secunda, in antet. Daca "d" sta
  // mic si "s" sare la zeci de mii, vinovatul e serialul.
  if (now - lastTimingMs >= 500) {
    lastTimingMs = now;
    gfx->fillRect(104, 6, 132, 22, NAVY);
    gfx->setTextSize(1);
    gfx->setTextColor(WHITE);
    gfx->setCursor(104, 8);
    gfx->print("desen ");
    gfx->print(maxDrawUs);
    gfx->print("us");
    gfx->setCursor(104, 18);
    gfx->print("serial ");
    gfx->print(maxSerialUs);
    gfx->print("us");
    maxDrawUs = 0;
    maxSerialUs = 0;
  }

  delay(2);
}
