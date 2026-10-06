// Interfata cu Arduino_GFX: desenul original, scris direct in memoria
// panoului, in unitati 240x320 scalate cu doi.
//
// Inclusa din referee-esp32s3-28b.ino, nu compilata separat - vezi comentariul
// de acolo. Perechea ei e desen_lvgl.inc.

bool zoneHit(const TouchZone& z, int x, int y) {
  return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;
}

// Care zona din tabel a fost atinsa, sau -1.
int zoneIndex(const TouchZone* zones, int count, int x, int y) {
  for (int i = 0; i < count; i++) if (zoneHit(zones[i], x, y)) return i;
  return -1;
}

//
// Toate zonele atinse stau in tabelele de mai jos, si acelea sunt folosite
// si la desen. Nu e o eleganta, e singura aparare impotriva greselii pe care
// o face un ecran tactil si un buton nu: butonul desenat intr-un loc si
// atingerea verificata in altul. Daca schimbi un numar, se muta si desenul.

// Latimea a ramas 240, iar fontul are 6px pe caracter: cam 38 de caractere
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
    ui.setCursor(x, y);
    ui.print(text.substring(start, start + take));
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
    ui.fillRect(bx, y + (13 - h), 3, h, color);
  }
}

// Scrie centrat pe latimea ecranului. Fontul are 6px pe caracter la
// dimensiunea 1, si se scaleaza liniar.
void printCentered(const char* text, int y, int size, uint16_t color) {
  ui.setTextSize(size);
  ui.setTextColor(color);
  int w = strlen(text) * 6 * size;
  ui.setCursor((SCREEN_W - w) / 2, y);
  ui.print(text);
}

// Centrat pe o zona, nu pe ecran. Cu butoane desenate din tabel, asta e
// singurul fel in care eticheta sta sigur in mijlocul zonei care raspunde.
void printCenteredIn(const TouchZone& z, const char* text, int size, uint16_t color) {
  ui.setTextSize(size);
  ui.setTextColor(color);
  int w = strlen(text) * 6 * size;
  int h = 8 * size;
  ui.setCursor(z.x + (z.w - w) / 2, z.y + (z.h - h) / 2);
  ui.print(text);
}

// Un buton, desenat exact peste zona care il asculta.
void drawButton(const TouchZone& z, const char* label, uint16_t bg, uint16_t ink, int size) {
  ui.fillRect(z.x, z.y, z.w, z.h, bg);
  ui.drawRect(z.x, z.y, z.w, z.h, LIGHTGRAY);
  printCenteredIn(z, label, size, ink);
}

const TouchZone ZONA_BARA_SUS = { 0, 0, SCREEN_W, 26 };

const TouchZone ZONA_REIA = { 20, 246, 200, 56 };

const TouchZone PIN_KEYS[12] = {
  {   0, 126, 76, 44 }, {  82, 126, 76, 44 }, { 164, 126, 76, 44 },
  {   0, 173, 76, 44 }, {  82, 173, 76, 44 }, { 164, 173, 76, 44 },
  {   0, 220, 76, 44 }, {  82, 220, 76, 44 }, { 164, 220, 76, 44 },
  {   0, 267, 76, 44 }, {  82, 267, 76, 44 }, { 164, 267, 76, 44 },
};

const TouchZone SCORE_STEPS[4] = {
  {   1, 200, 58, 48 },
  {  61, 200, 58, 48 },
  { 121, 200, 58, 48 },
  { 181, 200, 58, 48 },
};

const TouchZone SCORE_SEND = { 8, 256, 224, 56 };

const TouchZone QUADRANTS[4] = {
  {   0,  26, 120, 133 },   // stanga sus
  {   0, 159, 120, 133 },   // stanga jos
  { 120,  26, 120, 133 },   // dreapta sus
  { 120, 159, 120, 133 },   // dreapta jos
};

const TouchZone HALF_BTN[4] = {
  {   2, 126, 116, 74 },
  {   2, 204, 116, 74 },
  { 122, 126, 116, 74 },
  { 122, 204, 116, 74 },
};

const TouchZone DECISION_BTN[2] = {
  {   2, 212, 116, 66 },
  { 122, 212, 116, 66 },
};

const TouchZone HANDOVER_DA = { 16, 170, 208, 62 };

const TouchZone HANDOVER_NU = { 16, 244, 208, 62 };

// Ecranul de pornire. Pana acum, la alimentare aparea un ecran negru cu
// un rand de text - arata a placa de test, nu a aparat de concurs. Si,
// mai practic: fara o bara care avanseaza, arbitrul nu stie daca placa
// lucreaza sau s-a blocat, iar conectarea la WiFi poate dura secunde bune.
void drawSplash(int percent, const char* step) {
  topBarVisible = false;
  ui.fillScreen(NAVY);

  // Sigla e deja compusa peste acelasi navy, deci se aseaza fara contur.
  deseneazaSigla((SCREEN_W - FRVV_LOGO_W) / 2, 28);

  printCentered("APLICATIE ARBITRI", 172, 2, GOLD);

  String version = String("v") + FW_VERSION + "  -  " + FW_UPDATED;
  printCentered(version.c_str(), 198, 1, LIGHTGRAY);

  // Bara de progres: fara ea, o conectare la WiFi de cateva secunde pare
  // un aparat blocat.
  const int barX = 30, barY = 230, barW = 180, barH = 14;
  ui.drawRect(barX, barY, barW, barH, LIGHTGRAY);
  int fill = (barW - 4) * percent / 100;
  if (fill > 0) ui.fillRect(barX + 2, barY + 2, fill, barH - 4, GOLD);

  if (step && step[0]) printCentered(step, 262, 1, WHITE);
}

