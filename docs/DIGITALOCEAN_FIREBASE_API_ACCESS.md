# DigitalOcean + Firebase API access

Scop: backend-ul Django rămâne sursa de adevăr, este publicat pe DigitalOcean, iar aplicațiile Firebase pot face `GET` și `POST` către `/api/` folosind o cheie API administrată din Django admin.

## 1. Deploy backend-ul pe DigitalOcean

Recomandare: DigitalOcean App Platform.

Setări importante:
- Source directory: `backend`
- Run command: din `Procfile` sau `gunicorn`
- Environment:
  - `DJANGO_SETTINGS_MODULE=crud.settings_production`
  - `DEBUG=False`
  - `DJANGO_SECRET_KEY=<cheie puternică>`
  - `ALLOWED_HOSTS=<domeniul-app-platform>,<domeniul-tău>`
  - `ADMIN_ROOT_HOSTS=admin.vovinam.ro`
  - `API_ROOT_HOSTS=api.vovinam.ro`
  - `DATABASE_URL=<postgres-url>`
  - `CORS_ALLOWED_ORIGINS=https://admin-ul-tău.example.com`

După deploy:
- rulează migrațiile
- creează superuser
- intră în admin

## 2. Ce s-a adăugat în proiect

Există acum un model nou în admin:
- `Client API extern`

Din admin poți seta:
- numele aplicației Firebase
- utilizatorul intern folosit pentru autentificare
- cheia API
- origin-urile permise (`https://*.web.app`, `https://*.firebaseapp.com` etc.)
- dacă aplicația poate face și scriere, nu doar citire

## 3. Cum configurezi accesul pentru o aplicație Firebase

În Django admin:
1. deschide `API -> Clienți API externi`
2. creează un client nou
3. alege `service_user`
   - recomandat: un utilizator dedicat, nu contul principal de admin
4. completează `allowed_origins`, câte unul pe linie, de exemplu:
   - `https://my-app.web.app`
   - `https://my-app.firebaseapp.com`
   - `http://localhost:3000`
5. lasă `Cheie API nouă` goală pentru generare automată sau introdu manual una
6. bifează `Permite scriere` dacă aplicația trebuie să facă `POST`
7. salvează și copiază cheia afișată o singură dată

## 4. Cum apelezi API-ul din Firebase

Trimite cheia în antet:
- `X-API-Key: <cheia-ta>`

Exemplu `fetch`:

```js
const response = await fetch('https://api.vovinam.ro/athletes/', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': firebaseApiBridgeKey,
  },
});
```

Exemplu `POST`:

```js
const response = await fetch('https://api.vovinam.ro/notifications/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': firebaseApiBridgeKey,
  },
  body: JSON.stringify(payload),
});
```

## 5. Important despre securitate

Pentru aplicații web Firebase, orice cheie trimisă direct din browser poate fi extrasă de utilizator.

Asta înseamnă:
- pentru operații sensibile, soluția recomandată este prin Firebase Cloud Functions / Cloud Run
- cheia API trebuie stocată în secret manager sau env vars pe partea serverului
- dacă totuși folosești browser direct, limitează strict:
  - origin-urile permise
  - utilizatorul de serviciu
  - permisiunile acelui utilizator

## 6. Recomandare practică

Pentru început:
- `GET` direct din Firebase web app cu `X-API-Key`
- `POST` sensibil prin Firebase Cloud Functions

Astfel:
- UI-ul Firebase poate citi rapid datele
- scrierile importante nu expun cheia în browser

## 7. Checklist după deploy

- backend public disponibil prin HTTPS
- `https://api.vovinam.ro/` răspunde din DigitalOcean
- migrarea `ExternalAPIClient` aplicată
- clientul extern creat în admin
- origin-urile Firebase adăugate corect
- apel `GET` testat
- apel `POST` testat
- utilizatorul de serviciu are doar permisiunile necesare
