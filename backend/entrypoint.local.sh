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

echo "Pornesc Gunicorn pe portul 8000..."
exec gunicorn crud.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
