# Pre-Deployment Checklist for DigitalOcean

Use this checklist before deploying your backend to DigitalOcean.

## ✅ Code Preparation

- [ ] All code committed and pushed to GitHub
- [ ] `backend/requirements.txt` includes all production dependencies
- [ ] `backend/Dockerfile` exists and is configured
- [ ] `backend/Procfile` exists for App Platform migrations
- [ ] `backend/crud/settings_production.py` exists

## ✅ Environment Variables to Set

Generate a Django secret key first:
```powershell
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Required environment variables for DigitalOcean App Platform:

```env
DEBUG=False
DJANGO_SECRET_KEY=<paste-generated-key-here>
DJANGO_SETTINGS_MODULE=crud.settings_production
ALLOWED_HOSTS=.ondigitalocean.app,<your-custom-domain>
CORS_ALLOWED_ORIGINS=https://<your-frontend-url>,http://localhost:5173
DATABASE_URL=${db.DATABASE_URL}
```

## ✅ DigitalOcean Setup Steps

### For App Platform:

1. [ ] GitHub repository accessible (public or authorized)
2. [ ] Create App Platform app
3. [ ] Set source directory to `backend`
4. [ ] Add PostgreSQL database resource
5. [ ] Configure environment variables (see above)
6. [ ] Set HTTP port to `8000`
7. [ ] Deploy and wait for build
8. [ ] Run migrations (automatic via Procfile)
9. [ ] Create superuser via Console tab
10. [ ] Test API endpoint: `https://your-app.ondigitalocean.app/api/`

### For Docker Droplet:

1. [ ] Create Ubuntu 22.04 droplet
2. [ ] SSH into droplet
3. [ ] Install Docker and Docker Compose
4. [ ] Clone repository
5. [ ] Create `.env.production` with variables
6. [ ] Create `docker-compose.prod.yml` (see DEPLOY_BACKEND.md)
7. [ ] Run `docker-compose up -d --build`
8. [ ] Run migrations
9. [ ] Create superuser
10. [ ] Setup Nginx reverse proxy
11. [ ] Setup SSL with Let's Encrypt

## ✅ Post-Deployment Verification

- [ ] API root accessible: `https://your-app/api/`
- [ ] Admin panel accessible: `https://your-app/admin/`
- [ ] Can login to admin with superuser
- [ ] Database migrations applied successfully
- [ ] Static files loading correctly
- [ ] CORS working from frontend
- [ ] No DEBUG=True errors in logs

## ✅ Frontend Integration

- [ ] Update frontend API base URL to deployed backend
- [ ] Test authentication flow
- [ ] Test API endpoints from frontend
- [ ] Verify CORS headers allow frontend requests

## 🔐 Security Verification

- [ ] `DEBUG=False` in production
- [ ] Strong `DJANGO_SECRET_KEY` set
- [ ] `ALLOWED_HOSTS` properly configured (not `*`)
- [ ] `CORS_ALLOWED_ORIGINS` restricted to frontend domain
- [ ] Database password is strong
- [ ] HTTPS/SSL enabled
- [ ] Environment variables not committed to git

## 📊 Monitoring & Maintenance

- [ ] Enable DigitalOcean monitoring/alerts
- [ ] Setup database backups
- [ ] Document deployment process
- [ ] Test rollback procedure
- [ ] Plan for scaling if needed

## 🆘 Troubleshooting Commands

### App Platform Console:
```bash
# Check migrations
python manage.py showmigrations

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Check logs in DO Console or via CLI
doctl apps logs <app-id>
```

### Docker Droplet:
```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f web

# Restart
docker-compose -f docker-compose.prod.yml restart

# Run migrations
docker-compose -f docker-compose.prod.yml exec web python manage.py migrate

# Create superuser
docker-compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
```

## 📝 Estimated Timeline

- **App Platform**: 15-30 minutes (mostly automated)
- **Docker Droplet**: 1-2 hours (manual setup)

## 💰 Expected Costs

- **App Platform + Managed DB**: $12/month
- **Droplet + Managed DB**: $13/month  
- **Droplet with DB**: $12/month (2GB droplet)

---

## Quick Start (App Platform - Recommended)

```powershell
# 1. Commit and push
git add .
git commit -m "Deploy to DigitalOcean"
git push origin main

# 2. Generate secret key
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# 3. Go to DigitalOcean
# https://cloud.digitalocean.com/apps
# Click "Create App" → Select GitHub → Choose repo
# Source directory: backend
# Add PostgreSQL database
# Add environment variables (see above)
# Deploy!

# 4. After deployment, in Console tab:
python manage.py createsuperuser

# 5. Test
# https://your-app-name.ondigitalocean.app/api/
```

Refer to `DEPLOY_BACKEND.md` for detailed step-by-step instructions.
