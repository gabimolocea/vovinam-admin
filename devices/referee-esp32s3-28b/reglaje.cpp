#include "reglaje.h"
#include "ecran.h"
#include "Display_ST7701.h"

#include <Preferences.h>
#include <WiFi.h>
#include "esp_lcd_panel_rgb.h"

// Valorile de pornire.
//
// Timpii sunt ai producatorului, din arhiva lui oficiala pentru placa asta, si
// nu se ating fara motiv: la 480x640 ei dau 70Hz, mult peste pragul la care un
// ecran pulseaza de la sine.
//
// Singurul reglaj care pleaca altfel decat la producator e bounce = 0. Vezi
// reglaje.h: cu bounce buffers pornite, nucleul Arduino are un bug de
// paritate care strica imaginea definitiv la prima intrerupere pierduta, iar
// radioul pierde intreruperi. Fara bounce buffers bug-ul nu poate aparea.
// MASURAT, nu dedus: asta e singura combinatie care da ecran curat cu radioul
// activ, si a iesit abia dupa ce doua reglaje independente au fost separate.
//
//   pclk 20MHz        - 40 MB/s ceruti din PSRAM in loc de 60. Peste atat,
//                       radioul si ecranul se calca pe magistrala si imaginea
//                       tremura. Da 46.8Hz, peste pragul de pulsare proprie.
//   marginile intregi - cele ale producatorului, neatinse. Taiate (incercasem
//                       2,6,6 pe verticala ca sa cumpar Hz), ST7701 nu-si mai
//                       termina baleierea interna a randurilor si imaginea
//                       iese cu linii orizontale si franjuri de culoare.
//
// Mult timp am avut doar colturile tabelului - margini taiate cu banda mica,
// sau margini intregi cu banda mare - si fiecare arata rau in alt fel. Celula
// din mijloc, margini intregi CU banda mica, e cea buna.
//
// Si nimic din toate astea nu ajunge fara setarile din
// ../referee-esp32s3-28b-idf/sdkconfig.defaults, care nu se pot da din
// Arduino IDE. Pe build-ul Arduino reglajele de aici ajuta, dar nu rezolva.
static const ReglajePanou IMPLICIT = {
  .pclkHz    = 20 * 1000 * 1000,
  .hpw = 10, .hbp = 70, .hfp = 60,
  .vpw = 10, .vbp = 20, .vfp = 20,
  .bouncePx  = 0,
  .pclkNeg   = false,   // 0 = frontul crescator, ca la producator
  .wifiSleep = false,
};

ReglajePanou rg = IMPLICIT;

static Preferences prefsPanou;
static const char* NS = "panou";

// Numaratoarea de cadre. Creste in intrerupere, deci volatile.
static volatile uint32_t cadre = 0;
static uint32_t          cadreLaUltimaCitire = 0;
static unsigned long     msLaUltimaCitire    = 0;

void reglajeIncarca() {
  prefsPanou.begin(NS, true);
  rg.pclkHz    = prefsPanou.getUInt("pclk",   IMPLICIT.pclkHz);
  rg.hpw       = prefsPanou.getUShort("hpw",  IMPLICIT.hpw);
  rg.hbp       = prefsPanou.getUShort("hbp",  IMPLICIT.hbp);
  rg.hfp       = prefsPanou.getUShort("hfp",  IMPLICIT.hfp);
  rg.vpw       = prefsPanou.getUShort("vpw",  IMPLICIT.vpw);
  rg.vbp       = prefsPanou.getUShort("vbp",  IMPLICIT.vbp);
  rg.vfp       = prefsPanou.getUShort("vfp",  IMPLICIT.vfp);
  rg.bouncePx  = prefsPanou.getUInt("bounce", IMPLICIT.bouncePx);
  rg.pclkNeg   = prefsPanou.getBool("pclkneg", IMPLICIT.pclkNeg);
  rg.wifiSleep = prefsPanou.getBool("psleep", IMPLICIT.wifiSleep);
  prefsPanou.end();
}

static void salveaza() {
  prefsPanou.begin(NS, false);
  prefsPanou.putUInt("pclk",     rg.pclkHz);
  prefsPanou.putUShort("hpw",    rg.hpw);
  prefsPanou.putUShort("hbp",    rg.hbp);
  prefsPanou.putUShort("hfp",    rg.hfp);
  prefsPanou.putUShort("vpw",    rg.vpw);
  prefsPanou.putUShort("vbp",    rg.vbp);
  prefsPanou.putUShort("vfp",    rg.vfp);
  prefsPanou.putUInt("bounce",   rg.bouncePx);
  prefsPanou.putBool("pclkneg",  rg.pclkNeg);
  prefsPanou.putBool("psleep",   rg.wifiSleep);
  prefsPanou.end();
}

