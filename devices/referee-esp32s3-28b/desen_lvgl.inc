// Interfata cu LVGL: aceleasi ecrane, desenate la rezolutia panoului.
//
// Inclusa din referee-esp32s3-28b.ino cand se compileaza cu -DUI_LVGL, nu
// compilata separat - vezi comentariul de acolo. Perechea ei e desen_gfx.inc,
// si amandoua respecta acelasi contract: redraw(), drawTopBar(), drawSplash(),
// drawStatusScreen(), handleTouch(), uiTick().
//
// ─────────────────── DOUA REGULI, AMANDOUA MASURATE ───────────────────
//
// 1. ECRANELE SE CONSTRUIESC O SINGURA DATA, apoi doar se actualizeaza.
//    redraw() e chemat de douazeci si patru de ori din logica, uneori o data
//    pe secunda. Daca ar reface obiectele de fiecare data, fiecare apel ar
//    insemna un ecran intreg redesenat. Asa, o schimbare de scor atinge o
//    eticheta, si LVGL murdareste doar dreptunghiul ei.
//
// 2. OBIECTE MICI, NU WIDGET-URI MARI COMPUSE. Masurat pe spike: cu
//    lv_btnmatrix, fiecare apasare redesena 63-75% din ecran, fiindca matricea
//    e UN obiect si LVGL invalideaza obiectul intreg. Cu douasprezece butoane
//    separate: 6%. Aceeasi regula se aplica la scor si la sferturile de meci -
//    niciun panou care contine tot.
//
// Instrumentarea din masoaraDesenul() ramane pornita: fiecare desen isi spune
// pe serial cat la suta din ecran a atins. Daca o constructie viitoare incalca
// regula 2, se vede imediat, in cifre.
//
// ───────────────────────── LEGAREA DE PANOU ─────────────────────────
//
// Mod direct pe memoria panoului, doua memorii, si asteptarea VSYNC intre ele.
// Fara asteptare, dubla memorare nu apara de nimic: cererea de schimbare se
// intoarce inainte ca schimbarea sa se fi facut, si desenul urmator porneste
// in memoria pe care panoul inca o baleiaza. Asta se vedea ca tremurat la
// fiecare apasare, si asa s-a reparat.

#include "lvgl.h"
#include <stdarg.h>
#include "esp_cache.h"

// ───────────────────────────── CULORI ─────────────────────────────
#define CL_NAVY    lv_color_hex(0x172642)
#define CL_GOLD    lv_color_hex(0xEDB654)
#define CL_FUNDAL  lv_color_hex(0x0B1220)
#define CL_PANOU   lv_color_hex(0x1C2C48)
#define CL_TEXT    lv_color_white()
#define CL_SLAB    lv_color_hex(0x8899AA)
#define CL_ROSU    lv_color_hex(0xD32F2F)
#define CL_ALBASTRU lv_color_hex(0x1976D2)
#define CL_VERDE   lv_color_hex(0x2E7D32)

static bool                lvglPornit  = false;
static lv_disp_draw_buf_t  tampoane;
static lv_disp_drv_t       drvEcran;
static lv_indev_drv_t      drvAtingere;
static bool                douaMemorii = false;
static SemaphoreHandle_t   semVsync    = nullptr;

// ─────────────────────── PANOUL SI ATINGEREA ───────────────────────

static void lvglTrimite(lv_disp_drv_t* drv, const lv_area_t* zona, lv_color_t* pixeli) {
  if (douaMemorii) {
    // Cache-ul NU se scrie aici, desi pare ca ar trebui.
    //
    // esp_lcd_panel_draw_bitmap() o face singur cand tamponul de desen e
    // chiar o memorie a panoului - cazul nostru - si o face doar pentru
    // randurile schimbate:
    //
    //   cache_sync_start = fbs[idx] + (y_start * h_res) * bpp;
    //   cache_sync_size  = (y_end - y_start) * bytes_per_line;
    //
    // Pusesem aici un msync peste toti cei 614.400 de octeti, la fiecare
    // desen. Era si redundant, si scump: o plimbare prin 600KB de cache
    // exact in timp ce peripheralul citeste aceeasi memorie. Se vedea ca un
    // bruiaj marunt la schimbarile de ecran.
    // Cerem schimbarea; panoul o face la VSYNC. Apelul se intoarce imediat,
    // deci o si asteptam - altfel desenul urmator porneste peste memoria
    // baleiata acum.
    esp_lcd_panel_draw_bitmap(panel_handle, 0, 0, ECRAN_LAT, ECRAN_INAL, pixeli);
    xSemaphoreTake(semVsync, pdMS_TO_TICKS(100));
  } else {
    // `pixeli` E chiar memoria panoului: nimic de copiat, doar de scris
    // cache-ul ca peripheralul sa poata citi.
    ecranSincronizeaza();
  }
  lv_disp_flush_ready(drv);
}

static void lvglCitesteAtingerea(lv_indev_drv_t* drv, lv_indev_data_t* date) {
  // Din starea pe care o tine taskul de atingere, nu din cip: altfel ar fi
  // doi stapani pe aceeasi magistrala I2C. Vezi touchTask().
  if (touchApasat) {
    date->state   = LV_INDEV_STATE_PRESSED;
    date->point.x = touchX;
    date->point.y = touchY;
  } else {
    date->state = LV_INDEV_STATE_RELEASED;
  }
}

static void lvglMasoaraDesenul(lv_disp_drv_t* drv, uint32_t ms, uint32_t pixeli) {
  // Numarul de pixeli e cel care conteaza. Timpul iese zero fiindca ceasul
  // LVGL il avansam o data pe bucla, deci nu se misca in timpul unui desen.
  float procent = 100.0f * pixeli / (ECRAN_LAT * ECRAN_INAL);
  if (procent > 25) {
    Serial.printf("DESEN %upx (%.0f%% din ecran) - peste pragul de 25%%, "
                  "cauta widget-ul mare\n", (unsigned)pixeli, procent);
  }
}

// ──────────────────── SCRIE DOAR CE S-A SCHIMBAT ────────────────────
//
// LVGL invalideaza la fiecare set_text si la fiecare set_style, chiar daca
// valoarea e aceeasi. Bara de sus se rescrie o data pe secunda cu acelasi
// nume de arbitru si acelasi teren; fara verificarea de aici, aia inseamna un
// desen pe secunda degeaba - masurat, 29% din ecran.
//
// Nu e o optimizare, e corectitudine: o interfata care nu s-a schimbat nu are
// ce redesena.

static void pune(lv_obj_t* et, const char* text) {
  if (!et || !text) return;
  const char* vechi = lv_label_get_text(et);
  if (vechi && strcmp(vechi, text) == 0) return;
  lv_label_set_text(et, text);
}

static void puneFmt(lv_obj_t* et, const char* fmt, ...) {
  char t[128];
  va_list ap; va_start(ap, fmt); vsnprintf(t, sizeof(t), fmt, ap); va_end(ap);
  pune(et, t);
}

static void puneCuloareText(lv_obj_t* o, lv_color_t c) {
  if (!o) return;
  if (lv_obj_get_style_text_color(o, LV_PART_MAIN).full == c.full) return;
  lv_obj_set_style_text_color(o, c, 0);
}

static void puneFundal(lv_obj_t* o, lv_color_t c) {
  if (!o) return;
  if (lv_obj_get_style_bg_color(o, LV_PART_MAIN).full == c.full) return;
  lv_obj_set_style_bg_color(o, c, 0);
}

// ───────────────────────────── BARA DE SUS ─────────────────────────────

struct BaraSus {
  lv_obj_t* fundal;
  lv_obj_t* semnal;    // cat de tare prinde reteaua, in dBm
  lv_obj_t* mijloc;    // numele arbitrului, terenul si pozitia
  lv_obj_t* dreapta;   // cat a durat ultima cerere catre server
};

