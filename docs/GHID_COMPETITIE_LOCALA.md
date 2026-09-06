# Ghid: cum organizezi o competiție pe rețea locală (LAN)

Acest ghid explică, în limbaj simplu, cum se desfășoară o competiție atunci
când sala **nu are internet** (sau internetul e nesigur): toate datele
folosite în timpul competiției rulează pe un laptop din sală, iar la final
rezultatele sunt aduse înapoi în aplicația din cloud.

Ghidul are **două roluri diferite**, marcate clar peste tot:

- 🔧 **Rol tehnic** — o persoană cu cunoștințe minime de calculator, care
  pregătește laptopul **o singură dată**, cu mult înainte de eveniment, și
  care îl pornește/oprește în ziua competiției. Nu trebuie să știe
  programare — doar să copieze/lipească niște comenzi exact cum sunt scrise.
- 🧑‍💼 **Rol operator** — persoana care lucrează efectiv în aplicație în ziua
  competiției (secretariat, arbitru șef, organizator). Tot ce face acest rol
  se întâmplă **doar prin click-uri în aplicație**, fără nicio comandă.

Dacă ești operator, poți sări direct la secțiunea **„Ziua competiției"**.

Pentru detalii tehnice de arhitectură (pentru dezvoltatori), vezi
`docs/LOCAL_EVENT_TECHNICAL_PLAN.md`.

---

## Glosar rapid (fără termeni tehnici)

- **Cloud** = aplicația de zi cu zi, de pe internet, pe care o folosești
  acum (`https://...`). Aici stau toate datele permanent.
- **Server local** = un laptop din sala de concurs care, în ziua
  competiției, ține o **copie completă** a datelor evenimentului și
  funcționează exact ca aplicația din cloud, dar fără nevoie de internet.
- **Export event pack** = „trimite o copie a evenimentului din cloud spre
  laptopul din sală".
- **Import rezultate** = „trimite rezultatele adunate în sală înapoi în
  cloud, la final".
- **Backup** = o „poză" completă a datelor, salvată automat, la care te
  poți întoarce oricând dacă ceva merge greșit.
- **Restaurare** = „revino la o poză (backup) salvată mai devreme".

---

## 🔧 Partea tehnică — pregătire (o singură dată, cu mult înainte de eveniment)

Această secțiune se face **o singură dată**, nu la fiecare competiție. Ai
nevoie de un laptop dedicat, care va deveni „serverul din sală".