// Chemata de peripheral la fiecare cadru terminat. Nu face nimic altceva:
// orice lucru adevarat aici ar intarzia tocmai citirea pe care o masuram.
// IRAM_ATTR nu e decorativ: cu CONFIG_LCD_RGB_ISR_IRAM_SAFE pornit (vezi
// ../referee-esp32s3-28b-idf/sdkconfig.defaults), driverul refuza sa
// inregistreze un callback care sta in flash - "on_vsync callback not in IRAM"
// - si atunci numaratoarea de cadre nu porneste deloc. Functia doar incrementeaza
// un contor, deci nu atinge flash-ul si poate sta linistit in IRAM.
// Pentru build-ul din Arduino IDE e inofensiv.
static IRAM_ATTR bool laVsync(esp_lcd_panel_handle_t panel,
                    const esp_lcd_rgb_panel_event_data_t* date,
                    void* arg) {
  cadre++;
  return false;
}

void reglajeLeagaVsync() {
  if (!panel_handle) return;
  esp_lcd_rgb_panel_event_callbacks_t cb = {};
  cb.on_vsync = laVsync;
  esp_lcd_rgb_panel_register_event_callbacks(panel_handle, &cb, nullptr);
  cadreLaUltimaCitire = cadre;
  msLaUltimaCitire    = millis();
}

float reglajeHz() {
  unsigned long acum = millis();
  uint32_t      c    = cadre;
  unsigned long dt   = acum - msLaUltimaCitire;
  if (dt < 200) return 0;   // prea scurt ca sa iasa un numar credibil
  float hz = (c - cadreLaUltimaCitire) * 1000.0f / dt;
  cadreLaUltimaCitire = c;
  msLaUltimaCitire    = acum;
  return hz;
}

// Pixelii pe care peripheralul ii scoate pentru un cadru - inclusiv marginile
// stinse, care costa exact la fel de mult ca pixelii vizibili.
static uint32_t pixeliPeCadru() {
  uint32_t ht = ECRAN_LAT  + rg.hpw + rg.hbp + rg.hfp;
  uint32_t vt = ECRAN_INAL + rg.vpw + rg.vbp + rg.vfp;
  return ht * vt;
}

float reglajeHzTeoretic() {
  return (float)rg.pclkHz / (float)pixeliPeCadru();
}

float reglajeBandaMBs() {
  return pixeliPeCadru() * 2.0f * reglajeHzTeoretic() / 1e6f;
}

void reglajeRaport() {
  uint32_t ht = ECRAN_LAT  + rg.hpw + rg.hbp + rg.hfp;
  uint32_t vt = ECRAN_INAL + rg.vpw + rg.vbp + rg.vfp;

  Serial.printf("PANOU pclk=%.1fMHz porch=%u,%u,%u,%u,%u,%u bounce=%u psleep=%d edge=%d\n",
                rg.pclkHz / 1e6f,
                rg.hpw, rg.hbp, rg.hfp, rg.vpw, rg.vbp, rg.vfp,
                (unsigned)rg.bouncePx, rg.wifiSleep ? 1 : 0, rg.pclkNeg ? 1 : 0);
  Serial.printf("PANOU cadru=%ux%u=%u px  teoretic=%.1fHz  banda=%.1f MB/s\n",
                (unsigned)ht, (unsigned)vt, (unsigned)pixeliPeCadru(),
                reglajeHzTeoretic(), reglajeBandaMBs());

  float hz = reglajeHz();
  if (hz > 0) Serial.printf("PANOU masurat=%.1fHz\n", hz);

  // Doua avertismente, fiindca amandoua se vad la fel pe ecran si niciunul nu
  // se vede in cod.
  if (reglajeHzTeoretic() < 45) {
    Serial.println("PANOU ATENTIE: sub 45Hz ecranul pulseaza de la sine, "
                   "indiferent de memorie sau radio. Urca PCLK.");
  }
  if (rg.bouncePx > 0) {
    Serial.println("PANOU ATENTIE: cu bounce>0 intri in bug-ul de paritate "
                   "din nucleul Arduino (esp-idf#19070): o intrerupere "
                   "pierduta strica imaginea definitiv. Vezi reglaje.h.");
  }
}