static BaraSus faBara(lv_obj_t* parinte) {
  BaraSus b;
  b.fundal = lv_obj_create(parinte);
  lv_obj_set_size(b.fundal, ECRAN_LAT, 40);
  lv_obj_set_pos(b.fundal, 0, 0);
  puneFundal(b.fundal, CL_PANOU);
  lv_obj_set_style_border_width(b.fundal, 0, 0);
  lv_obj_set_style_radius(b.fundal, 0, 0);
  lv_obj_set_style_pad_all(b.fundal, 0, 0);
  lv_obj_clear_flag(b.fundal, LV_OBJ_FLAG_SCROLLABLE);
  // Bara preda dispozitivul. Pe toata latimea, ca pe interfata veche.
  lv_obj_add_flag(b.fundal, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(b.fundal, [](lv_event_t*) { actCerePredare(); },
                      LV_EVENT_CLICKED, nullptr);

  // Cat de tare prinde reteaua. Nu e decor: cand o nota nu pleaca, prima
  // intrebare e daca aparatul mai are semnal, si pana acum raspunsul se vedea
  // doar pe cablu.
  b.semnal = lv_label_create(b.fundal);
  lv_obj_set_pos(b.semnal, 10, 10);
  lv_obj_set_style_text_color(b.semnal, CL_TEXT, 0);
  lv_label_set_text(b.semnal, "");

  b.mijloc = lv_label_create(b.fundal);
  lv_obj_set_pos(b.mijloc, 136, 10);
  lv_obj_set_style_text_color(b.mijloc, CL_TEXT, 0);
  lv_label_set_text(b.mijloc, "");

  // Cat a durat ultima cerere. La un link slab diferenta dintre 40ms si 3000ms
  // e exact diferenta dintre "merge" si "nu mai pleaca nimic", si se vede aici
  // inainte sa se simta.
  b.dreapta = lv_label_create(b.fundal);
  lv_obj_set_style_text_color(b.dreapta, CL_GOLD, 0);
  lv_obj_align(b.dreapta, LV_ALIGN_RIGHT_MID, -10, 0);
  lv_label_set_text(b.dreapta, "");
  return b;
}

static void aduBaraLaZi(const BaraSus& b) {
  if (!b.fundal) return;

  if (WiFi.status() == WL_CONNECTED) {
    int rssi = WiFi.RSSI();
    puneFmt(b.semnal, LV_SYMBOL_WIFI " %d", rssi);
    // Verde peste -67, auriu pana la -75, rosu sub. Pragurile sunt cele la
    // care, masurat pe placa asta, cererile incep sa intarzie.
    puneCuloareText(b.semnal, rssi >= -67 ? CL_VERDE : (rssi >= -75 ? CL_GOLD : CL_ROSU));
  } else {
    pune(b.semnal, LV_SYMBOL_WIFI " --");
    puneCuloareText(b.semnal, CL_ROSU);
  }

  if (liveFieldName[0] || liveRefPosition[0]) {
    // Cuvinte intregi: "Teren 1 | Arbitru 2". Prescurtarile erau o concesie
    // facuta ecranului de 240px si nu mai au motiv.
    char t[64];
    if (liveFieldName[0] && liveRefPosition[0])
      snprintf(t, sizeof(t), "%s | Arbitru %s", liveFieldName, liveRefPosition);
    else if (liveFieldName[0])
      snprintf(t, sizeof(t), "%s", liveFieldName);
    else
      snprintf(t, sizeof(t), "Arbitru %s", liveRefPosition);
    pune(b.mijloc, t);
    puneCuloareText(b.mijloc, CL_GOLD);
  } else if (WiFi.status() == WL_CONNECTED) {
    pune(b.mijloc, refereeShort.length() ? refereeShort.c_str() : "");
    puneCuloareText(b.mijloc, CL_TEXT);
  } else {
    pune(b.mijloc, "FARA WIFI");
    puneCuloareText(b.mijloc, CL_ROSU);
  }

  if (lastRequestDone) {
    if (lastRequestOk) {
      puneFmt(b.dreapta, "%lums", (unsigned long)lastRequestMs);
      puneCuloareText(b.dreapta, lastRequestMs < 500 ? CL_VERDE : CL_GOLD);
    } else {
      pune(b.dreapta, "esec");
      puneCuloareText(b.dreapta, CL_ROSU);
    }
  } else {
    pune(b.dreapta, "");
  }
  lv_obj_align(b.dreapta, LV_ALIGN_RIGHT_MID, -10, 0);
}

// ───────────────────────────── ECRANELE ─────────────────────────────

static lv_obj_t* ecrPornire = nullptr;
static lv_obj_t* ecrStare   = nullptr;
static lv_obj_t* ecrPin     = nullptr;
static lv_obj_t* ecrAstept  = nullptr;
static lv_obj_t* ecrPredare = nullptr;
static lv_obj_t* ecrNota    = nullptr;
static lv_obj_t* ecrLista   = nullptr;
static lv_obj_t* ecrMeci    = nullptr;
static lv_obj_t* ecrPunct   = nullptr;

// Pornire
static BaraSus   pornireBaraSus;
static lv_obj_t* pornireBara, *pornirePas;
// Stare
static BaraSus   stareBara;
static lv_obj_t* stareTitlu, *stareDetaliu, *stareButon;
// PIN
static BaraSus   pinBara;
static lv_obj_t* pinServer, *pinCasute[PIN_DIGITS], *pinCifre[PIN_DIGITS], *pinOk;
// Asteptare
static BaraSus   asteptBara;
static lv_obj_t* asteptNume, *asteptCategorii;
// Predare
static BaraSus   predareBaraSus;
static lv_obj_t* predareText;
// Nota
static BaraSus   notaBara;
static lv_obj_t* notaIstoric, *notaNume, *notaCorectie, *notaValoare;
static lv_obj_t* notaMinus, *notaPlus, *notaTrimite;
static lv_obj_t* notaLista;                    // containerul derulabil
static lv_obj_t* notaRand[MAX_LISTA];          // cate un obiect pe sportiv
static lv_obj_t* notaRandNume[MAX_LISTA], *notaRandNota[MAX_LISTA];
static int       ultimulDerulatLa = 0;         // la ce sportiv am derulat ultima oara
static BaraSus   listaBara;
static lv_obj_t* listaCap, *listaProba;
// Care din cele doua vederi se vede acum. E stare de interfata, nu de
// aplicatie: logica stie doar ca suntem pe SCREEN_SCORE.
static bool      arataLista = false;
static lv_obj_t* notaDupa, *notaDupaTitlu, *notaDupaValoare, *notaDupaTaiat,
                *notaDupaTotal;
static lv_obj_t* notaCutii[MAX_ARBITRI], *notaCutiiText[MAX_ARBITRI], *notaCutiiTaiat[MAX_ARBITRI];
static lv_obj_t* notaConfirm, *notaConfirmText;
// Cat timp confirmarea e pe ecran. Stare de interfata: logica afla abia cand
// arbitrul chiar a spus da.
static bool      ceremConfirmare = false;
// Meci in timp real
static BaraSus   meciBara;
static lv_obj_t* meciSferturi[4], *meciEtichete[4], *meciBanda;
// Suprapunerea de punct
static lv_obj_t* punctValoare, *punctCuloare, *punctStare, *punctDetaliu;

static lv_obj_t* ecranNou() {
  lv_obj_t* e = lv_obj_create(nullptr);
  puneFundal(e, CL_FUNDAL);
  lv_obj_clear_flag(e, LV_OBJ_FLAG_SCROLLABLE);
  return e;
}

static lv_obj_t* eticheta(lv_obj_t* p, int x, int y, const lv_font_t* f, lv_color_t c) {
  lv_obj_t* e = lv_label_create(p);
  lv_obj_set_pos(e, x, y);
  lv_obj_set_style_text_font(e, f, 0);
  puneCuloareText(e, c);
  pune(e, "");
  return e;
}

static lv_obj_t* buton(lv_obj_t* p, int x, int y, int w, int h,
                       const char* text, lv_color_t fundal, lv_event_cb_t cb,
                       void* date = nullptr, const lv_font_t* f = &lv_font_montserrat_28) {
  lv_obj_t* b = lv_btn_create(p);
  lv_obj_set_pos(b, x, y);
  lv_obj_set_size(b, w, h);
  puneFundal(b, fundal);
  lv_obj_set_style_radius(b, 8, 0);
  if (cb) lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, date);
  lv_obj_t* t = lv_label_create(b);
  pune(t, text);
  lv_obj_set_style_text_font(t, f, 0);
  puneCuloareText(t, CL_TEXT);
  lv_obj_center(t);
  return b;
}

