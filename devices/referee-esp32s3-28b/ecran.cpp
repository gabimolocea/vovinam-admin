#include "ecran.h"
#include "reglaje.h"
#include "esp_cache.h"

Arduino_GFX* gfx = nullptr;

// Memoria panoului, tinuta minte ca s-o putem sincroniza.
static void*  memoriaPanoului = nullptr;
static size_t octetiiPanoului = 0;

void ecranSincronizeaza() {
  if (!memoriaPanoului) return;
  // C2M = dinspre procesor spre memorie, adica scrie ce e murdar in cache.
  esp_cache_msync(memoriaPanoului, octetiiPanoului,
                  ESP_CACHE_MSYNC_FLAG_DIR_C2M | ESP_CACHE_MSYNC_FLAG_UNALIGNED);
}

bool ecranPorneste() {
  // Ordinea e a producatorului si nu se schimba: expanderul tine resetul si
  // selectia ecranului, deci fara el ST7701 nu primeste nicio comanda.
  I2C_Init();
  TCA9554PWR_Init(0x00);
  Set_EXIO(EXIO_PIN8, Low);
  Backlight_Init();
  LCD_Init();

  // Numaratoarea de cadre, imediat ce panoul exista. De aici vine singura
  // masura care deosebeste "improspatare prea rara" de "DMA desincronizat" -
  // doua defecte care pe ecran arata identic.
  reglajeLeagaVsync();

  // Memoria pe care o baleiaza chiar peripheralul RGB.
  void* memorie = nullptr;
  if (esp_lcd_rgb_panel_get_frame_buffer(panel_handle, 1, &memorie) != ESP_OK || !memorie) {
    return false;
  }

  memoriaPanoului = memorie;
  octetiiPanoului = (size_t)ECRAN_LAT * ECRAN_INAL * 2;   // RGB565

  PanzaPanou* panza = new PanzaPanou(ECRAN_LAT, ECRAN_INAL, (uint16_t*)memorie);
  // GFX_SKIP_OUTPUT_BEGIN: panza n-are ecran in spate, panoul e deja pornit.
  panza->begin(GFX_SKIP_OUTPUT_BEGIN);
  gfx = panza;
  return true;
}