// In locul ceasului: cat a durat ultimul dus-intors. Verde sub
// 150ms, galben sub 400, rosu peste, "!!" cand ultima cerere a
// picat de tot. La montaj, plimbat pe la fiecare masa, arata unde e
// legatura slaba inainte sa inceapa concursul - acolo unde barele
// pline ar spune ca totul e in regula.
void drawLastRequest(int x, int y) {
  ui.setCursor(x, y);
  if (!lastRequestDone) {
    ui.setTextColor(DARKGRAY);
    ui.print("--");
    return;
  }
  if (!lastRequestOk) {
    ui.setTextColor(RED);
    ui.print("!!");
    return;
  }
  ui.setTextColor(lastRequestMs < 150 ? GREEN : (lastRequestMs < 400 ? YELLOW : RED));
  ui.print(lastRequestMs);
  ui.print("ms");
}

void drawTopBar() {
  // Fara ecran nu se deseneaza. Pare de la sine inteles, dar fara verificarea
  // asta un panou care n-a pornit nu da un avertisment - da o bucla de
  // panica: gfx e null, primul desen il dereferentiaza, placa reporneste, si
  // mesajul care spune de ce s-a intamplat trece prea repede ca sa fie citit.
  // S-a vazut exact asa cand am incercat placa in mod QSPI PSRAM.
  if (!gfx) return;

  topBarVisible = true;
  ui.fillRect(0, 0, SCREEN_W, 25, DARKGRAY);
  ui.drawFastHLine(0, 25, SCREEN_W, LIGHTGRAY);
  ui.setTextSize(1);

  drawSignalBars(6, 6);

  ui.setCursor(30, 9);
  if (WiFi.status() == WL_CONNECTED) {
    ui.setTextColor(WHITE);
    ui.print(refereeShort.length() ? refereeShort : String("WiFi"));
  } else {
    ui.setTextColor(RED);
    ui.print("FARA WIFI");
  }

  // Terenul si pozitia de arbitru, in dreapta - astea doua spun, dintr-o
  // privire, daca dispozitivul e pe locul potrivit. Cat nu e nimic
  // pe saltea locul e liber, si atunci arata calitatea legaturii -
  // adica exact in perioada in care umbli la AP-uri si vrei sa stii
  // daca ai reusit.
  if (liveFieldName[0] || liveRefPosition[0]) {
    ui.setCursor(186, 9);
    ui.setTextColor(YELLOW);
    ui.print(liveFieldName);
    if (liveFieldName[0] && liveRefPosition[0]) ui.print("|");
    ui.print(liveRefPosition);
  } else {
    drawLastRequest(186, 9);
  }
  // Desenul e in cache; panoul citeste PSRAM direct. Fara asta vede
  // pixelii vechi amestecati cu cei noi - dubla expunere. Vezi ecran.h.
  ecranSincronizeaza();
}

// Ecranul de meci in timp real: patru dreptunghiuri cat tot ecranul, asezate
// ca butoanele care erau pe masa. Rosu in stanga, albastru in dreapta, +2 sus
// si +1 jos - sau cum spune BTN=.
//
// Fara numele sportivilor si fara scor. Arbitrul nu citeste ecranul in
// timpul reprizei - are ochii pe saltea. Ecranul e oglinda mainii lui:
// la apasare, dreptunghiul corespunzator se face galben, si atat trebuie sa
// prinda din coltul ochiului ca sa stie ca punctul a plecat. Verde
// inseamna ca l-au confirmat si ceilalti arbitri.
//
// Pe touch, dimensiunea lor nu e doar estetica: un sfert de ecran se
// nimereste fara sa te uiti, un buton de 40 de pixeli nu.
void drawQuadrant(int index) {
  const TouchZone& z = QUADRANTS[index];
  bool isRed  = pointButtons[index].isRed;
  int  points = pointButtons[index].points;

  uint16_t bg = isRed ? SIDE_RED : SIDE_BLUE;

  // Dreptunghiul apasat acum. Il recunoastem dupa culoare si valoare, nu
  // dupa pozitie, ca sa nu existe doua adevaruri despre aceeasi apasare.
  bool mine = (pointState != POINT_NONE)
              && (pointSideRed == isRed)
              && (pointValue == points);
  if (mine) {
    if      (pointState == POINT_VALIDATED) bg = GREEN;
    else if (pointState == POINT_FAILED)    bg = DARKGRAY;
    else if (pointState == POINT_SENDING
          || pointState == POINT_PENDING)   bg = YELLOW;
  }

  ui.fillRect(z.x, z.y, z.w, z.h, bg);
  ui.drawRect(z.x, z.y, z.w, z.h, BLACK);

  char label[4];
  snprintf(label, sizeof(label), "+%d", points);
  // Pe galben si pe verde, textul alb dispare.
  printCenteredIn(z, label, 6, (bg == YELLOW || bg == GREEN) ? BLACK : WHITE);
}

