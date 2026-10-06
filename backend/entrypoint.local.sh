#!/bin/bash
set -e

echo "Aștept baza de date PostgreSQL locală..."
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USER:-frvv}" >/dev/null 2>&1; do
  sleep 1
done

echo "Colectez fișierele statice..."
python manage.py collectstatic --noinput --clear

echo "Rulez migrațiile..."
python manage.py migrate --noinput --verbosity 1

# Cati workeri.
#
# Trei erau un numar fix, scris cand un singur teren era tot ce rula. Un worker
# duce o singura cerere odata: cu trei terenuri in sala, fiecare cu ecranul lui
# de operare, cu ecranul din sala si cu cinci device-uri, trei workeri inseamna
# ca a patra cerere asteapta.
#
# Regula obisnuita e 2 x nuclee + 1. Plafonul de 9 e pentru memorie: fiecare
# worker tine un proces Django de vreo 100 MB, iar laptopul din sala nu e
# masina de productie.
NUCLEE=$(nproc 2>/dev/null || echo 2)
WORKERS=${GUNICORN_WORKERS:-$(( NUCLEE * 2 + 1 ))}
if [ "$WORKERS" -gt 9 ]; then WORKERS=9; fi

echo "Pornesc Gunicorn pe portul 8000 cu $WORKERS workeri ($NUCLEE nuclee)..."
exec gunicorn crud.wsgi:application --bind 0.0.0.0:8000 --workers "$WORKERS" --timeout 120
