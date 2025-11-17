#!/bin/bash
set -e

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Starting Gunicorn..."
exec gunicorn crud.wsgi:application --bind 0.0.0.0:8080 --workers 2 --timeout 120