void drawMatchScreen() {
  drawTopBar();

  for (int i = 0; i < 4; i++) drawQuadrant(i);

  // Banda de jos spune ori in ce repriza suntem, ori ce s-a ales de
  // ultima apasare. Nicio apasare nu dispare in tacere.
  ui.fillRect(0, MATCH_BAND_Y, SCREEN_W, SCREEN_H - MATCH_BAND_Y, BLACK);
  switch (pointState) {
    case POINT_SENDING:
      printCentered("SE TRIMITE...", MATCH_BAND_Y + 6, 1, YELLOW);
      break;
    case POINT_PENDING:
      printCentered("TRIMIS - e nevoie de 3 arbitri", MATCH_BAND_Y + 6, 1, YELLOW);
      break;
    case POINT_VALIDATED:
      printCentered("VALIDAT", MATCH_BAND_Y + 4, 2, GREEN);
      break;
    case POINT_FAILED:
      printCentered("NETRIMIS - fara legatura", MATCH_BAND_Y + 6, 1, RED);
      break;
    case POINT_TOO_FAST:
      printCentered("PREA REPEDE - punctul NU a plecat", MATCH_BAND_Y + 6, 1, ORANGE);
      break;
    case POINT_CLOSED:
      printCentered(allRoundsDone ? "MECI INCHEIAT - nu se puncteaza"
                                  : "NU SE PUNCTEAZA ACUM", MATCH_BAND_Y + 6, 1, ORANGE);
      break;
    default:
      if (!roundsKnown) {
        printCentered("...", MATCH_BAND_Y + 4, 2, LIGHTGRAY);
      } else if (allRoundsDone) {
        printCentered("MECI INCHEIAT", MATCH_BAND_Y + 4, 2, GOLD);
      } else if (activeRoundPaused) {
        printCentered("PAUZA", MATCH_BAND_Y + 4, 2, ORANGE);
      } else if (!activeRoundId) {
        printCentered("INTRE REPRIZE", MATCH_BAND_Y + 4, 2, ORANGE);
      } else {
        char line[24];
        snprintf(line, sizeof(line), "REPRIZA %d", activeRoundNumber);
        printCentered(line, MATCH_BAND_Y + 4, 2, GREEN);
      }
      break;
  }
}

// Modul "reveal_final": nu exista validare in doi, fiecare arbitru isi
// tine propriul total. Ecranul se imparte in doua pentru ca arbitrul
// trebuie sa vada permanent ambele numere - ele sunt nota lui, nu un
// simplu semnal ca apasarea a fost primita.
//
// Jumatatile arata, butoanele de dedesubt dau. Pe encoder nu era nevoie de
// despartirea asta - butonul era in afara ecranului.
void drawMatchScoreScreen() {
  drawTopBar();

  // Care colt sta in stanga nu e o alegere de desen: iese din BTN=, ca sa nu
  // existe un arbitru care a pus rosul in dreapta la sferturi si il
  // gaseste in stanga aici.
  bool leftRed  = pointButtons[0].isRed;
  bool rightRed = pointButtons[2].isRed;

  int leftScore  = leftRed  ? myRedScore : myBlueScore;
  int rightScore = rightRed ? myRedScore : myBlueScore;

  drawHalfScoreAt(0,   26, 96, leftRed  ? SIDE_RED : SIDE_BLUE,
                  leftRed  ? "ROSU" : "ALBASTRU",
                  leftRed  ? liveRedName : liveBlueName,
                  roundScoreKnown ? leftScore : 0);
  drawHalfScoreAt(120, 26, 96, rightRed ? SIDE_RED : SIDE_BLUE,
                  rightRed ? "ROSU" : "ALBASTRU",
                  rightRed ? liveRedName : liveBlueName,
                  roundScoreKnown ? rightScore : 0);
  ui.drawFastVLine(120, 26, 96, BLACK);

  if (!roundScoreKnown) {
    // Pana vine nota de la server nu aratam zero: un zero neadevarat se
    // citeste ca "n-am dat niciun punct". Caseta acopera numarul intreg,
    // pana la marginea de jos a jumatatii - cifrele au 48 de pixeli, si o
    // caseta mai scunda le lasa coada la vedere sub text.
    ui.fillRect(0, 60, SCREEN_W, 62, BLACK);
    printCentered("se incarca...", 78, 2, LIGHTGRAY);
  }

  // Butoanele. Stinse cand nu se puncteaza: un buton care arata viu si nu
  // face nimic e mai rau decat unul care arata stins.
  bool viu = canScoreNow();
  for (int i = 0; i < 4; i++) {
    bool isRed  = pointButtons[i].isRed;
    int  points = pointButtons[i].points;
    char label[4];
    snprintf(label, sizeof(label), "+%d", points);
    uint16_t bg = viu ? (isRed ? SIDE_RED : SIDE_BLUE) : DARKGRAY;
    drawButton(HALF_BTN[i], label, bg, viu ? WHITE : LIGHTGRAY, 5);
  }

  ui.fillRect(0, 282, SCREEN_W, SCREEN_H - 282, BLACK);
  if (!roundsKnown) {
    printCentered("...", 290, 2, LIGHTGRAY);
  } else if (activeRoundPaused) {
    printCentered("PAUZA", 290, 2, ORANGE);
  } else if (allRoundsDone) {
    printCentered("MECI INCHEIAT", 290, 2, GOLD);
  } else if (!activeRoundId) {
    printCentered("INTRE REPRIZE", 290, 2, ORANGE);
  } else {
    char line[24];
    snprintf(line, sizeof(line), "REPRIZA %d", activeRoundNumber);
    printCentered(line, 290, 2, GREEN);
  }
}

