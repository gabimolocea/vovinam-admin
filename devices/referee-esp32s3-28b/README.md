# Arbitru FRVV — Waveshare ESP32-S3-Touch-LCD-2.8B

Varianta fără LVGL, cu WiFi, pentru placa cu ecran ST7701 480×640 pe interfață
RGB paralelă și panou tactil GT911.

Desenul e Arduino_GFX scriind **direct** în memoria pe care peripheralul RGB o
baleiază, fără copiere (vezi `ecran.h`). Pornirea panoului e driverul
producătorului, luat ca atare din arhiva lui oficială — `Display_ST7701`,
`TCA9554PWR`, `I2C_Driver`, `Touch_GT911`.

Singura modificare în fișierele producătorului: timpii și mărimea bounce
buffer-ului se citesc din `rg` (vezi `reglaje.h`) în loc de macro-uri, ca să se
poată schimba prin cablu fără reprogramare.

## Setări în Arduino IDE

Nucleul **nu are** o intrare dedicată pentru 2.8B — doar pentru 2.8, care e altă
placă. Se alege **ESP32S3 Dev Module** și se pun manual:

| Meniu | Valoare |
|---|---|
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | **Enabled** |
| USB Mode | Hardware CDC and JTAG |
| CPU Frequency | 240MHz (WiFi) |
| Flash Size | 16MB (128Mb) |
| Flash Mode | QIO 80MHz |
| PSRAM | **OPI PSRAM** |
| Partition Scheme | Huge APP (3MB No OTA/1MB SPIFFS) |

`USB CDC On Boot: Enabled` nu e opțional: cu el dezactivat `Serial` e
`HardwareSerial`, care n-are `setTxTimeoutMs()`, și compilarea cade.

`PSRAM: OPI PSRAM` nu e opțional: memoria de ecran are 600 KB și nu încape în
RAM-ul intern. Fără ea panoul nu dă framebuffer și ecranul rămâne negru.

Dimensiune la compilare: 1,224,810 octeți (38%), RAM 54,016 (16%).

## Comenzi prin cablu

Pe lângă cele ale aplicației (`WIFI?`, `WIFI=ssid<TAB>parola`, `LUMINA=n`,
`BTN?`, `TEST`):

| Comandă | Ce face |
|---|---|
| `PANOU?` | reglajele active, Hz teoretici, Hz măsurați, banda cerută |
| `PCLK=24` | pixel clock în MHz — **se aplică imediat**, fără repornire |
| `BOUNCE=0` | bounce buffers, în rânduri; 0 = oprite |
| `PORCH=8,20,20,4,8,8` | marginile stinse: hpw,hbp,hfp,vpw,vbp,vfp |
| `EDGE=0` | pe ce front al ceasului iese pixelul |
| `PSLEEP=0` | economia de energie a radioului |
| `RESYNC` | repornește DMA-ul la cadrul următor |
| `PANOU!` | revine la reglajele implicite |
| `REPORNESTE` | repornește placa |
| `PINI?` | cine ține GPIO 33–37: memoria sau GPIO-ul. Nu atinge nimic |
| `PINI!` | îi pune chiar pe intrare și verifică după aceea că PSRAM-ul a rămas întreg |

Toate se salvează în memoria plăcii. În afară de `PCLK` și `PSLEEP`, cer
repornire.

Firmware-ul scrie singur, o dată la 5 secunde:

```
HZ 70.1 (teoretic 70.1) rssi=-71 liberPsram=7012352
```

## Rezultatul: ce face ecranul curat

Imaginea tremura ori de cate ori radioul era asociat, si era curata doar cu
radioul stins. Rezolvat. Sunt trei lucruri, si **toate trei sunt necesare**:

**1. Cele sase setari de compilare din ESP-IDF.** Vezi
[../referee-esp32s3-28b-idf/sdkconfig.defaults](../referee-esp32s3-28b-idf/sdkconfig.defaults).
Niciuna nu se poate da din Arduino IDE, fiindca acolo componentele ESP-IDF vin
precompilate. Cea decisiva e PSRAM la 120MHz; cea mai subtila e ca pe nucleul
Arduino driverul ecranului e compilat presupunand PSRAM quad, desi placa are
octal obligatoriu.

**2. Scrierea framebuffer-ului din cache in PSRAM dupa fiecare desen.**
`esp_cache_msync`, vezi `ecran.h`. Cache-ul e write-back, iar GDMA-ul panoului
citeste PSRAM direct, ocolindu-l: fara asta panoul vede pixeli vechi amestecati
cu cei noi. Era o problema reala in toate variantele, inclusiv Arduino - doar
ca tremuratul o ascundea.

