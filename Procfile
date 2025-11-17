release: python backend/manage.py migrate --noinput
web: cd backend && gunicorn crud.wsgi:application --bind 0.0.0.0:8080
