// Panoul capacitiv CST328 de pe ESP32-S3-Touch-LCD-2.8, cat trebuie din el.
//
// Scris aici, nu luat din biblioteca: dintre cele care exista, una vrea
// ESPHome, alta aduce un strat de evenimente peste care oricum am fi pus
// al nostru. Avem nevoie de trei lucruri - porneste, raspunde, spune unde
// e degetul - si de niciunul dintre celelalte patru.
//
// Registrele au 16 biti, nu 8 ca la majoritatea cipurilor I2C: adresa se
// scrie pe doi octeti, octetul mare primul. Valorile vin din driverul
// Waveshare si din componenta ESPHome, singurele doua care functioneaza pe
// placa asta.
//
// Adresa 0x1A, nu 0x34/0x35 cum scrie in fisa tehnica a cipului. Fisa
// greseste; placa raspunde la 0x1A.

#pragma once

#include <Wire.h>

#define CST328_ADDR 0x1A

// Starea curenta a atingerilor. Se citeste de la 0xD000 intr-un bloc, iar
// numarul de degete sta la al sasele octet - adica in interiorul blocului,
// nu inaintea lui.
#define CST328_REG_TOUCH      0xD000
#define CST328_REG_FINGERS    0xD005
#define CST328_FINGER_IDX     (CST328_REG_FINGERS - CST328_REG_TOUCH)
#define CST328_TOUCH_BYTES    27     // cinci degete x 5 octeti + 2

// Identificarea cipului si rezolutia panoului. Rezolutia o citim de la el
// in loc s-o presupunem: panoul nu e obligatoriu montat pe aceleasi axe ca
// ecranul, si daca presupunem gresit, jumatatea de sus a ecranului
// raspunde la jumatatea de jos a panoului.
#define CST328_REG_RESOLUTION 0xD1F8
#define CST328_REG_FW_CRC     0xD1FC
#define CST328_REG_CHIP_ID    0xD204

// Comenzi de mod. Ca sa poti citi identificarea, cipul trebuie intai scos
// din modul normal; dupa aceea se pune inapoi, altfel nu raporteaza atingeri.
#define CST328_MODE_DEBUG     0xD101
#define CST328_MODE_NORMAL    0xD109

// Dupa fiecare citire se scrie octetul asta inapoi in registrul de
// atingeri. Fara el, cipul tine datele vechi si acelasi deget pare apasat
// la nesfarsit - adica exact un punct dat de doua ori.
#define CST328_SYNC           0xAB

// Ce versiune de firmware asteptam. Nepotrivirea nu e motiv de oprire:
// placa se livreaza si cu CST3530, care vorbeste acelasi protocol dar se
// prezinta altfel. Daca am refuza-o, un dispozitiv bun ar ramane mut.
#define CST328_FW_CRC_ASTEPTAT 0xCACA

// Rezolutia panoului, cum a raportat-o el. Zero inseamna ca n-a raspuns.
static uint16_t cst328MaxX = 0;
static uint16_t cst328MaxY = 0;
static uint16_t cst328ChipId = 0;

static bool cst328Cmd(uint16_t reg) {
  Wire.beginTransmission(CST328_ADDR);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  return Wire.endTransmission() == 0;
}