// Decizia finala. Trei stari pe acelasi ecran: alegerea, confirmarea, si
// decizia deja trimisa.
void drawDecisionScreen() {
  // Deja am decis: nu mai are ce sa faca atingerea. Serverul oricum n-ar
  // accepta o schimbare fara ca adminul sa stearga randul, iar un ecran
  // care pare sa astepte o apasare ar minti.
  if (finalDecided) {
    topBarVisible = false;
    ui.fillScreen(finalChoiceRed ? SIDE_RED : SIDE_BLUE);
    printCentered("DECIZIA TA", 80, 2, WHITE);
    printCentered(finalChoiceRed ? "ROSU" : "ALBASTRU", 130, 4, WHITE);
    printCentered("trimisa", 190, 2, WHITE);
    printCentered("se schimba doar de la masa centrala", 240, 1, WHITE);
    return;
  }

  // O culoare asteapta confirmarea. Ecran plin, ca sa nu existe dubiu
  // despre ce urmeaza sa trimiti.
  if (decisionArmed) {
    topBarVisible = false;
    ui.fillScreen(decisionArmedRed ? SIDE_RED : SIDE_BLUE);
    printCentered(decisionArmedRed ? "ROSU" : "ALBASTRU", 40, 4, WHITE);
    printCentered("APASA DIN NOU", 96, 2, WHITE);
    printCentered("ca sa confirmi castigatorul", 124, 1, WHITE);
    unsigned long left = DECISION_ARM_MS - (millis() - decisionArmedAt);
    char line[24];
    snprintf(line, sizeof(line), "%lus", (left / 1000) + 1);
    printCentered(line, 148, 2, WHITE);
    printCentered("cealalta culoare schimba alegerea", 186, 1, WHITE);

    // Butoanele raman exact unde erau. Pe placa cu butoane confirmarea se
    // dadea pe acelasi buton fiindca butonul nu se muta niciodata; pe ecran,
    // daca le-am scoate, a doua apasare ar fi un ghicit - si ea e cea care
    // trimite decizia.
    bool leftRed = pointButtons[0].isRed;
    drawButton(DECISION_BTN[0], leftRed ? "ROSU" : "ALBASTRU",
               leftRed ? SIDE_RED : SIDE_BLUE, WHITE, 2);
    drawButton(DECISION_BTN[1], leftRed ? "ALBASTRU" : "ROSU",
               leftRed ? SIDE_BLUE : SIDE_RED, WHITE, 2);
    return;
  }

  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();
  printCentered("CINE A CASTIGAT?", 32, 1, GOLD);

  // Totalurile mele, nu ale meciului: arbitrul decide pe ce a notat el.
  bool leftRed = pointButtons[0].isRed;
  drawHalfScoreAt(0,   46, 158, leftRed ? SIDE_RED : SIDE_BLUE,
                  leftRed ? "ROSU" : "ALBASTRU",
                  leftRed ? liveRedName : liveBlueName,
                  leftRed ? myTotalRed : myTotalBlue);
  drawHalfScoreAt(120, 46, 158, leftRed ? SIDE_BLUE : SIDE_RED,
                  leftRed ? "ALBASTRU" : "ROSU",
                  leftRed ? liveBlueName : liveRedName,
                  leftRed ? myTotalBlue : myTotalRed);
  ui.drawFastVLine(120, 46, 158, BLACK);

  drawButton(DECISION_BTN[0], leftRed ? "ROSU" : "ALBASTRU",
             leftRed ? SIDE_RED : SIDE_BLUE, WHITE, 2);
  drawButton(DECISION_BTN[1], leftRed ? "ALBASTRU" : "ROSU",
             leftRed ? SIDE_BLUE : SIDE_RED, WHITE, 2);

  ui.fillRect(0, 282, SCREEN_W, SCREEN_H - 282, BLACK);
  if (!totalsKnown) {
    printCentered("se incarca notele...", 290, 1, LIGHTGRAY);
  } else if (myTotalRed == myTotalBlue) {
    printCentered("EGALITATE - alegi tu", 288, 1, ORANGE);
    printCentered("apasa culoarea castigatoare", 302, 1, LIGHTGRAY);
  } else {
    printCentered("apasa culoarea castigatoare", 295, 1, LIGHTGRAY);
  }
}

