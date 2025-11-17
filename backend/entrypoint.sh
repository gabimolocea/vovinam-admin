#!/bin/bash
set -e

echo "Running database migrations..."
python manage.py migrate --noinput --verbosity 1

echo "Starting Gunicorn..."
exec gunicorn crud.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120
