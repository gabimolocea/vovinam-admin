// Stratul de desen: Arduino_GFX scriind direct in memoria panoului.
//
// Driverul producatorului (Display_ST7701) stie sa porneasca panoul si sa
// impinga un bitmap, dar nu stie sa deseneze: n-are text, n-are forme. Iar
// firmware-ul de arbitraj e numai text si forme.
//
// Arduino_GFX stie sa deseneze, dar varianta lui de panou RGB nu a mers pe
// placa asta - am pierdut ore pe ea. Asa ca le combinam: initializarea si
// panoul de la producator, desenul de la Arduino_GFX.
//
// Legatura se face fara nicio copiere. Arduino_Canvas isi aloca memorie doar
// daca nu are deja una (`if (!_framebuffer)`), iar pointerul e `protected`.
// Deci o subclasa poate sa i-l puna pe cel al panoului inainte de begin(), si
// atunci tot ce deseneaza Arduino_GFX ajunge direct in memoria pe care
// peripheralul RGB o baleiaza continuu. Fara flush, fara al doilea cadru,
// fara memcpy de 600KB la fiecare desen - singurul mod in care interfata
// poate fi fluida pe un ecran de marimea asta.

#pragma once

#include <Arduino_GFX_Library.h>
#include "Display_ST7701.h"
#include "esp_lcd_panel_rgb.h"

// Ecranul fizic.
#define ECRAN_LAT  ESP_PANEL_LCD_WIDTH    // 480
#define ECRAN_INAL ESP_PANEL_LCD_HEIGHT   // 640

// Interfata e scrisa in unitatile placii vechi, 240x320, si se scaleaza aici.
//
// Nu e lene: tine macheta intr-un singur sistem de coordonate, cu un singur
// numar de schimbat daca ecranul se schimba iar. Alternativa - sa inmultesc cu
// doi opt sute de literali prin codul de desen - ar fi fost opt sute de ocazii
// de greseala, pentru acelasi rezultat.
#define SCARA 2
#define UI_LAT  (ECRAN_LAT  / SCARA)      // 240
#define UI_INAL (ECRAN_INAL / SCARA)      // 320

// Panza care nu-si aloca memorie, ci o primeste.
class PanzaPanou : public Arduino_Canvas {
 public:
  PanzaPanou(int16_t w, int16_t h, uint16_t* memorie)
      : Arduino_Canvas(w, h, nullptr) {
    _framebuffer = memorie;   // begin() o vede si nu mai aloca
  }
};

extern Arduino_GFX* gfx;

// Scrie in PSRAM ce a desenat procesorul, ca sa-l poata citi panoul.
//
// Nu e optional si nu e o optimizare - e corectitudine. Cache-ul de date e
// write-back: desenul lui Arduino_GFX ajunge intai in cache si abia la
// evacuare in PSRAM. Dar GDMA-ul panoului citeste PSRAM direct, ocolind
// cache-ul, deci pana la evacuare vede pixelii vechi. Rezultatul pe ecran e
// dubla expunere: imaginea noua suprapusa peste cea de dinainte.
//
// Cat de vizibil e depinde de cat de repede se evacueaza cache-ul, adica de
// marimea lui. La 32KB se intampla destul de repede ca sa treaca neobservat;
// la 64KB (vezi ../referee-esp32s3-28b-idf/sdkconfig.defaults) devine evident.
// Marimea cache-ului doar a scos la iveala problema, n-a creat-o.
void ecranSincronizeaza();

// Porneste panoul prin driverul producatorului, apoi leaga desenul de memoria
// lui. Intoarce false daca panoul n-a dat memoria - singurul esec real posibil.
bool ecranPorneste();