// Confirmarea apasarii, pe tot ecranul. Fundalul spune cui i-am dat
// punctul inainte sa citesti ceva: rosu sau albastru la apasare, auriu
// cand punctul a fost validat. Arbitrul se uita la saltea, nu la cutie -
// trebuie sa-i spuna culoarea, din coltul ochiului.
void drawPointOverlay() {
  uint16_t bg = pointSideRed ? SIDE_RED : SIDE_BLUE;
  if (pointState == POINT_VALIDATED) bg = GOLD;
  if (pointState == POINT_FAILED)    bg = DARKGRAY;
  if (pointState == POINT_TOO_FAST)  bg = ORANGE;
  if (pointState == POINT_CLOSED)    bg = DARKGRAY;

  // Bara de sus ramane vizibila. Semnalul, numele arbitrului si terenul
  // sunt exact ce vrei sa poti verifica dintr-o privire tocmai cand
  // tocmai ai trimis un punct - daca le acoperim, arbitrul nu mai are
  // cum sa vada ca a pierdut legatura fix in momentul care conteaza.
  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, bg);
  drawTopBar();

  uint16_t ink = (pointState == POINT_VALIDATED) ? BLACK : WHITE;

  // Numarul mare doar cand chiar exista un punct in spatele lui. La
  // "prea repede" nu stim care sfert a fost respins, iar un "+2" ramas
  // de la apasarea anterioara ar minti.
  if (pointState != POINT_TOO_FAST && pointValue > 0) {
    char big[13];   // "+" + un int intreg, ca sa nu poata fi trunchiat
    snprintf(big, sizeof(big), "+%d", pointValue);
    printCentered(big, 70, pointState == POINT_CLOSED ? 6 : 9, ink);
  }

  // La validare scriem si cine a luat punctul, in culoarea lui: auriul
  // spune "confirmat", cuvantul spune "al cui".
  if (pointState == POINT_VALIDATED) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 200, 3,
                  pointSideRed ? SIDE_RED : SIDE_BLUE);
    printCentered("VALIDAT", 250, 2, BLACK);
  } else if (pointState == POINT_PENDING) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 200, 3, ink);
    printCentered("ASTEPT AL 2-LEA ARBITRU", 260, 1, ink);
  } else if (pointState == POINT_SENDING) {
    printCentered(pointSideRed ? "ROSU" : "ALBASTRU", 200, 3, ink);
    printCentered("SE TRIMITE...", 260, 1, ink);
  } else if (pointState == POINT_CLOSED) {
    printCentered("NU SE PUNCTEAZA", 180, 2, WHITE);
    printCentered(allRoundsDone ? "meciul s-a incheiat"
                  : (activeRoundPaused ? "repriza e in pauza" : "esti intre reprize"),
                  220, 1, WHITE);
    printCentered("punctul NU a fost trimis", 250, 1, ORANGE);
  } else if (pointState == POINT_TOO_FAST) {
    printCentered("PREA REPEDE", 170, 2, WHITE);
    printCentered("punctul NU a fost trimis", 215, 1, WHITE);
    printCentered("apasa din nou daca e o faza noua", 240, 1, WHITE);
  } else {
    printCentered("NETRIMIS", 200, 3, RED);
    printCentered("fara legatura cu serverul", 260, 1, WHITE);
  }
}

void drawStatusScreen() {
  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  ui.setTextSize(2);
  ui.setTextColor(statusIsError ? RED : CYAN);
  ui.setCursor(12, 90);
  ui.println(statusTitle);

  ui.setTextSize(1);
  ui.setTextColor(WHITE);
  drawWrapped(12, 128, 14, 37, statusDetail);

  if (statusIsError) drawButton(ZONA_REIA, "INCEARCA DIN NOU", NAVY, GOLD, 2);
}

// Lista retelelor gasite, cand conectarea a picat. Fara ea, "FARA WIFI"
// nu spune daca reteaua lipseste, e pe 5GHz, sau doar respinge parola -
// si nu ai unde sa te uiti, placa n-are consola la indemana in sala.
void drawWifiDiagScreen() {
  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  ui.setTextSize(2);
  ui.setTextColor(RED);
  ui.setCursor(10, 34);
  ui.println("FARA WIFI");

  ui.setTextSize(1);
  ui.setTextColor(scanFoundOurs ? GREEN : RED);
  ui.setCursor(150, 36);
  ui.print("v");
  ui.print(FW_VERSION);
  ui.print(scanFoundOurs ? " gasit" : " negasit");

  ui.setTextColor(YELLOW);
  drawWrapped(10, 58, 11, 38, statusDetail);

  ui.setTextColor(CYAN);
  ui.setCursor(10, 110);
  if (scanCount == 0) {
    ui.println("Nicio retea 2.4GHz in jur.");
  } else {
    ui.print("Retele gasite (");
    ui.print(scanCount);
    ui.println("):");
  }

  for (int i = 0; i < scanCount; i++) {
    int y = 128 + i * 16;
    bool ours = (wifiSsid == scanRows[i].ssid);
    ui.setTextColor(ours ? GREEN : WHITE);
    ui.setCursor(10, y);
    ui.print(scanRows[i].ssid);
    ui.setCursor(158, y);
    ui.print("c");
    ui.print(scanRows[i].channel);
    ui.setCursor(196, y);
    ui.print(scanRows[i].rssi);
  }

  drawButton(ZONA_REIA, "INCEARCA DIN NOU", NAVY, GOLD, 2);
}

