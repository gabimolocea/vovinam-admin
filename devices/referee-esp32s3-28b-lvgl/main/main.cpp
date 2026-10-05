// Ecranul de PIN in LVGL, ca masuratoare.
//
// Intrebarea la care raspunde: incape LVGL in banda ramasa dupa ce panoul
// RGB isi ia partea lui din PSRAM?
//
// Panoul citeste 40 MB/s continuu, fara pauza, si asta nu depinde de cine
// deseneaza. LVGL adauga peste trafic de SCRIERE. Daca suma depaseste ce poate
// da memoria in timp ce lucreaza si radioul, improspatarea scade - si se vede
// in linia HZ, nu in impresii.
//
// De-aia exista fisierul asta in loc sa fi rescris direct toata interfata:
// dupa un ecran stim cifra, nu dupa opt sute de linii.
//
// ───────────────────────────── CUM E LEGAT ─────────────────────────────
//
// LVGL deseneaza DIRECT in memoria panoului, fara tampon intermediar si fara
// copiere (`direct_mode`). E aceeasi arhitectura ca firmware-ul cu
// Arduino_GFX: peripheralul RGB baleiaza exact memoria in care tocmai s-a
// desenat. Alternativa - tampoane proprii plus un memcpy la fiecare flush -
// ar adauga inca o trecere peste 600KB, adica exact traficul pe care il
// masuram. Daca LVGL nu incape nici asa, nu incape deloc.
//
// Singurul lucru care NU se poate sari: scrierea cache-ului in PSRAM dupa
// desen. Procesorul scrie in cache, GDMA-ul panoului citeste PSRAM direct,
// ocolindu-l. Fara `ecranSincronizeaza()` panoul vede pixeli vechi amestecati
// cu cei noi. Aceeasi lectie ca in firmware-ul de productie.

#include <Arduino.h>
#include <WiFi.h>
#include "lvgl.h"

#include "ecran.h"
#include "reglaje.h"
#include "Display_ST7701.h"
#include "Touch_GT911.h"

// Aceeasi retea ca firmware-ul adevarat: masuram cu radioul lucrand, altfel
// masuram altceva decat ne intereseaza.
static const char* WIFI_SSID = "Zignative2";
static const char* WIFI_PASS = "Rrdspider1";

static lv_disp_draw_buf_t  tampoane;
static lv_disp_drv_t       driverEcran;
static lv_indev_drv_t      driverAtingere;

// ───────────────────────────── ECRANUL ─────────────────────────────

// Cu doua memorii de ecran, desenul se face in cea pe care panoul NU o
// citeste, iar esp_lcd_panel_draw_bitmap le schimba intre ele la urmatorul
// VSYNC. Asa nu se mai poate vedea jumatate de cadru vechi si jumatate nou -
// ruperea pe care o vezi cand redesenezi peste memoria baleiata chiar atunci.
//
// Cu o singura memorie ramane vechea cale: scrii cache-ul si atat, ruperea e
// pretul. Tinem ambele fiindca firmware-ul de productie merge pe una singura,
// unde desenul e rar si partial, si n-are rost sa plateasca 600KB degeaba.
static bool               douaMemorii = false;
static SemaphoreHandle_t  semVsync    = nullptr;

static void trimiteLaPanou(lv_disp_drv_t* drv, const lv_area_t* zona, lv_color_t* pixeli) {
  if (douaMemorii) {
    // Cerem schimbarea. Apelul se intoarce imediat; panoul o face la VSYNC.
    esp_lcd_panel_draw_bitmap(panel_handle, 0, 0, ECRAN_LAT, ECRAN_INAL, pixeli);
    // Si o asteptam. Fara asta LVGL ar porni urmatorul desen in memoria pe
    // care panoul inca o baleiaza, si dubla memorare n-ar mai apara de nimic.
    // Timeout-ul e o plasa: la 46.8Hz un cadru dureaza 21ms.
    xSemaphoreTake(semVsync, pdMS_TO_TICKS(100));
  } else {
    // `pixeli` E chiar memoria panoului: nu avem ce copia, doar de scris
    // cache-ul ca peripheralul sa poata citi.
    ecranSincronizeaza();
  }
  lv_disp_flush_ready(drv);
}

// ──────────────────────────── ATINGERILE ────────────────────────────

// Cat dureaza un desen si cat de mare e. LVGL cheama asta dupa fiecare
// improspatare, cu timpul si numarul de pixeli refacuti.
//
// De aici se vede direct daca problema e sincronizarea sau pur si simplu
// durata: la 46.8Hz un cadru are 21ms. Un desen care trece de atat pierde
// cadre, si pierderea de cadre arata exact ca tremuratul - dar se repara din
// stilul interfetei, nu din panou.
static void masoaraDesenul(lv_disp_drv_t* drv, uint32_t ms, uint32_t pixeli) {
  Serial.printf("DESEN %ums %upx (%.0f%% din ecran, %s cadru de 21ms)\n",
                (unsigned)ms, (unsigned)pixeli,
                100.0f * pixeli / (ECRAN_LAT * ECRAN_INAL),
                ms > 21 ? "PESTE" : "sub");
}

