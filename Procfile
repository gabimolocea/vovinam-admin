release: python manage.py migrate --noinput
web: gunicorn crud.wsgi:application --bind 0.0.0.0:8080