// Cinci cifre, tastate. Pe encoder fiecare cifra se invartea pe loc si
// trebuia confirmata ca sa treci la urmatoarea; aici se tasteaza ca pe
// telefon, "<" sterge ultima si OK intra. Cele neintroduse se arata cu o
// liniuta, nu cu zero: un zero scris acolo s-ar citi ca o cifra data.
void drawPinScreen() {
  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  ui.setTextSize(2);
  ui.setTextColor(CYAN);
  ui.setCursor(10, 34);
  ui.println("PIN ARBITRU");

  ui.setTextSize(1);
  ui.setTextColor(LIGHTGRAY);
  ui.setCursor(10, 56);
  ui.print("Server: ");
  ui.println(serverLabel);

  const int boxW = 38;
  const int boxH = 48;
  const int gap  = 6;
  const int totalW = PIN_DIGITS * boxW + (PIN_DIGITS - 1) * gap;
  int x0 = (SCREEN_W - totalW) / 2;

  for (int i = 0; i < PIN_DIGITS; i++) {
    int x = x0 + i * (boxW + gap);
    bool filled = (i < pinCursor);
    bool here   = (i == pinCursor);

    ui.fillRect(x, 70, boxW, boxH, here ? BLUE : BLACK);
    ui.drawRect(x, 70, boxW, boxH, here ? WHITE : DARKGRAY);

    ui.setTextSize(4);
    ui.setTextColor(filled ? WHITE : DARKGRAY);
    ui.setCursor(x + 7, 82);
    ui.print(filled ? pinDigits[i] : '-');
  }

  for (int i = 0; i < 12; i++) {
    bool isOk  = (i == 11);
    bool isDel = (i == 9);
    // OK se aprinde numai cu PIN-ul complet: un buton care arata gata si
    // raspunde cu o eroare e mai rau decat unul stins.
    uint16_t bg = isOk ? (pinCursor == PIN_DIGITS ? GREEN : DARKGRAY)
                       : (isDel ? NAVY : DARKGRAY);
    uint16_t ink = (isOk && pinCursor == PIN_DIGITS) ? BLACK : WHITE;
    drawButton(PIN_KEYS[i], PIN_LABELS[i], bg, ink, isOk ? 3 : 4);
  }
}

// Conectat, dar masa centrala inca nu a pus pe ecran un sportiv dintr-o
// categorie de-a mea. Nu e o eroare si nu e nimic de apasat - asta e
// starea normala intre doi concurenti.
void drawStandbyScreen() {
  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  ui.setTextSize(2);
  ui.setTextColor(CYAN);
  ui.setCursor(10, 60);
  ui.println("IN ASTEPTARE");

  ui.setTextSize(2);
  ui.setTextColor(WHITE);
  drawWrapped(10, 110, 20, 19, refereeName);

  ui.setTextSize(1);
  ui.setTextColor(LIGHTGRAY);
  drawWrapped(10, 180, 14, 37,
              "Astept ca masa centrala sa afiseze un sportiv dintr-o categorie a mea.");

  ui.setTextColor(DARKGRAY);
  ui.setCursor(10, 280);
  ui.print(myCategoryCount);
  ui.println(" categorii alocate");
  ui.setCursor(10, 296);
  ui.println("Bara de sus: predai dispozitivul");
}