static bool cst328WriteByte(uint16_t reg, uint8_t value) {
  Wire.beginTransmission(CST328_ADDR);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

static bool cst328Read(uint16_t reg, uint8_t* buf, size_t len) {
  Wire.beginTransmission(CST328_ADDR);
  Wire.write((uint8_t)(reg >> 8));
  Wire.write((uint8_t)(reg & 0xFF));
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom((uint8_t)CST328_ADDR, (uint8_t)len) != len) return false;
  for (size_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

// Porneste panoul. `rstPin` poate fi -1 daca nu e legat; cu el e mai sigur,
// fiindca un cip ramas in modul de depanare de la o repornire anterioara nu
// raporteaza nimic si pare defect.
//
// Intoarce false doar cand panoul nu raspunde deloc pe I2C - singurul caz in
// care nu are rost sa continuam.
static bool cst328Begin(int sdaPin, int sclPin, int rstPin) {
  Wire.begin(sdaPin, sclPin, 400000);

  if (rstPin >= 0) {
    pinMode(rstPin, OUTPUT);
    digitalWrite(rstPin, HIGH);
    delay(50);
    digitalWrite(rstPin, LOW);
    delay(5);
    digitalWrite(rstPin, HIGH);
    // 200ms in fisa tehnica, de obicei mult mai putin. Nu merita optimizat:
    // se intampla o data, la pornire, in spatele ecranului de incarcare.
    delay(300);
  }

  Wire.beginTransmission(CST328_ADDR);
  if (Wire.endTransmission() != 0) return false;

  uint8_t buf[4];

  if (!cst328Cmd(CST328_MODE_DEBUG)) return false;

  if (cst328Read(CST328_REG_FW_CRC, buf, 4)) {
    uint16_t crc = buf[2] | (buf[3] << 8);
    if (crc != CST328_FW_CRC_ASTEPTAT) {
      Serial.printf("CST328: firmware 0x%04X in loc de 0x%04X - continui oricum\n",
                    crc, CST328_FW_CRC_ASTEPTAT);
    }
  }

  if (cst328Read(CST328_REG_CHIP_ID, buf, 4)) {
    cst328ChipId = buf[2] | (buf[3] << 8);
  }

  if (cst328Read(CST328_REG_RESOLUTION, buf, 4)) {
    uint16_t x = buf[0] | (buf[1] << 8);
    uint16_t y = buf[2] | (buf[3] << 8);
    // Un panou de 2.8" nu are nici 50, nici 5000 de pasi pe o axa. Cand
    // citirea e in afara acestor limite, n-a raspuns cipul ci zgomotul de
    // pe magistrala, si o scalare facuta pe ea muta fiecare atingere.
    if (x > 100 && x < 4096 && y > 100 && y < 4096) {
      cst328MaxX = x;
      cst328MaxY = y;
    }
  }

  if (!cst328Cmd(CST328_MODE_NORMAL)) return false;

  // Prima sincronizare: altfel prima citire aduce ce era in registru de
  // dinainte de repornire.
  uint8_t ignorat;
  cst328Read(CST328_REG_TOUCH, &ignorat, 1);
  cst328WriteByte(CST328_REG_TOUCH, CST328_SYNC);

  Serial.printf("CST328: cip 0x%04X, panou %ux%u\n",
                cst328ChipId,
                cst328MaxX ? cst328MaxX : 0,
                cst328MaxY ? cst328MaxY : 0);
  return true;
}

// Primul deget, daca e vreunul pe panou. Celelalte patru se citesc, dar nu
// ne trebuie: pe ecranul unui arbitru nu exista niciun gest cu doua degete,
// iar al doilea deget pe un buton de punctaj ar fi oricum o greseala.
//
// Intoarce true cat timp degetul e jos. Scrierea de sincronizare de la final
// se face si cand nu e nicio atingere - fara ea cipul tine ultima si acelasi
// punct pleaca de doua ori.
static bool cst328Point(uint16_t* x, uint16_t* y) {
  uint8_t data[CST328_TOUCH_BYTES];
  if (!cst328Read(CST328_REG_TOUCH, data, CST328_TOUCH_BYTES)) return false;

  uint8_t degete = data[CST328_FINGER_IDX] & 0x0F;
  bool jos = (degete >= 1 && degete <= 5);

  if (jos) {
    // Douasprezece biti pe axa, impartiti intre doi octeti si jumatate:
    // octetul mare, apoi cele patru cuante din octetul comun.
    *x = (uint16_t)((data[1] << 4) | ((data[3] >> 4) & 0x0F));
    *y = (uint16_t)((data[2] << 4) | (data[3] & 0x0F));
  }

  cst328WriteByte(CST328_REG_FINGERS, 0);
  cst328WriteByte(CST328_REG_TOUCH, CST328_SYNC);
  return jos;
}
