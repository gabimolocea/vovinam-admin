# DigitalOcean Backend Deployment - Quick Start

## 🚀 5-Minute Deploy (App Platform)

### Step 1: Prepare (2 minutes)

```powershell
# Run preparation script
.\scripts\deploy-prep.ps1

# OR manually:
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
git add .
git commit -m "Deploy to DigitalOcean"
git push origin main
```

### Step 2: Create App (3 minutes)

**Go to:** https://cloud.digitalocean.com/apps

1. Click **"Create App"**
2. **Source**: GitHub → `gabimolocea/vovinam-admin` → `main` branch
3. **Configure**:
   ```
   Source Directory: backend
   Environment: Docker (auto-detected)
   HTTP Port: 8000
   ```

4. **Add Database**:
   - Click "Add Resource" → Database → PostgreSQL 15
   - Plan: Basic ($7/month)
   - Name: `frvv-db`

5. **Environment Variables** (copy from script output or below):
   ```env
   DEBUG=False
   DJANGO_SECRET_KEY=<paste-your-generated-key>
   DJANGO_SETTINGS_MODULE=crud.settings_production
   ALLOWED_HOSTS=.ondigitalocean.app
   CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app
   DATABASE_URL=${db.DATABASE_URL}
   ```

6. Click **"Create Resources"** → Wait 5-10 min

### Step 3: Post-Deploy (1 minute)

**In App Console:**
```bash
python manage.py createsuperuser
```

**Test:**
- API: `https://your-app-name.ondigitalocean.app/api/`
- Admin: `https://your-app-name.ondigitalocean.app/admin/`

---

## ✅ Success Indicators

- ✅ App shows "Deployed" status
- ✅ `/api/` returns DRF browsable API
- ✅ `/admin/` shows Django admin login
- ✅ Can login with superuser credentials
- ✅ No 500 errors in app logs

---

## 🔧 Common Issues

### Build Failed?
- Check Dockerfile exists in `backend/`
- Verify all dependencies in `requirements.txt`
- Check build logs for Python errors

### Database Connection Error?
- Ensure PostgreSQL database is attached
- Verify `DATABASE_URL` environment variable exists
- Check database is "Available" status

### Static Files 404?
- Static files served by WhiteNoise (automatic)
- Check `settings_production.py` has WhiteNoise middleware

### CORS Errors?
- Update `CORS_ALLOWED_ORIGINS` with actual frontend URL
- Must include protocol: `https://` not just domain
- Redeploy after changing environment variables

---

## 💰 Cost: $12/month

- App (Basic 512MB): $5/month
- PostgreSQL (Basic): $7/month

---

## 📚 Full Documentation

- **Detailed Guide**: `DEPLOY_BACKEND.md`
- **Checklist**: `DEPLOYMENT_CHECKLIST.md`
- **Production Settings**: `backend/crud/settings_production.py`

---

## 🎯 Next Steps After Deploy

1. **Update Frontend**: Change API URL to deployed backend
   ```javascript
   // frontend/.env.production or src/utils/env.js
   VITE_API_BASE_URL=https://your-app.ondigitalocean.app/api
   ```

2. **Custom Domain** (Optional):
   - DigitalOcean → Apps → Settings → Domains
   - Add your domain
   - Update DNS records as instructed
   - Update `ALLOWED_HOSTS` and redeploy

3. **Enable Monitoring**:
   - DigitalOcean → Apps → Insights
   - Set up alerts for downtime/errors

4. **Backups**:
   - Database backups enabled by default (daily)
   - Download via: Databases → Backups

5. **Auto-Deploy** (Optional):
   - Already enabled if you checked "Autodeploy"
   - Every `git push` triggers new deployment
   - Zero-downtime rolling updates

---

## 📞 Support Resources

- DigitalOcean Docs: https://docs.digitalocean.com/products/app-platform/
- Django Deployment: https://docs.djangoproject.com/en/5.2/howto/deployment/
- Community: https://www.digitalocean.com/community/tags/django

---

## 🔄 Updates & Maintenance

**To deploy updates:**
```powershell
git add .
git commit -m "Update description"
git push origin main
# App Platform auto-deploys (if enabled)
```

**Manual redeploy:**
- DigitalOcean → Apps → Your App → Actions → Force Rebuild and Deploy

**View logs:**
- DigitalOcean → Apps → Your App → Runtime Logs

**Run commands:**
- DigitalOcean → Apps → Your App → Console tab

**Database backup:**
- DigitalOcean → Databases → Your DB → Backups → Download