bool reglajeComanda(const String& linie) {
  if (linie == "PANOU?") {
    reglajeRaport();
    return true;
  }

  if (linie == "PANOU!") {
    rg = IMPLICIT;
    salveaza();
    Serial.println("OK PANOU revenit la implicit. Reporneste device-ul.");
    return true;
  }

  if (linie.startsWith("PCLK=")) {
    float mhz = linie.substring(5).toFloat();
    if (mhz < 4 || mhz > 40) {
      Serial.println("EROARE PCLK intre 4 si 40 MHz");
      return true;
    }
    rg.pclkHz = (uint32_t)(mhz * 1e6f);
    salveaza();
    // Ritmul pixelilor e singurul reglaj care se schimba fara repornire.
    esp_err_t e = panel_handle ? esp_lcd_rgb_panel_set_pclk(panel_handle, rg.pclkHz)
                               : ESP_FAIL;
    Serial.printf("OK PCLK=%.1fMHz (%s), teoretic %.1fHz, banda %.1f MB/s\n",
                  mhz, e == ESP_OK ? "aplicat acum" : "la repornire",
                  reglajeHzTeoretic(), reglajeBandaMBs());
    if (reglajeHzTeoretic() < 45) {
      Serial.println("PANOU ATENTIE: sub 45Hz ecranul pulseaza de la sine.");
    }
    return true;
  }

  if (linie.startsWith("BOUNCE=")) {
    int randuri = linie.substring(7).toInt();
    if (randuri < 0 || randuri > 160) {
      Serial.println("EROARE BOUNCE intre 0 si 160 randuri (0 = oprit)");
      return true;
    }
    rg.bouncePx = (uint32_t)randuri * ECRAN_LAT;
    salveaza();
    Serial.printf("OK BOUNCE=%d randuri (%u px). Reporneste device-ul.\n",
                  randuri, (unsigned)rg.bouncePx);
    if (randuri > 0) {
      Serial.println("PANOU ATENTIE: bounce>0 reintra in bug-ul esp-idf#19070.");
    }
    return true;
  }

  if (linie.startsWith("PORCH=")) {
    // hpw,hbp,hfp,vpw,vbp,vfp - sase numere, in ordinea din foaia panoului.
    //
    // La ce folosesc: banda ceruta din PSRAM e exact 2 x pixel clock, oricare
    // ar fi marginile - fiecare tact scoate un pixel de doi octeti, si atat.
    // Marginile nu schimba banda; schimba cati Hz iesi cu banda aia.
    //
    // De aici drumul: la timpii producatorului sunt 130 de coloane si 50 de
    // linii stinse, un sfert din cadru. Tunse, acelasi pixel clock da cu 23%
    // mai multi Hz - si atunci pixel clock-ul se poate cobori, pana unde
    // Hz-ii sunt inca peste pragul de pulsare. Asa scade banda fara sa intri
    // in zona in care ecranul tremura de la sine.
    //
    // Concret: PORCH=8,20,20,4,8,8 cu PCLK=20 da 57Hz la 40 MB/s, fata de
    // 70Hz la 60 MB/s al producatorului. Cu o treime mai putina banda ceruta
    // din aceeasi memorie din care lucreaza si radioul.
    int v[6], n = 0, de = 6;
    while (n < 6) {
      int la = linie.indexOf(',', de);
      String t = (la < 0) ? linie.substring(de) : linie.substring(de, la);
      v[n++] = t.toInt();
      if (la < 0) break;
      de = la + 1;
    }
    if (n != 6) {
      Serial.println("EROARE PORCH=hpw,hbp,hfp,vpw,vbp,vfp (sase numere)");
      return true;
    }
    for (int i = 0; i < 6; i++) {
      if (v[i] < 1 || v[i] > 255) {
        Serial.println("EROARE fiecare margine intre 1 si 255");
        return true;
      }
    }
    rg.hpw = v[0]; rg.hbp = v[1]; rg.hfp = v[2];
    rg.vpw = v[3]; rg.vbp = v[4]; rg.vfp = v[5];
    salveaza();
    Serial.printf("OK PORCH=%d,%d,%d,%d,%d,%d teoretic %.1fHz banda %.1f MB/s. "
                  "Reporneste device-ul.\n",
                  v[0], v[1], v[2], v[3], v[4], v[5],
                  reglajeHzTeoretic(), reglajeBandaMBs());
    return true;
  }

  if (linie.startsWith("EDGE=")) {
    // Pe ce front al ceasului de pixeli iese data catre panou.
    //
    // Daca panoul o prinde pe frontul opus celui pe care o scoatem, o
    // esantioneaza tocmai cand se schimba: fiecare pixel iese amestecat cu
    // vecinul lui, si imaginea pare dublata pe orizontala. Nu e o reglare de
    // viteza sau de banda - e o nepotrivire de faza, si are doar doua valori,
    // deci se decide din doua incercari.
    rg.pclkNeg = linie.substring(5).toInt() != 0;
    salveaza();
    Serial.printf("OK EDGE=%d (%s). Reporneste device-ul.\n",
                  rg.pclkNeg ? 1 : 0,
                  rg.pclkNeg ? "front descrescator" : "front crescator, ca la producator");
    return true;
  }

  if (linie.startsWith("PSLEEP=")) {
    rg.wifiSleep = linie.substring(7).toInt() != 0;
    salveaza();
    WiFi.setSleep(rg.wifiSleep);
    Serial.printf("OK PSLEEP=%d aplicat acum.\n", rg.wifiSleep ? 1 : 0);
    return true;
  }

  if (linie == "RESYNC") {
    // Reporneste DMA-ul la urmatorul cadru. Daca imaginea se indreapta la
    // comanda asta si se strica iar singura, atunci defectul e
    // desincronizare, nu improspatare prea rara - si invers.
    if (!panel_handle) {
      Serial.println("EROARE panoul nu e pornit");
    } else {
      esp_err_t e = esp_lcd_rgb_panel_restart(panel_handle);
      Serial.printf("OK RESYNC %s\n", e == ESP_OK ? "cerut" : "respins");
    }
    return true;
  }

  if (linie == "REPORNESTE") {
    Serial.println("OK repornesc.");
    delay(100);
    ESP.restart();
    return true;
  }

  return false;
}
