# Test comenzi vocale

Măsoară dacă arbitrajul prin voce e viabil **în sală**, înainte să
construim ceva în competition admin. Nu e o funcție, e un instrument de
măsură — de aceea stă separat.

Nimic nu iese în internet: Whisper rulează local.

## Ce măsoară, și de ce așa

Trei rezultate, nu două:

| Rezultat | Înseamnă | Cât de grav |
|---|---|---|
| **corect** | comanda a fost înțeleasă | — |
| **comandă greșită** | a înțeles altceva și ar fi aplicat altceva | **inacceptabil** |
| **respins** | n-a înțeles și cere repetarea | acceptabil |

Distincția asta e tot rostul testului. Un punct dat culorii greșite
strică un meci; o comandă respinsă doar enervează. Pragul de acceptare
trebuie pus pe prima coloană, nu pe rata brută de recunoaștere.

## Cum se rulează

```bash
cd prototypes/voice-commands
./.venv/bin/python server.py
```

Apoi deschide **`http://localhost:8777`**.

Adresa contează: browserele refuză accesul la microfon pe conexiuni
nesecurizate, iar `navigator.mediaDevices` pur și simplu nu există pe
`http://192.168.x.x`. Pe `localhost` funcționează.

Pune casca, apasă *Începe*, și du-te pe saltea. Comenzile se anunță **în
cască** și confirmarea vine tot acolo — nu trebuie să te uiți la ecran.
La final, *Descarcă CSV*.

**Fă testul cu tribuna plină.** În liniște nu afli nimic util.

## Măsurătoarea de referință

Cu voce sintetizată (`say -v Ioana`), în liniște absolută, model
`whisper-small-mlx`:

```
corecte 17/17   greșite 0   respinse 0
latență mediană 162 ms, maxim 583 ms
```

Asta e plafonul. Orice scădere în sală e zgomotul, nu unealta.

Latența e mult sub ce estimasem — dar prima cerere durează ~90 s, cât se
descarcă modelul. Pornește serverul înainte de test, nu în timpul lui.

## Ce a ieșit deja din măsurători

Trei lucruri, găsite înainte de orice test cu oameni:

**Cuvintele scurte singure ies prost.** „pauză" a fost transcris
„Pănguza", „reia" a ieșit „Bărădian". Două silabe nu-i dau modelului
destul material. Comanda e acum „oprește timpul", iar „reia" a devenit
„reia repriza".

**„minus" e auzit constant „minuz".** Prima dată asta a produs exact
eroarea periculoasă: *minus un punct roșu* a fost potrivit cu *un punct
roșu* — a adăugat în loc să scadă. Reparat în două straturi: tokenul se
normalizează, iar peste el stă o gardă structurală — dacă rostirea
conține o urmă de scădere, comanda **trebuie** să fie una de scădere,
altfel se respinge.

**Contradicțiile se resping.** Dacă în aceeași rostire apar ambele
culori, sau și „un punct" și „două puncte", nu există intenție clară.

Gărzile astea sunt motivul pentru care coloana „comandă greșită" e zero.
Ele contează mai mult decât rata de recunoaștere.

## Dacă vrei alt model

```bash
WHISPER_MODEL=mlx-community/whisper-medium-mlx ./.venv/bin/python server.py
```

`medium` e mai exact și mai lent. Merită încercat dacă `small` scade sub
prag în zgomot.

## Fișiere

- `commands.py` — vocabularul și potrivirea, cu gărzile. Partea care va
  fi refolosită dacă funcția se construiește.
- `server.py` — transcriere locală, fără rețea.
- `index.html` — testul propriu-zis.
