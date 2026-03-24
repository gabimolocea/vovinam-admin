# Configurare DigitalOcean App Platform pentru backend API

Obiectiv: publici backend-ul Django pe DigitalOcean, apoi aplicațiile Firebase pot face `GET` și `POST` către `/api/` cu chei gestionate din Django admin.

## Fișiere pregătite

În proiect există acum:
- [backend/Procfile](backend/Procfile)
- [.do/app-api.template.yaml](.do/app-api.template.yaml)
- [docs/DIGITALOCEAN_FIREBASE_API_ACCESS.md](docs/DIGITALOCEAN_FIREBASE_API_ACCESS.md)

## Varianta recomandată

Folosește **DigitalOcean App Platform** cu:
- sursa din GitHub
- `source_dir = backend`
- Python app
- PostgreSQL managed database

## Pasul 1: urcă repo-ul în GitHub

Dacă nu este deja urcat:
- împinge branch-ul dorit, de exemplu `dev`
- verifică să existe folderul `backend/`

## Pasul 2: creează aplicația în DigitalOcean

În DigitalOcean:
1. `Create` → `Apps`
2. conectează repo-ul GitHub
3. selectează repo-ul
4. branch: `dev` sau branch-ul tău de deploy
5. la componentă setează:
   - **Type**: `Web Service`
   - **Source Directory**: `backend`
   - **Environment**: `Python`

## Pasul 3: comenzi corecte

Nu trebuie să scrii manual comanda dacă DigitalOcean vede [backend/Procfile](backend/Procfile).

Acum el conține:
- `release`: colectează static + rulează migrări
- `web`: pornește `gunicorn`

## Pasul 4: baza de date

Adaugă un database component:
- PostgreSQL 15
- un plan mic pentru început

Apoi leagă variabila `DATABASE_URL` la backend.

## Pasul 5: environment variables

Setează în App Platform aceste variabile:

### Obligatorii
- `DJANGO_SETTINGS_MODULE=crud.settings_production`
- `DEBUG=False`
- `DJANGO_SECRET_KEY=<o cheie lungă și random>`
- `ALLOWED_HOSTS=<numele-aplicației>.ondigitalocean.app`
- `DATABASE_URL=<injectat din DB component>`

### Pentru subdomenii curate
- `ADMIN_ROOT_HOSTS=admin.vovinam.ro`
- `API_ROOT_HOSTS=api.vovinam.ro`

Cu aceste variabile:
- [admin.vovinam.ro](admin.vovinam.ro) va servi admin-ul direct la rădăcină
- [api.vovinam.ro](api.vovinam.ro) va servi API-ul direct la rădăcină

### Pentru Firebase / frontends
- `CORS_ALLOWED_ORIGINS=https://app1.web.app,https://app1.firebaseapp.com,https://app2.web.app,https://app2.firebaseapp.com`

Dacă ai și domeniu custom:
- adaugă și acel domeniu în `ALLOWED_HOSTS`
- adaugă și acel origin în `CORS_ALLOWED_ORIGINS`

Exemplu complet:
- `ALLOWED_HOSTS=my-app.ondigitalocean.app,admin.vovinam.ro,api.vovinam.ro`
- `ADMIN_ROOT_HOSTS=admin.vovinam.ro`
- `API_ROOT_HOSTS=api.vovinam.ro`
- `CORS_ALLOWED_ORIGINS=https://admin.vovinam.ro,https://app1.web.app,https://app1.firebaseapp.com`

## Pasul 6: import din YAML

Dacă preferi import din fișier, folosește:
- [.do/app-api.template.yaml](.do/app-api.template.yaml)

Înainte de import:
- înlocuiește `YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME`
- înlocuiește `YOUR-APP-NAME`
- înlocuiește `YOUR-FRONTEND`
- înlocuiește `REPLACE_WITH_A_LONG_RANDOM_SECRET`

## Pasul 7: primul deploy

După primul deploy:
1. deschide URL-ul aplicației
2. verifică [admin.vovinam.ro](admin.vovinam.ro) sau `/admin/`
3. verifică [api.vovinam.ro](api.vovinam.ro) sau `/api/`
4. loghează-te în admin

## Pasul 8: creează cheia pentru Firebase din admin

În admin:
1. mergi la `API` → `Clienți API externi`
2. creează un client nou
3. alege un `service_user` dedicat
4. pune origin-urile aplicației Firebase, câte unul pe linie:
   - `https://app1.web.app`
   - `https://app1.firebaseapp.com`
5. alege dacă permiți și scriere (`allow_write`)
6. salvează
7. copiază cheia generată

## Pasul 9: folosire din Firebase

În Firebase app sau Cloud Functions, trimite:
- `X-API-Key: <cheia_generată>`

Exemplu:

```js
await fetch('https://api.vovinam.ro/athletes/', {
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});
```

## Recomandare de securitate

Pentru `GET` public sau semi-public:
- poți apela direct din frontend Firebase

Pentru `POST` sensibil:
- recomandat prin Firebase Cloud Functions
- cheia rămâne pe server, nu în browser

## Checklist final

- [ ] repo-ul este pe GitHub
- [ ] aplicația App Platform creată
- [ ] database PostgreSQL atașat
- [ ] variabilele de mediu setate
- [ ] deploy reușit
- [ ] `/admin/` funcționează
- [ ] `/api/` funcționează
- [ ] clientul API extern a fost creat
- [ ] aplicația Firebase poate face `GET`
- [ ] aplicația Firebase poate face `POST` unde are voie
