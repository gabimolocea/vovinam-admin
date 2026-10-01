#!/bin/bash
#
# Dublu-clic pe acest fisier porneste tot ce trebuie pentru o zi de
# competitie, in ordinea corecta.
#
# De ce exista: launcherul porneste el Docker, nu invers - dar are nevoie
# ca Docker Desktop sa fie deja pornit, altfel `docker info` esueaza si
# launcherul cade pe varianta cu SQLite fara sa spuna de ce. Pe langa
# asta, aplicatia impachetata nu are de unde sti unde e proiectul pe disc
# (vezi apps/launcher/electron/repoRoot.js), asa ca i-o spunem noi de aici.
#
# Fisierul trebuie sa ramana in radacina proiectului - de acolo isi afla
# singur calea. Daca vrei o scurtatura pe birou, fa un alias (clic dreapta
# > Creeaza alias), nu o copie.

set -u

REPO="$(cd "$(dirname "$0")" && pwd)"
APP="$REPO/apps/launcher/release/mac-arm64/FRVV Competition Launcher.app"
APP_BIN="$APP/Contents/MacOS/FRVV Competition Launcher"

say() { printf '\n  %s\n' "$1"; }
fail() {
  printf '\n  ✗ %s\n\n  Apasa o tasta ca sa inchizi fereastra.\n' "$1"
  read -r -n 1 -s
  exit 1
}

printf '\n  Pornire competitie — FRVV\n  %s\n' "$(printf '─%.0s' {1..40})"

# --- 1. Chiar suntem in proiect? ---------------------------------------
if [ ! -f "$REPO/backend/manage.py" ] || [ ! -f "$REPO/docker-compose.local.yml" ]; then
  fail "Fisierul nu mai e in folderul proiectului.
    L-am cautat in: $REPO
    Mutat inapoi in folderul care contine \"backend\", sau foloseste un alias."
fi

# --- 2. Docker Desktop ---------------------------------------------------
# `docker info` e singura verificare care conteaza: comanda `docker` poate
# exista si cand programul nu ruleaza, si atunci tot nu se poate porni nimic.
if docker info >/dev/null 2>&1; then
  say "✓ Docker ruleaza."
else
  say "Docker nu ruleaza — il pornesc. Dureaza de obicei 20-30 de secunde."
  open -a Docker 2>/dev/null || fail "Nu gasesc Docker Desktop.
    Instaleaza-l de la docker.com, apoi incearca din nou."

  printf '    asteptare'
  for _ in $(seq 1 90); do
    if docker info >/dev/null 2>&1; then
      printf '\n'
      say "✓ Docker a pornit."
      break
    fi
    printf '.'
    sleep 2
  done

  docker info >/dev/null 2>&1 || fail "Docker nu a pornit in 3 minute.
    Deschide-l manual, asteapta sa scrie ca merge, apoi incearca din nou."
fi

# --- 3. Launcherul -------------------------------------------------------
# FRVV_REPO_ROOT e felul in care aplicatia impachetata afla unde e
# proiectul. O retine singura dupa prima pornire, deci de a doua oara merge
# si deschisa direct din Dock.
export FRVV_REPO_ROOT="$REPO"

if [ -x "$APP_BIN" ]; then
  say "Deschid launcherul…"
  # Desprins de terminal, ca fereastra asta sa poata fi inchisa fara sa
  # opreasca aplicatia in mijlocul competitiei.
  nohup "$APP_BIN" >/dev/null 2>&1 &
  disown
  say "Gata. Poti inchide aceasta fereastra."
  sleep 2
  exit 0
fi

# Aplicatia nu e construita: pornim din sursa. Merge la fel, doar ca
# fereastra asta trebuie sa ramana deschisa cat tine competitia.
say "Aplicatia nu e construita — pornesc din sursa."
command -v npm >/dev/null 2>&1 || fail "Nu gasesc npm.
    Instaleaza Node.js de la nodejs.org, apoi incearca din nou."

if [ ! -d "$REPO/node_modules" ]; then
  say "Prima pornire: instalez dependintele. Dureaza cateva minute."
  (cd "$REPO" && npm install) || fail "Instalarea dependintelor a esuat."
fi

say "NU inchide aceasta fereastra cat timp folosesti aplicatia."
cd "$REPO" || fail "Nu pot intra in folderul proiectului."
npm run dev --workspace @vovinam/launcher