static void construiestePornire() {
  ecrPornire = ecranNou();
  puneFundal(ecrPornire, CL_NAVY);
  // Bara e pe TOATE ecranele, inclusiv aici. Starea legaturii e exact ce vrei
  // sa poti verifica dintr-o privire, si cel mai mult tocmai cand aparatul
  // inca porneste si nu stii daca a prins reteaua.
  pornireBaraSus = faBara(ecrPornire);

  lv_obj_t* t = eticheta(ecrPornire, 0, 150, &lv_font_montserrat_28, CL_GOLD);
  pune(t, "APLICATIE ARBITRI");
  lv_obj_set_width(t, ECRAN_LAT);
  lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);

  lv_obj_t* v = eticheta(ecrPornire, 0, 200, &lv_font_montserrat_16, CL_SLAB);
  puneFmt(v, "v%s  -  %s", FW_VERSION, FW_UPDATED);
  lv_obj_set_width(v, ECRAN_LAT);
  lv_obj_set_style_text_align(v, LV_TEXT_ALIGN_CENTER, 0);

  pornireBara = lv_bar_create(ecrPornire);
  lv_obj_set_size(pornireBara, 360, 20);
  lv_obj_set_pos(pornireBara, (ECRAN_LAT - 360) / 2, 260);
  puneFundal(pornireBara, CL_PANOU);
  lv_obj_set_style_bg_color(pornireBara, CL_GOLD, LV_PART_INDICATOR);

  pornirePas = eticheta(ecrPornire, 0, 300, &lv_font_montserrat_16, CL_TEXT);
  lv_obj_set_width(pornirePas, ECRAN_LAT);
  lv_obj_set_style_text_align(pornirePas, LV_TEXT_ALIGN_CENTER, 0);
}

static void construiesteStare() {
  ecrStare  = ecranNou();
  stareBara = faBara(ecrStare);
  stareTitlu   = eticheta(ecrStare, 20, 90,  &lv_font_montserrat_28, CL_GOLD);
  stareDetaliu = eticheta(ecrStare, 20, 150, &lv_font_montserrat_16, CL_TEXT);
  lv_obj_set_width(stareDetaliu, ECRAN_LAT - 40);
  lv_label_set_long_mode(stareDetaliu, LV_LABEL_LONG_WRAP);

  stareButon = buton(ecrStare, 40, 480, ECRAN_LAT - 80, 80, "INCEARCA DIN NOU",
                     CL_NAVY, [](lv_event_t*) { actReia(); });
}

static void construiestePin() {
  ecrPin  = ecranNou();
  pinBara = faBara(ecrPin);

  lv_obj_t* t = eticheta(ecrPin, 20, 64, &lv_font_montserrat_28, CL_GOLD);
  pune(t, "PIN ARBITRU");
  pinServer = eticheta(ecrPin, 20, 104, &lv_font_montserrat_16, CL_SLAB);

  // Casutele de cifra.
  const int latc = 76, inalc = 92, spatiu = 12;
  int total = PIN_DIGITS * latc + (PIN_DIGITS - 1) * spatiu;
  int x0 = (ECRAN_LAT - total) / 2;
  for (int i = 0; i < PIN_DIGITS; i++) {
    lv_obj_t* c = lv_obj_create(ecrPin);
    lv_obj_set_size(c, latc, inalc);
    lv_obj_set_pos(c, x0 + i * (latc + spatiu), 140);
    puneFundal(c, CL_PANOU);
    lv_obj_set_style_border_width(c, 3, 0);
    lv_obj_set_style_radius(c, 8, 0);
    lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    pinCasute[i] = c;

    pinCifre[i] = lv_label_create(c);
    lv_obj_set_style_text_font(pinCifre[i], &lv_font_montserrat_48, 0);
    lv_obj_set_style_text_color(pinCifre[i], CL_TEXT, 0);
    pune(pinCifre[i], "");
    lv_obj_center(pinCifre[i]);
  }

  // Tastatura: douasprezece butoane separate, nu o matrice. Vezi regula 2.
  static const char* et[12] = {"1","2","3","4","5","6","7","8","9",
                               LV_SYMBOL_LEFT,"0","OK"};
  // Inaltimea nu se alege, se calculeaza din spatiul ramas - altfel ultimul
  // rand iese sub marginea ecranului, exact ce s-a intamplat cu 96px: patru
  // randuri de 96 cu pas de 10 pornind de la 264 se termina la 678, pe un
  // ecran de 640.
  const int latb = 148, pas = 10, sus = 248, jos = 10;
  const int inalb = (ECRAN_INAL - sus - jos - 3 * pas) / 4;
  int bx0 = (ECRAN_LAT - (3 * latb + 2 * pas)) / 2;
  for (int i = 0; i < 12; i++) {
    lv_color_t fundal = (i == 11) ? CL_VERDE : (i == 9 ? CL_NAVY : CL_PANOU);
    lv_obj_t* b = buton(ecrPin, bx0 + (i % 3) * (latb + pas),
                        sus + (i / 3) * (inalb + pas), latb, inalb,
                        et[i], fundal,
                        [](lv_event_t* e) {
                          int k = (int)(intptr_t)lv_event_get_user_data(e);
                          if      (k == 9)  actPinSterge();
                          else if (k == 11) actPinTrimite();
                          else              actPinCifra((k == 10) ? '0' : (char)('1' + k));
                        },
                        (void*)(intptr_t)i);
    if (i == 11) pinOk = b;
  }
}

static void construiesteAsteptare() {
  ecrAstept  = ecranNou();
  asteptBara = faBara(ecrAstept);

  // Doua texte si atat. Ecranul asta se vede intre doi concurenti, cand nu e
  // nimic de facut; orice alta informatie pe el ar fi zgomot citit degeaba.
  lv_obj_t* t = eticheta(ecrAstept, 0, 250, &lv_font_montserrat_28, CL_GOLD);
  pune(t, "IN ASTEPTARE");
  lv_obj_set_width(t, ECRAN_LAT);
  lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);

  lv_obj_t* d = eticheta(ecrAstept, 40, 310, &lv_font_montserrat_16, CL_SLAB);
  pune(d, "Astept ca masa centrala sa afiseze proba/sportiv");
  lv_obj_set_width(d, ECRAN_LAT - 80);
  lv_obj_set_style_text_align(d, LV_TEXT_ALIGN_CENTER, 0);
  lv_label_set_long_mode(d, LV_LABEL_LONG_WRAP);

  asteptNume      = nullptr;
  asteptCategorii = nullptr;
}