static void citesteAtingerea(lv_indev_drv_t* drv, lv_indev_data_t* date) {
  // Doua apeluri, in ordinea asta, si nu e redundanta: Touch_Read_Data()
  // intreaba cipul, Touch_Get_XY() doar citeste ce-a adus.
  Touch_Read_Data();
  uint16_t px[5], py[5], forta[5];
  uint8_t  degete = 0;
  Touch_Get_XY(px, py, forta, &degete, 5);

  if (degete > 0) {
    date->state   = LV_INDEV_STATE_PRESSED;
    date->point.x = px[0];
    date->point.y = py[0];
  } else {
    date->state = LV_INDEV_STATE_RELEASED;
  }
}

// ──────────────────────────── INTERFATA ────────────────────────────

static lv_obj_t* casute[5];
static char      pin[6] = "";

static void arataPin() {
  for (int i = 0; i < 5; i++) {
    lv_label_set_text(lv_obj_get_child(casute[i], 0), i < (int)strlen(pin) ? "*" : "");
    lv_obj_set_style_border_color(casute[i],
        i == (int)strlen(pin) ? lv_palette_main(LV_PALETTE_BLUE) : lv_color_hex(0x8410),
        0);
  }
}

// Douasprezece butoane separate, nu o matrice.
//
// MASURAT: cu lv_btnmatrix, fiecare apasare redesena 63-75% din ecran -
// 193.500 pixeli din 307.200. Matricea e UN singur obiect de 440x420, si cand
// se schimba starea unei taste LVGL invalideaza tot obiectul, nu tasta. Cu
// butoane separate se invalideaza doar butonul apasat: ~7% din ecran, cifra
// care aparuse o singura data in masuratoare, cand se schimbase ceva mic.
//
// Nu e o optimizare prematura. 400KB scrisi la fiecare cifra, urmati de
// asteptarea VSYNC, se vedeau cu ochiul liber ca tremurat la fiecare apasare.
static const char* etichete[12] = {"1","2","3","4","5","6","7","8","9",
                                   LV_SYMBOL_LEFT,"0","OK"};

static void laApasare(lv_event_t* e) {
  const char* text = (const char*)lv_event_get_user_data(e);
  if (!text) return;

  size_t n = strlen(pin);
  if (!strcmp(text, LV_SYMBOL_LEFT)) {
    if (n) pin[n - 1] = '\0';
  } else if (!strcmp(text, "OK")) {
    pin[0] = '\0';
  } else if (n < 5) {
    pin[n] = text[0];
    pin[n + 1] = '\0';
  }
  arataPin();
}

