// Reglajele panoului RGB, schimbabile prin cablu, si masurarea improspatarii.
//
// De ce exista fisierul asta: pe placa 2.8B imaginea tremura cand radioul e
// pornit, iar combinatia care scapa de tremurat nu se poate deduce - trebuie
// masurata. Prima runda de incercari a mers prin reprogramare la fiecare
// valoare: zeci de minute pentru fiecare numar, si nicio masuratoare in afara
// de "tot tremura". Aici sunt toate in memoria device-ului, se schimba cu o
// comanda, si ecranul raporteaza singur cati Hz face.
//
// Masurarea Hz-ilor nu e un lux, e felul in care se deosebesc doua defecte
// care arata identic cu ochiul liber:
//
//   - IMPROSPATARE PREA RARA. Sub ~45Hz un ecran pulseaza vizibil de la sine,
//     fara nicio legatura cu memoria sau cu radioul. La timpii producatorului,
//     pixel clock 10MHz da 23Hz - adica exact sub pragul la care orice ecran
//     tremura. Cand am coborat pixel clock-ul ca sa fac loc radioului in
//     memorie, am schimbat o cauza de tremurat cu alta, si de-aia nu s-a vazut
//     nicio imbunatatire pe tot drumul de la 30MHz la 10MHz.
//
//   - DESINCRONIZARE DMA. Panoul RGB nu are memorie proprie: peripheralul
//     citeste din PSRAM in ritmul exact al ecranului, fara pauza. Daca o
//     citire intarzie, imaginea se rupe sau se deplaseaza si ramane asa.
//     Aici Hz-ii sunt corecti dar imaginea e stricata.
//
// Primul se vede in numar, al doilea nu. Deci se citeste numarul intai.
//
// ─────────────────────── CE AM GASIT DESPRE TREMURAT ───────────────────────
//
// Nucleul Arduino pentru ESP32 se compileaza cu doua setari care, impreuna cu
// un panou RGB si radioul pornit, fac exact ce vedem. Niciuna nu se poate
// schimba din Arduino - sunt in biblioteca precompilata:
//
//   CONFIG_LCD_RGB_RESTART_IN_VSYNC=y
//     Cu bounce buffers pornite, driverul alege care din cele doua tampoane
//     sa umple dupa paritatea unui contor de intreruperi, si contorul ala nu
//     se reseteaza niciodata cand optiunea asta e pornita. O singura
//     intrerupere pierduta inverseaza paritatea definitiv: de atunci DMA
//     citeste tocmai tamponul in care se scrie. Imaginea se deplaseaza cu
//     inaltimea unui tampon si prima linie a fiecarei felii palpaie - pana la
//     repornire. (espressif/esp-idf#19070)
//
//     Intreruperile se pierd cand altcineva tine procesorul in intrerupere
//     mai mult decat o felie de ecran. Radioul face exact asta.
//
//     De aici reglajul implicit de mai jos: BOUNCE ZERO. Bug-ul exista doar in
//     modul cu bounce buffers; fara ele nu e niciun contor de paritate de
//     stricat. Prima runda de incercari a plimbat valoarea intre 10 si 80 de
//     randuri - adica a stat tot timpul in modul cu bug, si de-aia marimea
//     n-a schimbat nimic.
//
//   CONFIG_SPIRAM_TRY_ALLOCATE_WIFI_LWIP=y
//     Tampoanele de retea se aloca in PSRAM, aceeasi memorie din care
//     peripheralul citeste ecranul. Fiecare pachet trece peste citirea pentru
//     ecran. Asta e legatura directa intre "radio pornit" si "tremura", si nu
//     se poate dezactiva din Arduino.
//
// Ce mai lipseste si nu se poate avea aici: PSRAM la 120MHz, care in raportul
// de test al producatorului pentru placa de 7" a fost singurul lucru care a
// eliminat flickerul. Pe PSRAM octal, 120MHz e functie experimentala in
// ESP-IDF si nucleul Arduino nu o expune.

#pragma once

#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

// Reglajele active. Citite din memoria device-ului la pornire, folosite de
// Display_ST7701.cpp cand construieste panoul.
struct ReglajePanou {
  uint32_t pclkHz;     // ritmul pixelilor
  uint16_t hpw, hbp, hfp;
  uint16_t vpw, vbp, vfp;
  uint32_t bouncePx;   // 0 = fara bounce buffers (vezi comentariul de sus)
  bool     pclkNeg;    // pe ce front al ceasului iese pixelul
  uint8_t  numFb;      // cate memorii de ecran: 1, sau 2 ca sa nu se rupa imaginea
  bool     wifiSleep;  // economia de energie a radioului
};

extern ReglajePanou rg;

// Incarca reglajele salvate. Se cheama INAINTE de pornirea ecranului.
void reglajeIncarca();

// Numara cadrele, pentru Hz-ii masurati. Se leaga de panou la pornire.
void reglajeLeagaVsync();

// Un semafor pe care cine vrea il primeste la fiecare cadru terminat.
//
// Exista pentru desenul cu doua memorii de ecran: schimbarea intre ele e
// ceruta cu esp_lcd_panel_draw_bitmap, dar se intampla abia la VSYNC, iar
// apelul se intoarce imediat. Fara sa astepte confirmarea, desenul porneste in
// memoria pe care panoul inca o baleiaza - si atunci dubla memorare nu mai
// apara de nimic, exact ce se vedea ca tremurat la fiecare apasare.
//
// Lasat null, nu costa nimic. Vezi ../referee-esp32s3-28b-lvgl/main/main.cpp.
extern volatile SemaphoreHandle_t reglajeSemaforVsync;

// Improspatarea masurata de la ultima intrebare, in Hz. Prima intoarce 0.
float reglajeHz();

// Improspatarea pe care ar trebui s-o dea reglajele curente, din calcul.
float reglajeHzTeoretic();

// Lungimea de banda ceruta din PSRAM de improspatare, MB/s.
float reglajeBandaMBs();

// Raportul complet, pe serial.
void reglajeRaport();

// Trateaza o comanda primita prin cablu. Intoarce false daca n-o cunoaste,
// ca sa poata fi incercata de restul comenzilor.
bool reglajeComanda(const String& linie);