static void construiestePredare() {
  ecrPredare = ecranNou();
  puneFundal(ecrPredare, CL_NAVY);
  predareBaraSus = faBara(ecrPredare);

  lv_obj_t* t = eticheta(ecrPredare, 0, 80, &lv_font_montserrat_28, CL_GOLD);
  pune(t, "PREDAI DISPOZITIVUL?");
  lv_obj_set_width(t, ECRAN_LAT);
  lv_obj_set_style_text_align(t, LV_TEXT_ALIGN_CENTER, 0);

  predareText = eticheta(ecrPredare, 24, 150, &lv_font_montserrat_16, CL_TEXT);
  lv_obj_set_width(predareText, ECRAN_LAT - 48);
  lv_label_set_long_mode(predareText, LV_LABEL_LONG_WRAP);

  buton(ecrPredare, 40, 340, ECRAN_LAT - 80, 110, "DA, PREDAU", CL_ROSU,
        [](lv_event_t*) { actPredare(true); });
  buton(ecrPredare, 40, 476, ECRAN_LAT - 80, 110, "NU, CONTINUI", CL_PANOU,
        [](lv_event_t*) { actPredare(false); });
}

// Doua vederi pe tot ecranul, nu una impartita.
//
// Nota si lista au nevoie amandoua de spatiu, si cat erau pe acelasi ecran se
// incurcau: lista prea scurta ca sa se citeasca, si derularea ei peste
// butoanele de nota. Separate, fiecare are tot ecranul, si se trece intre ele
// cu o sageata.
static void construiesteNota() {
  ecrNota  = ecranNou();
  notaBara = faBara(ecrNota);

  // Drumul catre lista, sus de tot. Cu text, nu doar pictograma: o pictograma
  // singura cere sa fie ghicita, iar aparatul asta ajunge in mana cuiva care
  // nu l-a mai vazut.
  buton(ecrNota, 20, 50, ECRAN_LAT - 40, 56, LV_SYMBOL_LIST "  Notele tale",
        CL_PANOU, [](lv_event_t*) { arataLista = true; redraw(); },
        nullptr, &lv_font_montserrat_16);

  // Sportivul, imediat deasupra notei: cele doua se citesc impreuna - cui ii
  // dau, si cat. Despartite, ochiul trebuie sa le lege singur.
  notaNume = eticheta(ecrNota, 0, 180, &lv_font_montserrat_28, CL_TEXT);
  lv_obj_set_width(notaNume, ECRAN_LAT);
  lv_obj_set_style_text_align(notaNume, LV_TEXT_ALIGN_CENTER, 0);
  lv_label_set_long_mode(notaNume, LV_LABEL_LONG_CLIP);

  notaCorectie = eticheta(ecrNota, 0, 218, &lv_font_montserrat_16, CL_VERDE);
  lv_obj_set_width(notaCorectie, ECRAN_LAT);
  lv_obj_set_style_text_align(notaCorectie, LV_TEXT_ALIGN_CENTER, 0);

  // Nota, mare, intre minus si plus.
  const int latB = 120, inalB = 150;
  notaMinus = buton(ecrNota, 20, 252, latB, inalB, "-", CL_NAVY,
                    [](lv_event_t*) { actNotaCu(-1); }, nullptr,
                    &lv_font_montserrat_48);
  notaPlus  = buton(ecrNota, ECRAN_LAT - 20 - latB, 252, latB, inalB, "+", CL_NAVY,
                    [](lv_event_t*) { actNotaCu(1); }, nullptr,
                    &lv_font_montserrat_48);

  notaValoare = eticheta(ecrNota, latB + 20, 298, &lv_font_montserrat_48, CL_GOLD);
  lv_obj_set_width(notaValoare, ECRAN_LAT - 2 * (latB + 20));
  lv_obj_set_style_text_align(notaValoare, LV_TEXT_ALIGN_CENTER, 0);

  // Spatiu dinadins pana la trimitere: butonul asta inchide nota si nu se mai
  // poate lua inapoi decat corectand, deci n-are ce cauta la un deget distanta
  // de cel cu care tocmai ai reglat-o.
  notaTrimite = buton(ecrNota, 20, 500, ECRAN_LAT - 40, 110, "TRIMITE", CL_VERDE,
                      [](lv_event_t*) { ceremConfirmare = true; redraw(); });

  // Confirmarea. Nota plecata nu se mai ia inapoi de pe placa - se poate doar
  // corecta, si numai cat sportivul e inca pe saltea. Pe un ecran tactil
  // tinut in mana, intre doua meciuri, o apasare din greseala e usoara; o
  // intrebare in plus costa o secunda si scuteste o nota gresita.
  notaConfirm = lv_obj_create(ecrNota);
  lv_obj_set_size(notaConfirm, ECRAN_LAT, 280);
  lv_obj_set_pos(notaConfirm, 0, ECRAN_INAL - 280);
  lv_obj_set_style_bg_opa(notaConfirm, LV_OPA_COVER, 0);
  puneFundal(notaConfirm, CL_PANOU);
  lv_obj_set_style_border_width(notaConfirm, 0, 0);
  lv_obj_set_style_radius(notaConfirm, 0, 0);
  lv_obj_clear_flag(notaConfirm, LV_OBJ_FLAG_SCROLLABLE);

  notaConfirmText = eticheta(notaConfirm, 0, 20, &lv_font_montserrat_28, CL_TEXT);
  lv_obj_set_width(notaConfirmText, ECRAN_LAT);
  lv_obj_set_style_text_align(notaConfirmText, LV_TEXT_ALIGN_CENTER, 0);

  buton(notaConfirm, 20, 80, ECRAN_LAT - 40, 88, "DA, TRIMIT", CL_VERDE,
        [](lv_event_t*) { ceremConfirmare = false; actNotaTrimite(); });
  buton(notaConfirm, 20, 180, ECRAN_LAT - 40, 76, "NU, MA INTORC", CL_NAVY,
        [](lv_event_t*) { ceremConfirmare = false; redraw(); },
        nullptr, &lv_font_montserrat_16);

  // Ce se vede dupa trimitere, peste zona de lucru.
  notaDupa = lv_obj_create(ecrNota);
  // Incepe SUB numele sportivului si sub randul de corectie, nu peste ele.
  // La 190 taia numele pe la jumatate - el e desenat la 180 cu font de 28,
  // deci se termina pe la 214. Numele trebuie sa ramana vizibil: confirmarea
  // spune ce nota a plecat, iar fara nume nu spune pentru cine.
  lv_obj_set_size(notaDupa, ECRAN_LAT, ECRAN_INAL - 248);
  lv_obj_set_pos(notaDupa, 0, 248);
  lv_obj_set_style_bg_opa(notaDupa, LV_OPA_COVER, 0);
  puneFundal(notaDupa, CL_FUNDAL);
  lv_obj_set_style_border_width(notaDupa, 0, 0);
  lv_obj_set_style_radius(notaDupa, 0, 0);
  lv_obj_clear_flag(notaDupa, LV_OBJ_FLAG_SCROLLABLE);

  notaDupaTitlu = eticheta(notaDupa, 0, 8, &lv_font_montserrat_28, CL_VERDE);
  pune(notaDupaTitlu, "TRIMIS");
  lv_obj_set_width(notaDupaTitlu, ECRAN_LAT);
  lv_obj_set_style_text_align(notaDupaTitlu, LV_TEXT_ALIGN_CENTER, 0);

  notaDupaValoare = eticheta(notaDupa, 0, 54, &lv_font_montserrat_48, CL_TEXT);
  lv_obj_set_width(notaDupaValoare, ECRAN_LAT);
  lv_obj_set_style_text_align(notaDupaValoare, LV_TEXT_ALIGN_CENTER, 0);

  notaDupaTaiat = lv_obj_create(notaDupa);
  lv_obj_set_size(notaDupaTaiat, 220, 8);
  lv_obj_set_pos(notaDupaTaiat, (ECRAN_LAT - 220) / 2, 84);
  puneFundal(notaDupaTaiat, CL_ROSU);
  lv_obj_set_style_border_width(notaDupaTaiat, 0, 0);
  lv_obj_set_style_radius(notaDupaTaiat, 0, 0);

  // Cele cinci note, una langa alta.
  //
  // Inainte scria doar "A CONTAT" sau "cea mai mica" - adica verdictul, fara
  // ce l-a produs. Arbitrul afla ca nota lui a cazut, dar nu fata de ce. Cu
  // toate cinci la vedere, se vede dintr-o privire si de ce, si cat de departe
  // a fost. Datele veneau oricum in acelasi raspuns.
  const int latC = 84, spatC = 8;
  int cx0 = (ECRAN_LAT - (MAX_ARBITRI * latC + (MAX_ARBITRI - 1) * spatC)) / 2;
  for (int i = 0; i < MAX_ARBITRI; i++) {
    lv_obj_t* c = lv_obj_create(notaDupa);
    lv_obj_set_size(c, latC, 84);
    lv_obj_set_pos(c, cx0 + i * (latC + spatC), 160);
    lv_obj_set_style_radius(c, 8, 0);
    lv_obj_set_style_border_width(c, 3, 0);
    lv_obj_set_style_pad_all(c, 0, 0);
    lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    notaCutii[i] = c;

    notaCutiiText[i] = lv_label_create(c);
    lv_obj_set_style_text_font(notaCutiiText[i], &lv_font_montserrat_28, 0);
    lv_obj_center(notaCutiiText[i]);

    // Linia de taiere peste nota cazuta, in cutia ei.
    notaCutiiTaiat[i] = lv_obj_create(c);
    lv_obj_set_size(notaCutiiTaiat[i], latC - 16, 4);
    lv_obj_align(notaCutiiTaiat[i], LV_ALIGN_CENTER, 0, 0);
    puneFundal(notaCutiiTaiat[i], CL_ROSU);
    lv_obj_set_style_border_width(notaCutiiTaiat[i], 0, 0);
    lv_obj_set_style_radius(notaCutiiTaiat[i], 0, 0);
  }

  notaDupaTotal = eticheta(notaDupa, 0, 268, &lv_font_montserrat_28, CL_GOLD);
  lv_obj_set_width(notaDupaTotal, ECRAN_LAT);
  lv_obj_set_style_text_align(notaDupaTotal, LV_TEXT_ALIGN_CENTER, 0);
}

