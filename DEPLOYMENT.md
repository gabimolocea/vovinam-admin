# DigitalOcean Deployment Guide

## Quick Deploy with App Platform (Recommended)

### Prerequisites
- GitHub account with your code pushed
- DigitalOcean account

### Step-by-Step Deployment

#### 1. **Push Code to GitHub**
```powershell
cd D:\frvv-admin\frvv-admin
git add .
git commit -m "Add DigitalOcean deployment configuration"
git push origin main
```

#### 2. **Create App on DigitalOcean**

1. Go to [DigitalOcean Apps](https://cloud.digitalocean.com/apps)
2. Click **"Create App"**
3. Select **GitHub** and authorize DigitalOcean
4. Choose repository: `gabimolocea/frvv-admin`
5. Choose branch: `main` (or your deployment branch)
6. Click **"Next"**

#### 3. **Configure App Settings**

**Source Directory:**
- Set to: `backend`

**Build Command:** (auto-detected from Dockerfile)
```bash
# Uses Dockerfile automatically
```

**Run Command:**
```bash
gunicorn crud.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
```

**Environment Variables:**
```
DEBUG=False
DJANGO_SECRET_KEY=<generate-strong-key>
ALLOWED_HOSTS=.ondigitalocean.app
CORS_ALLOWED_ORIGINS=https://your-frontend.com
```

#### 4. **Add PostgreSQL Database**

1. Click **"Add Resource"** → **"Database"**
2. Select **PostgreSQL 15**
3. Choose plan: **Basic** ($7/month)
4. Database name: `frvv-admin-db`
5. The `DATABASE_URL` will be auto-injected

#### 5. **Deploy!**

1. Review settings
2. Click **"Create Resources"**
3. Wait 5-10 minutes for deployment

#### 6. **Post-Deployment Setup**

Create superuser via console:

1. Go to your app → **Console** tab
2. Run:
```bash
python manage.py createsuperuser
```

### Estimated Costs

| Resource | Plan | Cost/Month |
|----------|------|------------|
| Web App | Basic (512MB RAM, 1 vCPU) | $5 |
| PostgreSQL | Basic (1GB RAM, 10GB disk) | $7 |
| **Total** | | **$12/month** |

---

## Alternative: Docker Droplet Deployment

### Prerequisites
- DigitalOcean account

### Step 1: Create Droplet

1. Go to DigitalOcean → **Droplets** → **Create**
2. Choose:
   - **Ubuntu 22.04 LTS**
   - **Basic Plan** - $6/month (1GB RAM)
   - **Datacenter**: Frankfurt
3. Add SSH key
4. Create Droplet

### Step 2: Setup Server

SSH into your droplet:
```bash
ssh root@your-droplet-ip
```

Install Docker:
```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose -y

# Install nginx
apt install nginx -y
```

### Step 3: Deploy Application

Clone your repo:
```bash
cd /opt
git clone https://github.com/gabimolocea/frvv-admin.git
cd frvv-admin/backend
```

Create `.env` file:
```bash
nano .env
```

Add:
```env
DEBUG=False
DJANGO_SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=your-domain.com
DATABASE_URL=postgres://user:pass@db:5432/dbname
```

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: frvv_admin
      POSTGRES_USER: frvv_user
      POSTGRES_PASSWORD: change_this_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  web:
    build: .
    command: gunicorn crud.wsgi:application --bind 0.0.0.0:8000
    volumes:
      - ./media:/app/media
      - ./staticfiles:/app/staticfiles
    ports:
      - "8000:8000"
    depends_on:
      - db
    env_file:
      - .env

volumes:
  postgres_data:
```

Deploy:
```bash
docker-compose up -d
docker-compose exec web python manage.py migrate
docker-compose exec web python manage.py createsuperuser
```

### Step 4: Setup Nginx

```bash
nano /etc/nginx/sites-available/frvv-admin
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /static/ {
        alias /opt/frvv-admin/backend/staticfiles/;
    }

    location /media/ {
        alias /opt/frvv-admin/backend/media/;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
ln -s /etc/nginx/sites-available/frvv-admin /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 5: Setup SSL

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d your-domain.com
```

---

## Comparison

| Feature | App Platform | Droplet |
|---------|-------------|---------|
| **Setup Time** | 10 minutes | 1-2 hours |
| **Cost** | $12/month | $6/month |
| **Scaling** | Automatic | Manual |
| **SSL** | Included | Manual (free) |
| **Monitoring** | Included | Manual |
| **Backups** | Paid add-on | Manual |
| **Server Management** | None | Full access |

---

## Recommended: App Platform ✅

**Why?**
- ✅ Zero server management
- ✅ Automatic SSL
- ✅ GitHub auto-deploy
- ✅ Built-in monitoring
- ✅ Easy rollback
- ✅ Managed database with backups

**Only $12/month for hassle-free hosting!**

---

## Environment Variables Reference

```bash
# Required
DEBUG=False
DJANGO_SECRET_KEY=your-secret-key-min-50-chars
ALLOWED_HOSTS=.ondigitalocean.app,yourdomain.com
DATABASE_URL=postgres://user:pass@host:5432/db

# Optional
CORS_ALLOWED_ORIGINS=https://frontend.com,https://www.frontend.com
```

## Generate Secret Key

```python
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

---

## Post-Deployment Checklist

- [ ] Create superuser
- [ ] Test admin login
- [ ] Test API endpoints
- [ ] Upload test media files
- [ ] Configure CORS for frontend
- [ ] Setup custom domain (optional)
- [ ] Enable database backups
- [ ] Monitor application logs

---

## Troubleshooting

### App won't start
```bash
# Check logs in DigitalOcean dashboard
# Or via CLI:
doctl apps logs <app-id>
```

### Database connection error
- Check `DATABASE_URL` is set correctly
- Ensure database is in same region

### Static files not loading
```bash
# Run collectstatic
python manage.py collectstatic --noinput
```

### 502 Bad Gateway
- Check if app is running
- Verify port binding (use `$PORT` env variable)
- Check application logs

---

## Support

- [DigitalOcean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [Django Deployment Checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
