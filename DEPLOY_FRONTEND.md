# Frontend Deployment Guide - DigitalOcean App Platform

Complete guide to deploy the React (Vite + MUI) frontend to DigitalOcean App Platform.

## Prerequisites

- ✅ Backend already deployed: `https://vovinam-admin-o9nwf.ondigitalocean.app`
- GitHub repository: `gabimolocea/vovinam-admin`
- DigitalOcean account with billing enabled

## Deployment Options

### Option 1: DigitalOcean App Platform (Recommended)

**Cost:** ~$5-12/month for static site or Node.js app

**Pros:**
- Automatic HTTPS/SSL
- Auto-deploy from GitHub
- Free SSL certificates
- CDN included
- Zero server management

---

## Step-by-Step Deployment

### 1. Update Production Environment Configuration

The frontend is already configured with environment files. Update `.env.production`:

```bash
cd frontend
```

**File: `frontend/.env.production`**
```dotenv
# Production API URL - Update with your deployed backend URL
VITE_API_BASE_URL=https://vovinam-admin-o9nwf.ondigitalocean.app/api
VITE_BACKEND_URL=https://vovinam-admin-o9nwf.ondigitalocean.app
```

Commit this change:
```bash
git add frontend/.env.production
git commit -m "Configure frontend for production backend URL"
git push origin main
```

---

### 2. Create App Platform App for Frontend

**A. Navigate to App Platform:**
1. Log into DigitalOcean Dashboard
2. Click **"Create"** → **"Apps"**
3. Select **"GitHub"** as source
4. Authorize/Select repository: `gabimolocea/vovinam-admin`
5. Click **"Next"**

**B. Configure Source:**
- **Branch:** `main`
- **Source Directory:** `/frontend`
- **Autodeploy:** ✅ Enabled (deploy on push)

**C. Configure App Settings:**
- **App Name:** `vovinam-admin-frontend` (or your choice)
- **Resource Type:** Choose one:
  - **Static Site** ($0-5/month) - if serving pre-built files
  - **Web Service** ($5/month) - if using Node.js preview server

**D. Build Configuration:**

For **Static Site**:
```yaml
Build Command: npm ci && npm run build
Output Directory: dist
```

For **Web Service** (Node.js):
```yaml
Build Command: npm ci && npm run build
Run Command: npm run preview -- --host 0.0.0.0 --port 8080
```

**E. Environment Variables:**
Click **"Edit"** next to Environment Variables:

| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://vovinam-admin-o9nwf.ondigitalocean.app/api` |
| `VITE_BACKEND_URL` | `https://vovinam-admin-o9nwf.ondigitalocean.app` |
| `NODE_ENV` | `production` |

**F. Select Region:**
- Choose same region as backend: **New York** (or closest to users)

**G. Review and Deploy:**
- Review settings
- Click **"Create Resources"**
- Wait 5-10 minutes for initial deployment

---

### 3. Update Backend CORS Settings

Once frontend is deployed, you'll get a URL like:
`https://vovinam-admin-frontend-xxxxx.ondigitalocean.app`

**Update backend to allow frontend origin:**

Go to DigitalOcean → Your backend app → **Settings** → **Environment Variables**

Update `CORS_ALLOWED_ORIGINS` to include frontend URL:

```
CORS_ALLOWED_ORIGINS=https://vovinam-admin-frontend-xxxxx.ondigitalocean.app,http://localhost:5173
```

**Or via Console/SSH:**

Edit `backend/crud/settings_production.py` (already configured to read from env):
```python
# Already in settings_production.py - just update env var
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')
```

The backend reads from environment variable, so just update in DigitalOcean dashboard.

---

### 4. Optional: Custom Domain

**A. Add Custom Domain in App Platform:**
1. Go to frontend app → **Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter your domain: `www.vovinam-admin.ro` or `app.vovinam-admin.ro`
4. Follow DNS configuration instructions

**B. Update DNS Records:**

Add CNAME record in your domain registrar:
```
Type: CNAME
Name: www (or app)
Value: vovinam-admin-frontend-xxxxx.ondigitalocean.app
TTL: 3600
```

**C. Update Environment Variables:**

Update both backend and frontend to use custom domain:

Backend `CORS_ALLOWED_ORIGINS`:
```
https://www.vovinam-admin.ro,http://localhost:5173
```

Frontend `VITE_API_BASE_URL`:
```
https://api.vovinam-admin.ro/api
```

---

## Alternative: Vercel Deployment (Faster, Free Tier)