static void construiesteLista() {
  ecrLista  = ecranNou();
  listaBara = faBara(ecrLista);

  // Intoarcerea la notat, scrisa ca atare.
  buton(ecrLista, 20, 48, ECRAN_LAT - 40, 60, LV_SYMBOL_LEFT "  PUNE NOTA",
        CL_VERDE, [](lv_event_t*) { arataLista = false; redraw(); },
        nullptr, &lv_font_montserrat_16);

  // Proba, pe doua randuri: numele ei, si dedesubt grupa, genul si cati
  // sportivi sunt. Cand masa centrala pune o proba pe televizor, arbitrul
  // trebuie sa vada la ce se uita - pana acum afla doar cine e pe saltea.
  listaProba = eticheta(ecrLista, 20, 114, &lv_font_montserrat_22, CL_GOLD);
  lv_obj_set_width(listaProba, ECRAN_LAT - 40);
  lv_label_set_long_mode(listaProba, LV_LABEL_LONG_CLIP);

  listaCap = eticheta(ecrLista, 20, 144, &lv_font_montserrat_16, CL_SLAB);

  // Lista propriu-zisa, pe tot ce ramane. Randuri compacte, separate prin
  // linii: asa se citeste pe verticala si incap cat mai multi.
  notaLista = lv_obj_create(ecrLista);
  lv_obj_set_size(notaLista, ECRAN_LAT, ECRAN_INAL - 176);
  lv_obj_set_pos(notaLista, 0, 176);
  puneFundal(notaLista, CL_FUNDAL);
  lv_obj_set_style_border_width(notaLista, 0, 0);
  lv_obj_set_style_pad_all(notaLista, 0, 0);
  lv_obj_set_style_pad_row(notaLista, 0, 0);
  lv_obj_set_flex_flow(notaLista, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_scroll_dir(notaLista, LV_DIR_VER);
  lv_obj_set_scrollbar_mode(notaLista, LV_SCROLLBAR_MODE_AUTO);

  for (int i = 0; i < MAX_LISTA; i++) {
    lv_obj_t* r = lv_obj_create(notaLista);
    lv_obj_set_size(r, lv_pct(100), 38);
    puneFundal(r, CL_FUNDAL);
    lv_obj_set_style_radius(r, 0, 0);
    lv_obj_set_style_pad_all(r, 0, 0);
    // Separatorul e chiar marginea de jos a randului: o linie in plus pe rand
    // ar fi fost inca un obiect pentru acelasi rezultat.
    lv_obj_set_style_border_side(r, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_width(r, 1, 0);
    lv_obj_set_style_border_color(r, CL_PANOU, 0);
    lv_obj_clear_flag(r, LV_OBJ_FLAG_SCROLLABLE);
    // Apasarea pe sportivul de pe saltea duce la notarea lui. Pe ceilalti nu
    // face nimic: nu poti nota pe cineva care nu e acolo, si un rand care
    // raspunde fara sa se intample nimic ar fi mai rau decat unul care tace.
    lv_obj_add_flag(r, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(r, [](lv_event_t* e) {
                             int idx = (int)(intptr_t)lv_event_get_user_data(e);
                             if (idx < listaCount && lista[idx].id == liveAthleteId) {
                               arataLista = false;
                               redraw();
                             }
                           },
                        LV_EVENT_CLICKED, (void*)(intptr_t)i);
    notaRand[i] = r;

    notaRandNume[i] = lv_label_create(r);
    lv_obj_set_pos(notaRandNume[i], 12, 7);
    lv_obj_set_width(notaRandNume[i], ECRAN_LAT - 120);
    lv_obj_set_style_text_font(notaRandNume[i], &lv_font_montserrat_22, 0);
    lv_label_set_long_mode(notaRandNume[i], LV_LABEL_LONG_CLIP);

    notaRandNota[i] = lv_label_create(r);
    lv_obj_set_style_text_font(notaRandNota[i], &lv_font_montserrat_22, 0);
    lv_obj_align(notaRandNota[i], LV_ALIGN_RIGHT_MID, -14, 0);
  }
}

static void construiesteMeci() {
  ecrMeci  = ecranNou();
  meciBara = faBara(ecrMeci);

  // Patru sferturi, PATRU OBIECTE. Asta e tot rostul regulii masurate: un
  // punct dat atinge un sfert, nu ecranul. Un panou care le-ar contine pe
  // toate ar fi invalidat intreg la fiecare apasare.
  const int latS = ECRAN_LAT / 2;
  const int inalS = (584 - 52) / 2;
  for (int i = 0; i < 4; i++) {
    int col = (i < 2) ? 0 : 1;          // 0,1 = stanga; 2,3 = dreapta
    int rand = i % 2;
    lv_obj_t* q = lv_obj_create(ecrMeci);
    lv_obj_set_size(q, latS, inalS);
    lv_obj_set_pos(q, col * latS, 52 + rand * inalS);
    lv_obj_set_style_border_width(q, 2, 0);
    lv_obj_set_style_border_color(q, lv_color_black(), 0);
    lv_obj_set_style_radius(q, 0, 0);
    lv_obj_clear_flag(q, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(q, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(q, [](lv_event_t* e) {
                             actSfert((int)(intptr_t)lv_event_get_user_data(e));
                           },
                        LV_EVENT_CLICKED, (void*)(intptr_t)i);
    meciSferturi[i] = q;

    meciEtichete[i] = lv_label_create(q);
    lv_obj_set_style_text_font(meciEtichete[i], &lv_font_montserrat_48, 0);
    lv_obj_center(meciEtichete[i]);
  }

  // Banda de jos: ori in ce repriza suntem, ori ce s-a ales de ultima apasare.
  // Nicio apasare nu dispare in tacere.
  meciBanda = eticheta(ecrMeci, 0, 596, &lv_font_montserrat_28, CL_SLAB);
  lv_obj_set_width(meciBanda, ECRAN_LAT);
  lv_obj_set_style_text_align(meciBanda, LV_TEXT_ALIGN_CENTER, 0);
}

static void construiestePunct() {
  ecrPunct = ecranNou();
  // Bara de sus NU se acopera: semnalul si terenul sunt exact ce vrei sa poti
  // verifica dintr-o privire tocmai cand ai trimis un punct.
  faBara(ecrPunct);

  punctValoare = eticheta(ecrPunct, 0, 110, &lv_font_montserrat_48, CL_TEXT);
  lv_obj_set_width(punctValoare, ECRAN_LAT);
  lv_obj_set_style_text_align(punctValoare, LV_TEXT_ALIGN_CENTER, 0);

  punctCuloare = eticheta(ecrPunct, 0, 300, &lv_font_montserrat_48, CL_TEXT);
  lv_obj_set_width(punctCuloare, ECRAN_LAT);
  lv_obj_set_style_text_align(punctCuloare, LV_TEXT_ALIGN_CENTER, 0);

  punctStare = eticheta(ecrPunct, 0, 400, &lv_font_montserrat_28, CL_TEXT);
  lv_obj_set_width(punctStare, ECRAN_LAT);
  lv_obj_set_style_text_align(punctStare, LV_TEXT_ALIGN_CENTER, 0);

  punctDetaliu = eticheta(ecrPunct, 0, 460, &lv_font_montserrat_16, CL_TEXT);
  lv_obj_set_width(punctDetaliu, ECRAN_LAT - 40);
  lv_obj_set_style_text_align(punctDetaliu, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_x(punctDetaliu, 20);
  lv_label_set_long_mode(punctDetaliu, LV_LABEL_LONG_WRAP);
}

// ─────────────────────────── PORNIREA LVGL ───────────────────────────

static void lvglPorneste() {
  if (lvglPornit || !gfx) return;
  lvglPornit = true;

  lv_init();

  void* fb1 = nullptr;
  void* fb2 = nullptr;
  douaMemorii = (rg.numFb >= 2) &&
                esp_lcd_rgb_panel_get_frame_buffer(panel_handle, 2, &fb1, &fb2) == ESP_OK;
  if (!douaMemorii) esp_lcd_rgb_panel_get_frame_buffer(panel_handle, 1, &fb1);
  if (douaMemorii) {
    semVsync = xSemaphoreCreateBinary();
    reglajeSemaforVsync = semVsync;
  }
  Serial.printf("LVGL: mod direct, %s de ecran\n",
                douaMemorii ? "doua memorii" : "o singura memorie");

  lv_disp_draw_buf_init(&tampoane, (lv_color_t*)fb1, (lv_color_t*)fb2,
                        ECRAN_LAT * ECRAN_INAL);
  lv_disp_drv_init(&drvEcran);
  drvEcran.hor_res     = ECRAN_LAT;
  drvEcran.ver_res     = ECRAN_INAL;
  drvEcran.flush_cb    = lvglTrimite;
  drvEcran.draw_buf    = &tampoane;
  drvEcran.direct_mode = 1;
  drvEcran.monitor_cb  = lvglMasoaraDesenul;
  lv_disp_drv_register(&drvEcran);

  lv_indev_drv_init(&drvAtingere);
  drvAtingere.type    = LV_INDEV_TYPE_POINTER;
  drvAtingere.read_cb = lvglCitesteAtingerea;
  lv_indev_drv_register(&drvAtingere);

  construiestePornire();
  construiesteStare();
  construiestePin();
  construiesteAsteptare();
  construiestePredare();
  construiesteNota();
  construiesteLista();
  construiesteMeci();
  construiestePunct();
}

// ─────────────────────────── CONTRACTUL ───────────────────────────

void uiTick() {
  if (!lvglPornit) return;
  // Ceasul LVGL, explicit: nu depindem de o optiune de Kconfig care se poate
  // schimba sub noi.
  static unsigned long ultimul = 0;
  unsigned long acum = millis();
  lv_tick_inc(acum - ultimul);
  ultimul = acum;
  lv_timer_handler();
}

void drawSplash(int percent, const char* step) {
  lvglPorneste();
  if (!lvglPornit) return;
  // Bara ramane pornita: pe ecranul asta se vede daca a prins reteaua.
  topBarVisible = true;
  aduBaraLaZi(pornireBaraSus);
  lv_bar_set_value(pornireBara, percent, LV_ANIM_OFF);
  pune(pornirePas, step && step[0] ? step : "");
  if (lv_scr_act() != ecrPornire) lv_scr_load(ecrPornire);
}

void drawTopBar() {
  if (!lvglPornit) return;
  topBarVisible = true;
  lv_obj_t* a = lv_scr_act();
  if      (a == ecrStare)   aduBaraLaZi(stareBara);
  else if (a == ecrPin)     aduBaraLaZi(pinBara);
  else if (a == ecrAstept)  aduBaraLaZi(asteptBara);
  else if (a == ecrNota)    aduBaraLaZi(notaBara);
  else if (a == ecrLista)   aduBaraLaZi(listaBara);
  else if (a == ecrMeci)    aduBaraLaZi(meciBara);
  else if (a == ecrPornire) aduBaraLaZi(pornireBaraSus);
  else if (a == ecrPredare) aduBaraLaZi(predareBaraSus);
}

void drawStatusScreen() {
  lvglPorneste();
  if (!lvglPornit) return;
  pune(stareTitlu, statusTitle.c_str());
  puneCuloareText(stareTitlu, statusIsError ? CL_ROSU : CL_GOLD);
  pune(stareDetaliu, statusDetail.c_str());
  if (statusIsError) lv_obj_clear_flag(stareButon, LV_OBJ_FLAG_HIDDEN);
  else               lv_obj_add_flag(stareButon, LV_OBJ_FLAG_HIDDEN);
  if (lv_scr_act() != ecrStare) lv_scr_load(ecrStare);
  aduBaraLaZi(stareBara);
}

static void aduPinLaZi() {
  for (int i = 0; i < PIN_DIGITS; i++) {
    bool plin = (i < pinCursor);
    bool aici = (i == pinCursor);
    pune(pinCifre[i], plin ? "*" : "");
    lv_obj_set_style_border_color(pinCasute[i], aici ? CL_GOLD : CL_SLAB, 0);
  }
  // OK se aprinde numai cu PIN-ul complet: un buton care arata gata si
  // raspunde cu o eroare e mai rau decat unul stins.
  puneFundal(pinOk, pinCursor == PIN_DIGITS ? CL_VERDE : CL_PANOU);
  pune(pinServer, (String("Server: ") + serverLabel).c_str());
}

static void aduListaLaZi() {
  pune(listaProba, liveCategoryName[0] ? liveCategoryName : "Proba");

  // Grupa, genul si cati sunt, pe un rand, despartite cu punct. Ce lipseste
  // se sare, ca sa nu ramana separatoare suspendate.
  char sub[96] = "";
  const char* grupa = grupaCategoriei(liveCategoryId);
  const char* gen   = genulCategoriei(liveCategoryId);
  if (grupa[0]) { strlcat(sub, grupa, sizeof(sub)); }
  if (gen[0])   { if (sub[0]) strlcat(sub, "  -  ", sizeof(sub)); strlcat(sub, gen, sizeof(sub)); }
  {
    char n[32];
    snprintf(n, sizeof(n), "%d sportivi", listaCount);
    if (sub[0]) strlcat(sub, "  -  ", sizeof(sub));
    strlcat(sub, n, sizeof(sub));
  }
  pune(listaCap, sub);

  for (int i = 0; i < MAX_LISTA; i++) {
    if (i >= listaCount) {
      lv_obj_add_flag(notaRand[i], LV_OBJ_FLAG_HIDDEN);
      continue;
    }
    lv_obj_clear_flag(notaRand[i], LV_OBJ_FLAG_HIDDEN);

    bool acum = (lista[i].id == liveAthleteId);
    puneFundal(notaRand[i], acum ? CL_NAVY : CL_FUNDAL);

    // Numele, si clubul in paranteze. Doi sportivi cu acelasi nume intr-o
    // categorie nu sunt o raritate; clubul ii desparte fara sa ceara nimic in
    // plus de la arbitru.
    if (lista[i].club[0]) {
      char t[64];
      snprintf(t, sizeof(t), "%s (%s)", lista[i].name, lista[i].club);
      pune(notaRandNume[i], t);
    } else {
      pune(notaRandNume[i], lista[i].name);
    }
    puneCuloareText(notaRandNume[i], acum ? CL_GOLD : CL_TEXT);

    if (lista[i].score >= 0) {
      puneFmt(notaRandNota[i], "%d", lista[i].score);
      puneCuloareText(notaRandNota[i], CL_VERDE);
    } else {
      pune(notaRandNota[i], "-");
      puneCuloareText(notaRandNota[i], CL_SLAB);
    }
    lv_obj_align(notaRandNota[i], LV_ALIGN_RIGHT_MID, -14, 0);

    // Cel de pe saltea sub ochi - dar NUMAI cand se schimba, nu la fiecare
    // desen. redraw() vine des: interogarea mesei centrale misca starea o data
    // pe secunda, si derulat de fiecare data lista i-ar sari arbitrului inapoi
    // sub deget cat incearca s-o traga.
    if (acum && lista[i].id != ultimulDerulatLa) {
      ultimulDerulatLa = lista[i].id;
      lv_obj_scroll_to_view(notaRand[i], LV_ANIM_OFF);
    }
  }
}

static void aduNotaLaZi() {
  // Sportiv nou pe saltea: ne intoarcem singuri la nota. Daca arbitrul ramanea
  // pe lista, urmatorul concurent ar fi intrat fara ca el sa aiba unde nota.
  static int ultimulSportiv = 0;
  if (liveAthleteId != ultimulSportiv) {
    ultimulSportiv = liveAthleteId;
    arataLista = false;
  }

  if (submittedShown) {
    lv_obj_clear_flag(notaDupa, LV_OBJ_FLAG_HIDDEN);
    puneFmt(notaDupaValoare, "%d", submittedScore);

    bool taiat = revealKnown &&
                 (strcmp(revealMark, "low") == 0 || strcmp(revealMark, "high") == 0);
    // Nota mea: verde daca a contat, taiata daca a cazut ca extrema.
    puneCuloareText(notaDupaValoare, !revealKnown ? CL_TEXT : (taiat ? CL_ROSU : CL_VERDE));
    if (taiat) lv_obj_clear_flag(notaDupaTaiat, LV_OBJ_FLAG_HIDDEN);
    else       lv_obj_add_flag(notaDupaTaiat, LV_OBJ_FLAG_HIDDEN);

    // Cutiile cu notele tuturor. Pana la dezvaluire nu exista: nimeni nu are
    // voie sa vada notele colegilor inainte, altfel nota lui n-ar mai fi
    // independenta.
    for (int i = 0; i < MAX_ARBITRI; i++) {
      if (!revealKnown || i >= revealScoreCount) {
        lv_obj_add_flag(notaCutii[i], LV_OBJ_FLAG_HIDDEN);
        continue;
      }
      lv_obj_clear_flag(notaCutii[i], LV_OBJ_FLAG_HIDDEN);
      const NotaArbitru& n = revealScores[i];
      bool cazut = (strcmp(n.mark, "low") == 0 || strcmp(n.mark, "high") == 0);

      puneFmt(notaCutiiText[i], "%d", n.score);
      puneFundal(notaCutii[i], n.mine ? CL_NAVY : CL_FUNDAL);
      lv_obj_set_style_border_color(notaCutii[i], n.mine ? CL_GOLD : CL_PANOU, 0);
      puneCuloareText(notaCutiiText[i], cazut ? CL_SLAB : CL_VERDE);
      if (cazut) lv_obj_clear_flag(notaCutiiTaiat[i], LV_OBJ_FLAG_HIDDEN);
      else       lv_obj_add_flag(notaCutiiTaiat[i], LV_OBJ_FLAG_HIDDEN);
    }

    if (revealKnown) puneFmt(notaDupaTotal, "Total sportiv: %d", revealTotal);
    else             pune(notaDupaTotal, "Astept urmatorul sportiv");
    return;
  }

  lv_obj_add_flag(notaDupa, LV_OBJ_FLAG_HIDDEN);

  pune(notaNume, liveCompetitorName);
  puneCuloareText(notaNume, liveIsTeam ? CL_GOLD : CL_TEXT);

  if (mySubmittedScore >= 0) {
    puneFmt(notaCorectie, "Trimis: %d - poti corecta", mySubmittedScore);
    lv_obj_clear_flag(notaCorectie, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(notaCorectie, LV_OBJ_FLAG_HIDDEN);
  }

  puneFmt(notaValoare, "%d", draftScore);
  lv_obj_set_style_text_color(notaValoare,
      draftScore >= 90 ? CL_VERDE : (draftScore >= 70 ? CL_GOLD : lv_color_hex(0xE07A20)), 0);

  if (ceremConfirmare) {
    puneFmt(notaConfirmText, "Trimiti nota %d?", draftScore);
    lv_obj_clear_flag(notaConfirm, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(notaConfirm, LV_OBJ_FLAG_HIDDEN);
  }

  // Butonul care ar iesi din 0..100 se stinge: trebuie sa spuna de ce nu face
  // nimic, nu doar sa refuze in tacere.
  puneFundal(notaMinus, draftScore > 0          ? CL_NAVY : CL_PANOU);
  puneFundal(notaPlus,  draftScore < MAX_SCORE  ? CL_NAVY : CL_PANOU);

  lv_obj_t* et = lv_obj_get_child(notaTrimite, 0);
  puneFmt(et, "TRIMITE %d", draftScore);
}

static void aduMeciLaZi() {
  for (int i = 0; i < 4; i++) {
    bool rosu = pointButtons[i].isRed;
    int  pct  = pointButtons[i].points;
    lv_color_t fundal = rosu ? CL_ROSU : CL_ALBASTRU;

    // Sfertul apasat acum. Il recunoastem dupa culoare si valoare, nu dupa
    // pozitie, ca sa nu existe doua adevaruri despre aceeasi apasare.
    bool almeu = (pointState != POINT_NONE) && (pointSideRed == rosu) &&
                 (pointValue == pct);
    if (almeu) {
      if      (pointState == POINT_VALIDATED) fundal = CL_VERDE;
      else if (pointState == POINT_FAILED)    fundal = CL_PANOU;
      else if (pointState == POINT_SENDING ||
               pointState == POINT_PENDING)   fundal = CL_GOLD;
    }
    puneFundal(meciSferturi[i], fundal);
    puneFmt(meciEtichete[i], "+%d", pct);
    lv_obj_set_style_text_color(meciEtichete[i],
        (fundal.full == CL_GOLD.full) ? lv_color_black() : CL_TEXT, 0);
  }

  const char* banda; lv_color_t cul = CL_SLAB;
  switch (pointState) {
    case POINT_SENDING:   banda = "SE TRIMITE..."; cul = CL_GOLD; break;
    case POINT_PENDING:   banda = "TRIMIS - astept al 2-lea arbitru"; cul = CL_GOLD; break;
    case POINT_VALIDATED: banda = "VALIDAT"; cul = CL_VERDE; break;
    case POINT_FAILED:    banda = "NETRIMIS - fara legatura"; cul = CL_ROSU; break;
    case POINT_TOO_FAST:  banda = "PREA REPEDE - punctul NU a plecat"; cul = CL_GOLD; break;
    case POINT_CLOSED:    banda = allRoundsDone ? "MECI INCHEIAT - nu se puncteaza"
                                                : "NU SE PUNCTEAZA ACUM"; cul = CL_GOLD; break;
    default:
      if      (!roundsKnown)      banda = "...";
      else if (allRoundsDone)   { banda = "MECI INCHEIAT"; cul = CL_GOLD; }
      else if (activeRoundPaused){ banda = "PAUZA"; cul = CL_GOLD; }
      else if (!activeRoundId)  { banda = "INTRE REPRIZE"; cul = CL_GOLD; }
      else {
        static char r[24];
        snprintf(r, sizeof(r), "REPRIZA %d", activeRoundNumber);
        banda = r; cul = CL_VERDE;
      }
      break;
  }
  pune(meciBanda, banda);
  puneCuloareText(meciBanda, cul);
}

static void aduPunctLaZi() {
  lv_color_t fundal = pointSideRed ? CL_ROSU : CL_ALBASTRU;
  if (pointState == POINT_VALIDATED) fundal = CL_GOLD;
  if (pointState == POINT_FAILED || pointState == POINT_CLOSED) fundal = CL_PANOU;
  if (pointState == POINT_TOO_FAST)  fundal = lv_color_hex(0xE07A20);
  puneFundal(ecrPunct, fundal);

  lv_color_t cerneala = (pointState == POINT_VALIDATED) ? lv_color_black() : CL_TEXT;

  // Numarul mare doar cand chiar exista un punct in spatele lui. La "prea
  // repede" nu stim care sfert a fost respins, iar un "+2" ramas de la
  // apasarea anterioara ar minti.
  if (pointState != POINT_TOO_FAST && pointValue > 0) {
    puneFmt(punctValoare, "+%d", pointValue);
  } else {
    pune(punctValoare, "");
  }
  puneCuloareText(punctValoare, cerneala);

  const char* culoare = pointSideRed ? "ROSU" : "ALBASTRU";
  puneCuloareText(punctCuloare, cerneala);
  puneCuloareText(punctStare,   cerneala);
  puneCuloareText(punctDetaliu, cerneala);

  switch (pointState) {
    case POINT_VALIDATED:
      pune(punctCuloare, culoare);
      pune(punctStare, "VALIDAT");
      pune(punctDetaliu, "");
      break;
    case POINT_PENDING:
      pune(punctCuloare, culoare);
      pune(punctStare, "ASTEPT AL 2-LEA ARBITRU");
      pune(punctDetaliu, "");
      break;
    case POINT_SENDING:
      pune(punctCuloare, culoare);
      pune(punctStare, "SE TRIMITE...");
      pune(punctDetaliu, "");
      break;
    case POINT_CLOSED:
      pune(punctCuloare, "NU SE PUNCTEAZA");
      pune(punctStare, allRoundsDone ? "meciul s-a incheiat"
                        : (activeRoundPaused ? "repriza e in pauza" : "esti intre reprize"));
      pune(punctDetaliu, "punctul NU a fost trimis");
      break;
    case POINT_TOO_FAST:
      pune(punctCuloare, "PREA REPEDE");
      pune(punctStare, "punctul NU a fost trimis");
      pune(punctDetaliu, "apasa din nou daca e o faza noua");
      break;
    default:
      pune(punctCuloare, "NETRIMIS");
      pune(punctStare, "fara legatura cu serverul");
      pune(punctDetaliu, "");
      break;
  }
}

void redraw() {
  lvglPorneste();
  if (!lvglPornit) return;

  // La iesire randam imediat, ca starea pusa acum sa se vada inainte ca
  // apelantul sa plece intr-o cerere lunga. Cand redraw() vine chiar din
  // interiorul motorului LVGL - adica dintr-un buton - apelul de mai jos nu
  // face nimic: lv_timer_handler() se protejeaza singur impotriva reintrarii.
  // Deci aceeasi linie e corecta pe amandoua drumurile.
  struct Randeaza { ~Randeaza() { lv_timer_handler(); } } randeazaLaIesire;

  switch (screen) {
    case SCREEN_STATUS:
      drawStatusScreen();
      break;

    case SCREEN_PIN:
      aduPinLaZi();
      if (lv_scr_act() != ecrPin) lv_scr_load(ecrPin);
      aduBaraLaZi(pinBara);
      break;

    case SCREEN_STANDBY:
      if (lv_scr_act() != ecrAstept) lv_scr_load(ecrAstept);
      aduBaraLaZi(asteptBara);
      break;

    case SCREEN_HANDOVER:
      pune(predareText,
          (String("Sesiunea lui ") +
           (refereeName.length() ? refereeName : String("arbitru")) +
           " se inchide, si urmatorul isi formeaza propriul PIN.").c_str());
      if (lv_scr_act() != ecrPredare) lv_scr_load(ecrPredare);
      aduBaraLaZi(predareBaraSus);
      break;

    case SCREEN_SCORE:
      if (arataLista) {
        aduListaLaZi();
        if (lv_scr_act() != ecrLista) lv_scr_load(ecrLista);
        aduBaraLaZi(listaBara);
      } else {
        aduNotaLaZi();
        if (lv_scr_act() != ecrNota) lv_scr_load(ecrNota);
        aduBaraLaZi(notaBara);
      }
      break;

    case SCREEN_MATCH:
      if (liveMatchRealTime) {
        aduMeciLaZi();
        if (lv_scr_act() != ecrMeci) lv_scr_load(ecrMeci);
        aduBaraLaZi(meciBara);
      } else if (pointState != POINT_NONE) {
        aduPunctLaZi();
        if (lv_scr_act() != ecrPunct) lv_scr_load(ecrPunct);
      } else {
        // Decizia finala si afisarea pe reprize nu sunt inca portate.
        pune(stareTitlu, "ECRAN NEPORTAT");
        puneCuloareText(stareTitlu, CL_GOLD);
        pune(stareDetaliu,
            "Decizia finala si afisarea pe reprize nu sunt inca mutate pe LVGL. "
            "Varianta cu Arduino_GFX le are intregi: compileaza fara -DUI_LVGL.");
        lv_obj_add_flag(stareButon, LV_OBJ_FLAG_HIDDEN);
        if (lv_scr_act() != ecrStare) lv_scr_load(ecrStare);
        aduBaraLaZi(stareBara);
      }
      break;

    // Inca neportat: diagnosticul de WiFi. Spune explicit unde suntem, in loc
    // sa ramana ce era inainte si sa para ca dispozitivul a inghetat.
    case SCREEN_WIFI_DIAG:
      pune(stareTitlu, "ECRAN NEPORTAT");
      puneCuloareText(stareTitlu, CL_GOLD);
      pune(stareDetaliu,
          "Acest ecran nu e inca mutat pe LVGL. Varianta cu Arduino_GFX il are "
          "intreg: compileaza fara -DUI_LVGL.");
      lv_obj_add_flag(stareButon, LV_OBJ_FLAG_HIDDEN);
      if (lv_scr_act() != ecrStare) lv_scr_load(ecrStare);
      aduBaraLaZi(stareBara);
      break;
  }
}

// Atingerile ajung la LVGL prin lvglCitesteAtingerea(), care citeste starea
// tinuta de touchTask(). Coada de evenimente ramane plina degeaba, dar o
// golim ca sa nu creasca - si ca modul de proba sa raporteze in continuare pe
// cablu, fiindca acolo conteaza coordonata bruta, nu ce buton s-a apasat.
void handleTouch(const TouchEvent& e) {
  if (!modTest) return;
  Serial.printf("ATINGERE\t%u\t%u\t%d\t%d\t-\n", e.rawX, e.rawY, e.x, e.y);
}