void drawScoreScreen() {
  ui.fillRect(0, 26, SCREEN_W, SCREEN_H - 26, BLACK);
  drawTopBar();

  // Dupa trimitere ramanem pe acelasi ecran cu confirmarea la vedere -
  // altfel arbitrul nu are de unde sti daca a plecat nota.
  if (submittedShown) {
    ui.setTextSize(2);
    ui.setTextColor(WHITE);
    drawWrapped(8, 40, 20, 19, liveCompetitorName);

    ui.setTextSize(4);
    ui.setTextColor(GREEN);
    ui.setCursor(30, 110);
    ui.print("TRIMIS");

    bool cut = revealKnown &&
               ((strcmp(revealMark, "low") == 0) || (strcmp(revealMark, "high") == 0));

    // Nota, la dimensiunea 6: fiecare caracter are 36px latime si 48
    // inaltime. Le calculam ca sa putem trage linia exact peste cifre,
    // oricate ar fi.
    int digits   = (submittedScore >= 100) ? 3 : (submittedScore >= 10 ? 2 : 1);
    int charW    = 36;
    int scoreW   = digits * charW - 6;   // ultima coloana a fontului e spatiu
    int scoreH   = 48;
    int scoreX   = (SCREEN_W - scoreW) / 2;
    int scoreY   = 180;

    ui.setTextSize(6);
    ui.setTextColor(WHITE);
    ui.setCursor(scoreX, scoreY);
    ui.print(submittedScore);

    // Taiata inseamna taiata: o linie rosie peste nota spune asta dintr-o
    // privire, de la distanta, fara sa fie citita. Groasa de trei pixeli,
    // ca sa se vada peste cifre de 48px.
    if (cut) {
      for (int i = -1; i <= 1; i++) {
        ui.drawLine(scoreX - 8, scoreY + scoreH + 6 + i,
                      scoreX + scoreW + 8, scoreY - 6 + i, RED);
      }
    }

    // Dupa dezvaluire, arbitrul afla ce s-a ales de nota lui. Cea mai
    // mica si cea mai mare cad din total; e diferenta dintre a fi contat
    // si a nu fi contat, si pana acum nu o afla niciodata.
    if (revealKnown) {
      ui.setTextSize(2);
      ui.setTextColor(cut ? RED : GREEN);
      ui.setCursor(8, 256);
      if (cut) ui.print(strcmp(revealMark, "low") == 0 ? "cea mai mica" : "cea mai mare");
      else     ui.print("A CONTAT");

      ui.setTextSize(1);
      ui.setTextColor(LIGHTGRAY);
      ui.setCursor(8, 292);
      ui.print("Total sportiv: ");
      ui.print(revealTotal);
      return;
    }

    ui.setTextSize(1);
    ui.setTextColor(DARKGRAY);
    ui.setCursor(8, 292);
    ui.print("Astept urmatorul sportiv");
    return;
  }

  // Istoricul notelor mele din proba asta, sus, peste tot restul. Un
  // arbitru nu noteaza in gol: se raporteaza la ce a dat inainte in
  // aceeasi categorie, si pana acum trebuia sa tina minte singur.
  ui.setTextSize(1);
  int historyBottom = 42;
  if (historyCount == 0) {
    ui.setTextColor(DARKGRAY);
    ui.setCursor(8, 31);
    ui.print("Primul notat din aceasta proba");
  } else {
    int x = 8, y = 31;
    for (int i = 0; i < historyCount; i++) {
      int nameW  = strlen(history[i].name) * 6;
      int scoreW = (history[i].score >= 100 ? 3 : 2) * 6;
      int entryW = nameW + 3 + scoreW + 10;

      if (x + entryW > 236) {      // nu mai incape pe randul asta
        x = 8;
        y += 12;
        if (y > 55) break;         // trei randuri sunt destule
      }

      ui.setTextColor(LIGHTGRAY);
      ui.setCursor(x, y);
      ui.print(history[i].name);
      ui.setTextColor(WHITE);
      ui.setCursor(x + nameW + 3, y);
      ui.print(history[i].score);
      x += entryW;
    }
    historyBottom = y + 12;
  }
  ui.drawFastHLine(0, historyBottom, SCREEN_W, DARKGRAY);

  // Cine e pe saltea - partea care conteaza, cat de mare incape.
  ui.setTextSize(2);
  ui.setTextColor(liveIsTeam ? YELLOW : WHITE);
  int afterName = drawWrapped(8, historyBottom + 9, 20, 19, liveCompetitorName);

  if (mySubmittedScore >= 0) {
    ui.setTextSize(1);
    ui.setTextColor(GREEN);
    ui.setCursor(8, afterName + 1);
    ui.print("Trimis: ");
    ui.print(mySubmittedScore);
    ui.print(" - poti corecta");
  }

  ui.setTextSize(6);
  ui.setTextColor(draftScore >= 90 ? GREEN : (draftScore >= 70 ? YELLOW : ORANGE));
  ui.setCursor(draftScore == MAX_SCORE ? 60 : 78, 140);
  ui.print(draftScore);

  for (int i = 0; i < 4; i++) {
    // Treapta care ar iasa din 0..100 se stinge. Pe encoder nota se oprea
    // singura la capat si nu era nimic de aratat; un buton insa trebuie sa
    // spuna de ce nu face nimic.
    int rezultat = draftScore + SCORE_STEP_DELTA[i];
    bool posibil = (rezultat >= 0 && rezultat <= MAX_SCORE);
    drawButton(SCORE_STEPS[i], SCORE_STEP_LABEL[i],
               posibil ? NAVY : BLACK, posibil ? GOLD : DARKGRAY, 2);
  }

  char trimite[20];
  snprintf(trimite, sizeof(trimite), "TRIMITE %d", draftScore);
  drawButton(SCORE_SEND, trimite, GREEN, BLACK, 2);
}

// Predarea dispozitivului. Pe encoder era o apasare lunga, iar o apasare
// lunga nu se face din greseala. Bara de sus se atinge insa cu cotul, deci
// aici se intreaba - si intrebarea spune pe cine da afara, altfel arbitrul
// care a apasat din reflex nu stie ce pierde.
void drawHandoverScreen() {
  topBarVisible = false;
  ui.fillScreen(NAVY);

  printCentered("PREDAI DISPOZITIVUL?", 40, 2, GOLD);

  ui.setTextSize(1);
  ui.setTextColor(WHITE);
  drawWrapped(12, 78, 14, 37,
              String("Sesiunea lui ") + (refereeName.length() ? refereeName : String("arbitru")) +
              " se inchide, si urmatorul isi formeaza propriul PIN.");

  drawButton(HANDOVER_DA, "DA, PREDAU", RED, WHITE, 2);
  drawButton(HANDOVER_NU, "NU, CONTINUI", DARKGRAY, WHITE, 2);
}

void redraw() {
  // Fara ecran nu se deseneaza. Pare de la sine inteles, dar fara verificarea
  // asta un panou care n-a pornit nu da un avertisment - da o bucla de
  // panica: gfx e null, primul desen il dereferentiaza, placa reporneste, si
  // mesajul care spune de ce s-a intamplat trece prea repede ca sa fie citit.
  // S-a vazut exact asa cand am incercat placa in mod QSPI PSRAM.
  if (!gfx) return;

  switch (screen) {
    case SCREEN_STATUS:     drawStatusScreen();     break;
    case SCREEN_WIFI_DIAG:  drawWifiDiagScreen();   break;
    case SCREEN_PIN:        drawPinScreen();        break;
    case SCREEN_STANDBY:    drawStandbyScreen();    break;
    case SCREEN_SCORE:      drawScoreScreen();      break;
    case SCREEN_HANDOVER:   drawHandoverScreen();   break;
    case SCREEN_MATCH:
      // In timp real ecranul isi arata singur starea, in sfertul
      // apasat - nu-l mai acoperim cu nimic.
      if (liveMatchRealTime)             drawMatchScreen();
      else if (pointState != POINT_NONE) drawPointOverlay();
      else if (needsFinalDecision())     drawDecisionScreen();
      else                               drawMatchScoreScreen();
      break;
  }
  // Desenul e in cache; panoul citeste PSRAM direct. Fara asta vede
  // pixelii vechi amestecati cu cei noi - dubla expunere. Vezi ecran.h.
  ecranSincronizeaza();
}