If you want a simpler/free option:

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy from Frontend Directory
```bash
cd frontend
vercel --prod
```

### 3. Configure Environment Variables in Vercel Dashboard
```
VITE_API_BASE_URL=https://vovinam-admin-o9nwf.ondigitalocean.app/api
VITE_BACKEND_URL=https://vovinam-admin-o9nwf.ondigitalocean.app
```

### 4. Update Backend CORS
Add Vercel URL to `CORS_ALLOWED_ORIGINS`:
```
https://vovinam-admin-frontend.vercel.app,http://localhost:5173
```

---

## Alternative: Netlify Deployment (Also Free)

### 1. Install Netlify CLI
```bash
npm install -g netlify-cli
```

### 2. Deploy
```bash
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

### 3. Configure in Netlify Dashboard
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: Same as above

---

## Verification Checklist

After deployment, verify:

- [ ] Frontend loads at deployment URL
- [ ] Login works (connects to backend API)
- [ ] No CORS errors in browser console (F12)
- [ ] Images/media files load from backend
- [ ] Navigation works between pages
- [ ] API requests succeed (check Network tab)
- [ ] SSL certificate is active (https://)

---

## Troubleshooting

### CORS Errors
**Error:** `Access to fetch at 'https://...' from origin 'https://...' has been blocked by CORS policy`

**Solution:**
1. Check backend `CORS_ALLOWED_ORIGINS` includes frontend URL
2. Verify backend allows credentials: `CORS_ALLOW_CREDENTIALS = True` (already set)
3. Restart backend app after changing env vars

### 404 on Page Refresh
**Error:** Page refreshes show 404 on routes like `/athletes/123`

**Solution (App Platform):**
Add redirect rule in app settings:
```
/* /index.html 200
```

**Solution (Netlify/Vercel):**
Create `frontend/public/_redirects`:
```
/*    /index.html   200
```

### API Base URL Not Working
**Error:** Frontend still pointing to localhost

**Solution:**
1. Verify `.env.production` is committed
2. Rebuild the app (trigger redeploy)
3. Check build logs show correct `VITE_API_BASE_URL`

### Build Fails
**Error:** `npm ERR!` during build

**Solution:**
1. Check `package.json` scripts are correct
2. Verify Node version (App Platform uses Node 18 by default)
3. Clear cache and rebuild
4. Check for missing dependencies in `package.json`

---

## Current Configuration Summary

### Backend (Already Deployed)
- **URL:** `https://vovinam-admin-o9nwf.ondigitalocean.app`
- **API Endpoint:** `https://vovinam-admin-o9nwf.ondigitalocean.app/api/`
- **Admin:** `https://vovinam-admin-o9nwf.ondigitalocean.app/admin/`

### Frontend (Ready to Deploy)
- **Source:** `/frontend` directory
- **Build Tool:** Vite 6.0.7
- **Framework:** React 19.0.0
- **UI Library:** Material-UI 7.3.4
- **Environment Files:**
  - `.env.development` - Local development (localhost:8000)
  - `.env.production` - Production (needs backend URL)

### Required Backend Updates
After frontend deployment, update in DigitalOcean:
- `CORS_ALLOWED_ORIGINS` - Add frontend URL
- `ALLOWED_HOSTS` - Add frontend domain (if custom domain)

---

## Cost Estimate

### DigitalOcean App Platform
- **Static Site:** $0-5/month
- **Basic Node.js:** $5/month
- **Professional:** $12/month (auto-scaling)
- **Database (already paid):** $7/month

**Total:** $12-19/month for backend + frontend

### Free Alternatives
- **Vercel:** Free for personal projects (100GB bandwidth/month)
- **Netlify:** Free tier (100GB bandwidth/month)
- **Both:** Recommended for frontend, keep DigitalOcean for backend

---

## Next Steps

1. **Update `.env.production`** with backend URL
2. **Choose deployment platform** (App Platform, Vercel, or Netlify)
3. **Deploy frontend** following steps above
4. **Update backend CORS** with frontend URL
5. **Test end-to-end** login, API calls, navigation
6. **Optional:** Add custom domain

---

## Support

- DigitalOcean Docs: https://docs.digitalocean.com/products/app-platform/
- Vercel Docs: https://vercel.com/docs
- Netlify Docs: https://docs.netlify.com/
- Vite Deployment: https://vite.dev/guide/static-deploy.html

---

**Ready to deploy? Start with updating `.env.production` and choose your platform!**