**3. Pixel clock 20MHz CU marginile producatorului neatinse.** 46.8Hz la
40 MB/s. Vezi comentariul de la `IMPLICIT` din `reglaje.cpp`.

## Cum arata fiecare greseala

Trei defecte diferite, care in cuvinte suna toate a "tremura" sau "glitch", dar
au cauze fara legatura intre ele. Asta a fost partea grea.

| Ce se vede | Cauza | Reglajul |
|---|---|---|
| tremurat continuu, curat doar cu radioul stins | banda PSRAM impartita cu radioul | pclk, si setarile ESP-IDF |
| dubla expunere care se misca | desenul ramas in cache | `esp_cache_msync` |
| linii orizontale, franjuri de culoare | marginile verticale taiate, ST7701 nu-si termina baleierea | marginile producatorului |
| pulsare uniforma a tot ecranul | sub ~45Hz ecranul pulseaza de la sine | pclk mai mare |

Ultimul e capcana: coborand pixel clock-ul ca sa faci loc radioului, treci sub
pragul de pulsare si schimbi o cauza de tremurat cu alta. La timpii
producatorului, 10MHz da 23Hz. De-aia primul drum de la 30 la 10MHz n-a parut
sa ajute cu nimic.

## Aritmetica, pe care am gresit-o o data

Banda ceruta din PSRAM e **exact `2 x pixel clock`**, oricare ar fi marginile:
fiecare tact scoate un pixel de doi octeti. Marginile nu schimba banda - schimba
cati Hz ies cu banda aia.

| Reglaj | Cadru | Hz | Banda |
|---|---|---|---|
| producator, PCLK=30 | 620x690 | 70.1 | 60 MB/s |
| **PCLK=20, margini intregi** | 620x690 | **46.8** | **40 MB/s** |
| PCLK=10 | 620x690 | 23.4 | 20 MB/s |
| PCLK=20, margini taiate | 528x660 | 57.4 | 40 MB/s |

Ultima linie arata tentatia: aceeasi banda, cu 10Hz in plus. Dar marginile
taiate sunt exact ce strica panoul. Hz-ii aia nu se pot cumpara.

## Ce s-a verificat si s-a exclus

**pioarduino nu e o cale.** Platforma pe care Tasmota a folosit-o ca sa repare
jitterul orizontal a ajuns, in versiunea `55.03.312-1`, sa fie **acelasi build**
ca nucleul oficial: acelasi lib-builder (`6671d0b`), acelasi ESP-IDF
(`v5.5.5 b774170ff46`), acelasi arduino (`e7c1e8cd4`), si toate cele noua setari
relevante identice. Nu e nimic de testat.

**PSRAM quad nu e o cale.** Placa raporteaza `quad_psram: PSRAM chip is not
connected, or wrong PSRAM line mode` si zero octeti - memoria e octal-only.

**Bounce buffers nu ajuta pe placa asta.** Masurat: cu ele pornite tremura mai
tare. In plus, cu `CONFIG_LCD_RGB_RESTART_IN_VSYNC=y` - cum e in nucleul
Arduino - o intrerupere pierduta inverseaza definitiv paritatea tamponului
(esp-idf#19070). Prima runda de incercari a plimbat marimea intre 10 si 80 de
randuri, adica a stat tot timpul in modul cu bug; zero nu fusese incercat.

**Economia de energie a radioului si antena nu schimba nimic.** Amandoua
incercate, la mai multe nivele de semnal.

## Surse

- [espressif/esp-idf#19070](https://github.com/espressif/esp-idf/issues/19070) — bug-ul de paritate al bounce buffer-ului cu `CONFIG_LCD_RGB_RESTART_IN_VSYNC=y`
- [waveshareteam/ESP32-S3-Touch-LCD-7B#4](https://github.com/waveshareteam/ESP32-S3-Touch-LCD-7B/issues/4) — raport de test: 120 MHz memorie + PCLK30 elimină flickerul
- [ESP-IDF: RGB Interfaced LCD](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/lcd/rgb_lcd.html) — bounce buffers, `esp_lcd_rgb_panel_restart`
- [ESP-FAQ: LCD](https://docs.espressif.com/projects/esp-faq/en/latest/software-framework/peripherals/lcd.html) — deriva ecranului când banda PSRAM/GDMA nu ajunge
- [ESP-IDF: SPI Flash and External SPI RAM Configuration](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/flash_psram_config.html) — 120 MHz pe PSRAM octal e experimental
- [forum.lvgl.io: Display glitching while connecting to WiFi](https://forum.lvgl.io/t/display-glitching-while-connecting-to-wifi-esp32s3-8048s043/12075) — ce nu a funcționat pe plăci asemănătoare, și pista alimentării