void handlePinTouch(const TouchEvent& e) {
  int k = zoneIndex(PIN_KEYS, 12, e.x, e.y);
  if (k < 0) return;
  if      (k == 9)  actPinSterge();
  else if (k == 11) actPinTrimite();
  else              actPinCifra((k == 10) ? '0' : (char)('1' + k));
}

void handleScoreTouch(const TouchEvent& e) {
  // Cat timp confirmarea e pe ecran, nimic nu mai raspunde: nota e data.
  // Se deblocheaza singur cand masa centrala aduce urmatorul sportiv.
  if (submittedShown) return;

  int s = zoneIndex(SCORE_STEPS, 4, e.x, e.y);
  if (s >= 0) { actNotaPas(s); return; }
  if (zoneHit(SCORE_SEND, e.x, e.y)) actNotaTrimite();
}

void handleMatchTouch(const TouchEvent& e) {
  // Meciul s-a terminat: sferturile nu mai dau puncte, aleg castigatorul.
  if (needsFinalDecision()) {
    actDecizie(zoneIndex(DECISION_BTN, 2, e.x, e.y));
    return;
  }

  // In timp real sferturile sunt tot ecranul; la afisare finala sunt
  // butoanele de sub jumatati, fiindca acolo numerele trebuie sa ramana
  // vizibile. Indexul e acelasi in ambele cazuri.
  actSfert(liveMatchRealTime ? zoneIndex(QUADRANTS, 4, e.x, e.y)
                             : zoneIndex(HALF_BTN, 4, e.x, e.y));
}

void handleTouch(const TouchEvent& e) {
  // In proba, nicio atingere nu face nimic in afara de a se raporta pe cablu.
  // Asa se verifica, inainte de competitie, daca panoul e montat pe aceleasi
  // axe ca ecranul - coordonata bruta si cea dusa in ecran, una langa alta.
  if (modTest) {
    int sfert = zoneIndex(QUADRANTS, 4, e.x, e.y);

    // Doua linii pe aceeasi apasare, pentru doi cititori diferiti.
    //
    // ATINGERE e cea noua si singura care conteaza aici: coordonata bruta a
    // panoului langa cea dusa in ecran. Daca panoul e montat pe alte axe, doar
    // perechea asta o arata - pe ecran totul pare in regula, doar punctul
    // pleaca culorii gresite.
    Serial.printf("ATINGERE\t%u\t%u\t%d\t%d\t%s\n",
                  e.rawX, e.rawY, e.x, e.y,
                  sfert >= 0 ? rolButoane[sfert] : "-");

    // BUTON e cea veche, pe care launcherul o asteapta deja ca sa aprinda
    // punctul fiecarui sfert (vezi DeviceWifiPage.jsx). O trimitem ca pagina
    // de proba sa functioneze nemodificata: sfertul de ecran raspunde la
    // aceeasi intrebare la care raspundea butonul lipit - "a reactionat?".
    if (sfert >= 0) Serial.printf("BUTON\t%d\t%s\n", sfert + 1, rolButoane[sfert]);
    return;
  }

  // Bara de sus preda dispozitivul, dar numai de pe ecranele in care exista o
  // sesiune de predat. Nu cand o decizie asteapta confirmarea: acolo ecranul e
  // plin si bara nici nu se vede, deci o apasare sus e un ghicit, nu o
  // intentie.
  if (zoneHit(ZONA_BARA_SUS, e.x, e.y)) { actCerePredare(); return; }

  switch (screen) {
    case SCREEN_STATUS:
      // Ca pe placa veche: daca WiFi-ul e in regula ne intoarce la PIN, daca
      // nu, incearca din nou conexiunea.
      if (statusIsError && zoneHit(ZONA_REIA, e.x, e.y)) actReia();
      break;

    case SCREEN_WIFI_DIAG:
      if (zoneHit(ZONA_REIA, e.x, e.y)) startSession();
      break;

    case SCREEN_HANDOVER:
      if      (zoneHit(HANDOVER_DA, e.x, e.y)) actPredare(true);
      else if (zoneHit(HANDOVER_NU, e.x, e.y)) actPredare(false);
      break;

    case SCREEN_PIN:     handlePinTouch(e);   break;
    case SCREEN_SCORE:   handleScoreTouch(e); break;
    case SCREEN_MATCH:   handleMatchTouch(e); break;

    // Nimic de apasat: asta e starea normala intre doi concurenti.
    case SCREEN_STANDBY: break;
  }
}

// Interfata asta n-are nevoie de timp propriu: deseneaza cand i se cere si
// atat. Exista doar fiindca perechea ei, LVGL, are nevoie - si contractul
// dintre logica si interfata trebuie sa fie acelasi pentru amandoua.
void uiTick() {}