static void construiesteEcranul() {
  lv_obj_t* s = lv_scr_act();
  lv_obj_set_style_bg_color(s, lv_color_hex(0x172642), 0);   // navy FRVV

  lv_obj_t* titlu = lv_label_create(s);
  lv_label_set_text(titlu, "PIN ARBITRU");
  lv_obj_set_style_text_color(titlu, lv_color_hex(0xEDB654), 0);   // auriu FRVV
  lv_obj_set_style_text_font(titlu, &lv_font_montserrat_28, 0);
  lv_obj_align(titlu, LV_ALIGN_TOP_MID, 0, 24);

  // Cele cinci casute de cifra.
  for (int i = 0; i < 5; i++) {
    casute[i] = lv_obj_create(s);
    lv_obj_set_size(casute[i], 70, 80);
    lv_obj_set_pos(casute[i], 22 + i * 88, 86);
    lv_obj_set_style_bg_color(casute[i], lv_color_hex(0x0E1A2E), 0);
    lv_obj_set_style_border_width(casute[i], 3, 0);
    lv_obj_set_style_radius(casute[i], 6, 0);
    lv_obj_clear_flag(casute[i], LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* steluta = lv_label_create(casute[i]);
    lv_label_set_text(steluta, "");
    lv_obj_set_style_text_color(steluta, lv_color_white(), 0);
    lv_obj_set_style_text_font(steluta, &lv_font_montserrat_48, 0);
    lv_obj_center(steluta);
  }

  // Tastatura. Tintele sunt mari dinadins: pe saltea se apasa fara sa te uiti.
  for (int i = 0; i < 12; i++) {
    lv_obj_t* b = lv_btn_create(s);
    lv_obj_set_size(b, 140, 98);
    lv_obj_set_pos(b, 20 + (i % 3) * 150, 200 + (i / 3) * 108);
    lv_obj_set_style_bg_color(b, lv_color_hex(0x24405F), 0);
    lv_obj_set_style_radius(b, 6, 0);
    lv_obj_add_event_cb(b, laApasare, LV_EVENT_CLICKED, (void*)etichete[i]);

    lv_obj_t* t = lv_label_create(b);
    lv_label_set_text(t, etichete[i]);
    lv_obj_set_style_text_font(t, &lv_font_montserrat_28, 0);
    lv_obj_set_style_text_color(t, lv_color_white(), 0);
    lv_obj_center(t);
  }

  arataPin();
}

// ────────────────────────────── PORNIRE ──────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.setTxTimeoutMs(0);
  delay(400);
  Serial.println();
  Serial.printf("=== Spike LVGL 2.8B, compilat %s %s ===\n", __DATE__, __TIME__);

  reglajeIncarca();
  if (!ecranPorneste()) {
    Serial.println("Panoul nu a pornit. Fara el nu e nimic de masurat.");
    return;
  }
  reglajeRaport();

  lv_init();

  // Memoria panoului ca tampon de desen al LVGL: `direct_mode` inseamna ca
  // LVGL deseneaza chiar acolo, fara tampon propriu si fara copiere.
  void* fb1 = nullptr;
  void* fb2 = nullptr;
  douaMemorii = (rg.numFb >= 2) &&
                esp_lcd_rgb_panel_get_frame_buffer(panel_handle, 2, &fb1, &fb2) == ESP_OK;
  if (!douaMemorii) {
    esp_lcd_rgb_panel_get_frame_buffer(panel_handle, 1, &fb1);
    fb2 = nullptr;
  }
  Serial.printf("LVGL: mod direct, %s de ecran\n",
                douaMemorii ? "doua memorii" : "o singura memorie");
  if (douaMemorii) {
    semVsync = xSemaphoreCreateBinary();
    reglajeSemaforVsync = semVsync;   // de aici incolo, fiecare cadru il da
  }

  lv_disp_draw_buf_init(&tampoane, (lv_color_t*)fb1, (lv_color_t*)fb2,
                        ECRAN_LAT * ECRAN_INAL);

  lv_disp_drv_init(&driverEcran);
  driverEcran.hor_res     = ECRAN_LAT;
  driverEcran.ver_res     = ECRAN_INAL;
  driverEcran.flush_cb    = trimiteLaPanou;
  driverEcran.draw_buf    = &tampoane;
  driverEcran.direct_mode = 1;
  driverEcran.monitor_cb  = masoaraDesenul;
  lv_disp_drv_register(&driverEcran);

  lv_indev_drv_init(&driverAtingere);
  driverAtingere.type    = LV_INDEV_TYPE_POINTER;
  driverAtingere.read_cb = citesteAtingerea;
  lv_indev_drv_register(&driverAtingere);

  construiesteEcranul();
  Set_Backlight(100);

  // Radioul, ultimul: masuram cu el lucrand.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(rg.wifiSleep);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.println("Ma conectez la WiFi...");
}

// Comenzile de panou, prin cablu. Fara asta reglajele din reglaje.cpp exista
// dar nu se pot schimba - exact ce am patit cu FB=2, care pleca spre o placa
// ce nu asculta.
static void citesteComenzi() {
  static String linie;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (linie.length() < 200) linie += c;
      continue;
    }
    linie.trim();
    if (linie.length() && !reglajeComanda(linie)) {
      Serial.println("EROARE comanda necunoscuta "
                     "(PANOU? / PCLK=n / FB=n / EDGE=n / PSLEEP=n / REPORNESTE)");
    }
    linie = "";
  }
}

void loop() {
  citesteComenzi();

  // Ceasul LVGL, explicit. Componentul poate fi configurat sa si-l ia singur
  // din esp_timer, dar atunci depinde de o optiune de Kconfig care se poate
  // schimba sub noi; aici se vede ce se intampla.
  static unsigned long ultimulTick = 0;
  unsigned long acum = millis();
  lv_tick_inc(acum - ultimulTick);
  ultimulTick = acum;

  lv_timer_handler();
  delay(5);

  static unsigned long ultimulHz = 0;
  if (millis() - ultimulHz >= 5000) {
    ultimulHz = millis();
    float hz = reglajeHz();
    if (hz > 0) {
      Serial.printf("HZ %.1f (teoretic %.1f) rssi=%d liberPsram=%u liberIntern=%u\n",
                    hz, reglajeHzTeoretic(),
                    WiFi.isConnected() ? WiFi.RSSI() : 0,
                    (unsigned)ESP.getFreePsram(),
                    (unsigned)ESP.getFreeHeap());
    }
  }
}