1. Instalează [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   pe acel laptop (e un program gratuit, ca orice altă aplicație — următor,
   următor, finish).
2. Copiază proiectul pe laptop (cere ajutorul dezvoltatorului dacă nu ești
   sigur cum, e un singur `git clone`).
3. Instalează dependențele frontend, o singură dată, deschizând un terminal
   în folderul proiectului și rulând:
   ```bash
   npm ci
   ```
4. Copiază fișierul de configurare:
   ```bash
   cp .env.local.example .env.local
   ```
5. Deschide fișierul `.env.local` cu un editor de text simplu (Notepad,
   TextEdit) și pune orice valoare deocamdată la `LAN_HOST` — o vei corecta
   ușor în ziua competiției, la pasul următor.

Gata — laptopul e pregătit pentru orice competiție viitoare, nu mai trebuie
refăcut acest pas.

---

## 🔧 Partea tehnică — pornirea în ziua competiției

### 1. Rețeaua Wi-Fi a evenimentului

- Un router Wi-Fi dedicat evenimentului, cu nume propriu de rețea (ex.
  `FRVV-EVENT`) și parolă.
- **Important**: dezactivează opțiunea „client isolation" / „AP isolation"
  din setările routerului (dacă există) — altfel dispozitivele din sală nu
  se vor putea vedea între ele.
- Internetul pe acest router e opțional — totul funcționează și fără el.
- Toate dispozitivele din sală (tablete arbitri, ecrane de afișaj, laptopul
  operatorului) se conectează la acest Wi-Fi.

### 2. Află adresa laptopului în rețea

- macOS: deschide Terminal → `ipconfig getifaddr en0` (sau `en1` pentru
  Wi-Fi, dacă `en0` nu dă rezultat).
- Windows: deschide „Command Prompt" → `ipconfig` → caută „IPv4 Address" la
  adaptorul conectat la routerul de eveniment.
- Pune acea adresă (ex. `192.168.1.50`) în `.env.local`, la `LAN_HOST=`.

### 3. Pornește serverul local

Din folderul proiectului, pe laptopul din sală:

```bash
docker compose -f docker-compose.local.yml --env-file .env.local up -d --build
```

Așteaptă ~30 de secunde (prima dată durează mai mult). Verifică că a pornit:

```bash
docker compose -f docker-compose.local.yml ps
curl http://localhost:8000/health/
```

Ar trebui să vezi `{"status": "ok", ...}`.

### 4. Pornește aplicațiile din browser

```bash
./scripts/start-all-apps.sh
```

De acum, tot ce urmează (exportul evenimentului, lucrul din timpul
competiției, sincronizarea rezultatelor) se face **doar din aplicație**, de
către operator — nu mai e nevoie de niciun terminal, decât la final, pentru
oprirea serverului (vezi ultima secțiune).

Adresele pentru dispozitivele din sală (nu `localhost`, ci adresa aflată la
pasul 2, de ex. `192.168.1.50`):

| Ce deschizi | Adresă |
|---|---|
| Aplicația de administrare | `http://<LAN_HOST>:5173` |
| Aplicația de arbitraj (tablete) | `http://<LAN_HOST>:5176` |
| Ecran public de afișaj | `http://<LAN_HOST>:5177` |

---

## 🧑‍💼 Ziua competiției — ce face operatorul

### Pasul 1 — Verifică datele în cloud, **înainte** de a trimite spre local

- [ ] Toți sportivii, cluburile, categoriile, brackets-urile, programarea
      terenurilor și arbitrii sunt complete în **cloud**.
- [ ] Laptopul „server local" e pornit (vezi partea tehnică de mai sus).

### Pasul 2 — Trimite evenimentul din cloud spre laptopul din sală

1. În aplicația **cloud**, deschide evenimentul → tab **Sincronizare**.
2. Apasă **„1. Exportă event pack"**. Se descarcă un fișier.
   Evenimentul se **blochează automat în cloud** — nimeni nu mai poate
   edita acolo date operaționale (sportivi în categorii, meciuri, arbitri)
   cât timp lucrezi local, ca să nu apară două versiuni diferite ale
   aceleiași informații.
3. Apasă **„2. Marchează operarea locală"**.
4. Deschide aplicația **locală** (`http://localhost:5173` sau
   `http://<LAN_HOST>:5173`), intră în evenimentul importat local, tab
   Sincronizare → **„Importă event pack"** → alege fișierul descărcat la
   pasul 2.

De acum, laptopul din sală are toate datele necesare și e complet
independent de internet.

### Pasul 3 — Lucrezi normal, toată competiția

Folosești aplicația exact ca de obicei (introduci rezultate, actualizezi
scoruri, gestionezi meciuri) — doar că acum vorbești cu laptopul din sală,
nu cu internetul.

**Backup automat**: la fiecare 15 minute se salvează automat o „poză"
completă a datelor. Nu trebuie să faci nimic, rulează singur.

**Dacă greșești ceva și vrei să te întorci în timp:**

1. Tab Sincronizare → secțiunea **„Backup & restaurare (mașina timpului)"**.
2. Vezi lista de „poze" salvate, fiecare cu „acum X minute/ore" și tipul ei
   (Automat / Manual / Înainte de import / Siguranță).
3. Apasă **„Restaurează"** pe poza de dinainte de greșeală → confirmă.
4. Înainte de restaurare se salvează automat o poză nouă a stării actuale —
   deci dacă te răzgândești, poți restaura din nou și reveni exact unde
   erai, fără să pierzi nimic.

Recomandare: înainte de o operațiune riscantă (ex. regenerare brackets),
apasă întâi **„Backup acum"** manual, ca reper clar.

### Pasul 4 — Ai nevoie să adaugi un sportiv nou sau să modifici o categorie, în timpul competiției? ⚠️

**Da, poți face asta direct pe laptopul din sală, normal, din aplicație —
nimic nu blochează asta local.** Laptopul rulează aceeași aplicație completă
ca în cloud, nu doar o listă statică.

Există însă o singură regulă importantă de reținut, legată de cum se aduc
datele **înapoi** în cloud la final:

- Dacă editezi ceva ce **exista deja în cloud** înainte de export (ex. adaugi
  la o categorie un sportiv care era deja înregistrat, îi modifici greutatea,
  schimbi rezultatul unui meci existent) → **totul se sincronizează perfect
  înapoi în cloud**, fără nicio problemă.
- Dacă adaugi un sportiv **complet nou** (care nu exista deloc în cloud
  înainte de export — ex. un sportiv „de rezervă" înscris chiar în ziua
  competiției) sau creezi o **categorie complet nouă** local → acel
  sportiv/acea categorie **nu vor fi aduse automat înapoi în cloud** la
  sincronizarea de final. Sistemul de sincronizare a rezultatelor e făcut
  intenționat să nu creeze date noi în cloud automat (ca să nu apară din
  greșeală date duplicate sau greșite) — el doar actualizează ce exista deja.

**Ce faci în acest caz — două opțiuni:**

- **Opțiune recomandată, dacă ai puțin internet (chiar și de pe telefon,
  câteva minute):** adaugă rapid sportivul nou (sau categoria nouă) direct
  în aplicația **cloud** — se poate face oricând, editarea unui sportiv nu
  e blocată de sincronizare. Apoi refă exportul din cloud (pasul „1. Exportă
  event pack") și reimportă-l în laptopul local — e sigur să repeți acest
  pas oricând în timpul competiției, nu se pierde nimic din ce ai lucrat deja
  local.
- **Dacă nu ai deloc internet:** continuă normal, adaugă sportivul/categoria
  direct local și lucrează cu ei toată ziua. La final, când te reconectezi la
  internet, **adaugă manual acel sportiv/acea categorie și în cloud** (ca de
  obicei, prin formularul normal), apoi introdu manual rezultatul lui —
  pentru că sincronizarea automată nu îl va aduce singură. E un pas în plus,
  dar apare rar (doar la înscrieri de ultim moment) și durează 1-2 minute per
  sportiv.

Dacă încerci totuși să imporți rezultate care se referă la un sportiv sau o
categorie complet nouă, aplicația va afișa o eroare clară de tipul „acest
sportiv/categorie nu există în cloud" — nu se strică nimic, doar acel import
nu se face până nu rezolvi manual (opțiunile de mai sus).

---

## 🧑‍💼 După competiție — aduci rezultatele înapoi în cloud

1. Din aplicația **locală**, tab Sincronizare → **„Exportă rezultate
   locale"**. Se descarcă un fișier.
2. Trimite acel fișier (ex. pe email, WhatsApp, USB) către un calculator cu
   acces la internet.
3. Din aplicația **cloud**, același eveniment → tab Sincronizare →
   **„3. Import rezultate în cloud"** → alege fișierul.
4. Verifică rezultatele importate (clasamente, diplome).
5. Apasă **„4. Finalizează și deblochează"**. Evenimentul redevine normal,
   editabil în cloud ca înainte.

## 🔧 Partea tehnică — oprirea serverului local

După ce ai finalizat sincronizarea (pasul 5 de mai sus), pe laptopul din
sală:

```bash
docker compose -f docker-compose.local.yml down
```

Datele rămân salvate pentru orice eventualitate, dar nu mai sunt necesare —
poți oricând porni un ciclu nou pentru următoarea competiție cu un export
nou de event pack.

---

## Depanare rapidă

| Problemă | Soluție |
|---|---|
| O tabletă de arbitraj nu se conectează | Verifică că e pe Wi-Fi-ul evenimentului și că folosește `http://<LAN_HOST>:5176`, nu `localhost`. |
| `docker compose ... up` eșuează la pornire | (🔧 tehnic) Rulează `docker compose -f docker-compose.local.yml logs backend`; verifică că portul 8000/5432 nu e deja ocupat de alt program. |
| Ai restaurat un backup greșit | Restaurează din nou, de data asta poza cu eticheta „Siguranță (înainte de restaurare)" creată automat chiar înainte. |
| Vrei să repornești de la zero un test local | (🔧 tehnic) `docker compose -f docker-compose.local.yml down -v` — șterge și datele/backup-urile. **Nu folosi în timpul unui eveniment real.** |
| Importul de event pack eșuează | Citește mesajul de eroare afișat — de obicei lipsește o referință (club/sportiv) care nu exista în cloud la momentul exportului. Reexportă din cloud după ce corectezi acolo. |
| Importul de rezultate refuză un sportiv/categorie | Normal — vezi secțiunea „Ai nevoie să adaugi un sportiv nou..." de mai sus. Adaugă manual acel sportiv/categorie în cloud, apoi introdu manual rezultatul. |

---

## Rezumat pe scurt (cheat-sheet)

```
ÎNAINTE:   cloud → Exportă event pack → server local → Importă event pack
ÎN TIMPUL: totul rulează local, backup automat la 15 min, poți restaura oricând
           sportivi/categorii NOI local → nu se sincronizează automat (vezi FAQ)
DUPĂ:      server local → Exportă rezultate → cloud → Importă rezultate → Finalizează
```
