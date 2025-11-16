# Deploy Backend to DigitalOcean - Step-by-Step Guide

This guide covers deploying **only the backend** Django REST API to DigitalOcean.

## Deployment Options

1. **DigitalOcean App Platform** (Recommended) - Easiest, managed service
2. **Docker Droplet** - More control, manual setup

---

## Option 1: App Platform (Recommended)

### Estimated Cost: $12-15/month
- App (Basic): $5/month
- PostgreSQL (Basic): $7/month
- Total: **$12/month**

### Prerequisites
- GitHub account (code must be pushed)
- DigitalOcean account ([Sign up here](https://www.digitalocean.com/))

### Step 1: Prepare Your Code

Ensure you have the latest code pushed to GitHub:

```powershell
cd d:\vovinam-admin
git add .
git commit -m "Prepare backend for DigitalOcean deployment"
git push origin main
```

### Step 2: Create App Platform App

1. **Go to DigitalOcean Dashboard**
   - Navigate to: https://cloud.digitalocean.com/apps
   - Click **"Create App"**

2. **Connect GitHub Repository**
   - Select **"GitHub"** as source
   - Authorize DigitalOcean to access your GitHub
   - Select repository: `gabimolocea/vovinam-admin`
   - Select branch: `main`
   - Click **"Next"**

3. **Configure App Resources**
   - **Source Directory**: `backend`
   - **Autodeploy**: ✅ Enabled (optional - redeploys on git push)
   - Click **"Next"**

4. **Edit Build Settings**
   - **Resource Type**: Web Service
   - **Environment**: Docker
   - **Dockerfile Path**: `backend/Dockerfile` (auto-detected)
   - **HTTP Port**: 8000
   - **Run Command**: 
     ```bash
     gunicorn crud.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
     ```

### Step 3: Add PostgreSQL Database

1. Click **"Add Resource"** → **"Database"**
2. Select **PostgreSQL 16** (or 15)
3. Choose plan:
   - **Development**: Free (only for dev/testing)
   - **Basic**: $7/month (recommended for production)
4. Database name: `frvv-db` (or your preferred name)
5. Click **"Add Database"**

> **Note**: DigitalOcean will automatically inject `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables

Click on your web service → **"Environment Variables"** → **"Edit"**

Add these variables:

```env
# Required
DEBUG=False
DJANGO_SECRET_KEY=<generate-a-strong-secret-key>
DJANGO_SETTINGS_MODULE=crud.settings_production

# Hosts (replace with your actual domain)
ALLOWED_HOSTS=.ondigitalocean.app,yourdomain.com
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173

# Database (auto-injected by DigitalOcean, but verify it exists)
DATABASE_URL=${db.DATABASE_URL}

# Optional - for production optimizations
PYTHONUNBUFFERED=1
PORT=8000
```

**To generate a secure Django secret key:**
```powershell
# In PowerShell, run Python:
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### Step 5: Configure Build & Deploy

1. **Build Command**: (Leave empty - uses Dockerfile)
2. **Run Command**: 
   ```bash
   gunicorn crud.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
   ```

### Step 6: Review & Deploy

1. Review all settings
2. Click **"Create Resources"**
3. Wait 5-10 minutes for:
   - Docker image build
   - Database provisioning
   - Initial deployment

### Step 7: Post-Deployment Setup

#### Run Migrations (First Time Only)

The `Procfile` should handle this automatically, but if needed:

1. Go to your app in DigitalOcean
2. Click **"Console"** tab
3. Run:
   ```bash
   python manage.py migrate
   ```

#### Create Superuser

1. In the **Console** tab, run:
   ```bash
   python manage.py createsuperuser
   ```
2. Follow prompts to create admin account

#### Test Your API

1. Find your app URL (e.g., `https://your-app-name.ondigitalocean.app`)
2. Test endpoints:
   - `https://your-app-name.ondigitalocean.app/api/` (API root)
   - `https://your-app-name.ondigitalocean.app/admin/` (Django admin)

### Step 8: Update Frontend Configuration

Update your frontend to point to the new backend:

```javascript
// frontend/src/utils/env.js or .env file
VITE_API_BASE_URL=https://your-app-name.ondigitalocean.app/api
```

---

## Option 2: Docker Droplet (Manual Setup)

### Estimated Cost: $6-12/month
- Droplet (Basic 1GB RAM): $6/month
- Optional managed PostgreSQL: +$7/month

### Prerequisites
- DigitalOcean account
- SSH client (Windows 10+ has built-in SSH)

### Step 1: Create Droplet

1. **Go to DigitalOcean** → **Droplets** → **Create Droplet**
2. **Choose Image**:
   - Distribution: **Ubuntu 22.04 LTS**
3. **Choose Plan**:
   - Basic: **$6/month** (1 GB RAM, 1 vCPU, 25 GB SSD)
   - Or **$12/month** (2 GB RAM) for better performance
4. **Choose Datacenter**:
   - Select region closest to your users (e.g., Frankfurt for Europe)
5. **Authentication**:
   - **SSH Key** (recommended - create one if needed)
   - Or use password (less secure)
6. **Hostname**: `frvv-backend`
7. Click **"Create Droplet"**

### Step 2: Initial Server Setup

SSH into your droplet:

```powershell
# From Windows PowerShell
ssh root@your-droplet-ip
```

Update system and install Docker:

```bash
# Update packages
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose -y

# Install git
apt install git -y

# Create app directory
mkdir -p /opt/apps
cd /opt/apps
```

### Step 3: Clone Your Repository

```bash
# Clone your repo (use HTTPS or SSH)
git clone https://github.com/gabimolocea/vovinam-admin.git
cd vovinam-admin/backend
```

### Step 4: Create Production Configuration

Create `.env.production` file:

```bash
nano .env.production
```

Add:

```env
DEBUG=False
DJANGO_SECRET_KEY=your-generated-secret-key-here
DJANGO_SETTINGS_MODULE=crud.settings_production
ALLOWED_HOSTS=your-droplet-ip,yourdomain.com
CORS_ALLOWED_ORIGINS=https://your-frontend.com,http://localhost:5173
DATABASE_URL=postgresql://frvv_user:secure_password@db:5432/frvv_db
PORT=8000
```

### Step 5: Create Docker Compose File

Create `docker-compose.prod.yml`:

```bash
nano docker-compose.prod.yml
```

Add:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: frvv_db
      POSTGRES_USER: frvv_user
      POSTGRES_PASSWORD: secure_password_here
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U frvv_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build: .
    command: gunicorn crud.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120
    volumes:
      - static_volume:/app/staticfiles
      - media_volume:/app/media
    ports:
      - "8000:8000"
    env_file:
      - .env.production
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
  static_volume:
  media_volume:
```

### Step 6: Build and Run

```bash
# Build and start containers
docker-compose -f docker-compose.prod.yml up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Run migrations
docker-compose -f docker-compose.prod.yml exec web python manage.py migrate

# Create superuser
docker-compose -f docker-compose.prod.yml exec web python manage.py createsuperuser

# Collect static files (if not done in Dockerfile)
docker-compose -f docker-compose.prod.yml exec web python manage.py collectstatic --noinput
```

### Step 7: Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
# Install Nginx
apt install nginx -y

# Create Nginx config
nano /etc/nginx/sites-available/frvv-backend
```

Add:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or droplet IP

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /opt/apps/vovinam-admin/backend/staticfiles/;
    }

    location /media/ {
        alias /opt/apps/vovinam-admin/backend/media/;
    }
}
```

Enable and restart:

```bash
# Enable site
ln -s /etc/nginx/sites-available/frvv-backend /etc/nginx/sites-enabled/

# Test config
nginx -t

# Restart Nginx
systemctl restart nginx

# Enable on boot
systemctl enable nginx
```

### Step 8: Setup SSL with Let's Encrypt (Recommended)

```bash
# Install certbot
apt install certbot python3-certbot-nginx -y

# Get certificate (replace with your domain)
certbot --nginx -d yourdomain.com

# Auto-renewal is set up automatically
```

### Step 9: Maintenance Commands

```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f web

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Update code
cd /opt/apps/vovinam-admin
git pull
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations after update
docker-compose -f docker-compose.prod.yml exec web python manage.py migrate

# Backup database
docker-compose -f docker-compose.prod.yml exec db pg_dump -U frvv_user frvv_db > backup_$(date +%Y%m%d).sql
```

---

## Common Issues & Solutions

### Issue: Static files not loading

**Solution**:
```bash
# Collect static files
docker-compose -f docker-compose.prod.yml exec web python manage.py collectstatic --noinput
```

### Issue: CORS errors from frontend

**Solution**: Update `CORS_ALLOWED_ORIGINS` in environment variables to include your frontend URL:
```env
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173
```

### Issue: Database connection failed

**Solution**: 
1. Check DATABASE_URL format: `postgresql://user:password@host:port/dbname`
2. For App Platform, ensure database is attached to the app
3. For Droplet, ensure db container is healthy: `docker-compose ps`

### Issue: migrations failing

**Solution**:
```bash
# For App Platform (Console)
python manage.py migrate --fake-initial

# For Droplet
docker-compose -f docker-compose.prod.yml exec web python manage.py migrate --fake-initial
```

---

## Security Checklist

- ✅ Set `DEBUG=False`
- ✅ Use strong `DJANGO_SECRET_KEY`
- ✅ Configure `ALLOWED_HOSTS` properly
- ✅ Use PostgreSQL (not SQLite) in production
- ✅ Enable HTTPS/SSL
- ✅ Restrict `CORS_ALLOWED_ORIGINS` to your frontend domain only
- ✅ Use environment variables for secrets (never commit them)
- ✅ Regular backups of database
- ✅ Keep dependencies updated

---

## Next Steps

1. **Connect Frontend**: Update frontend API URL to point to deployed backend
2. **Custom Domain**: Add custom domain in DigitalOcean (App Platform) or DNS settings (Droplet)
3. **Monitoring**: Set up DigitalOcean monitoring and alerts
4. **Backups**: Enable automatic database backups (App Platform has this built-in)
5. **CI/CD**: Set up GitHub Actions for automated deployments (optional)

---

## Cost Summary

### App Platform (Recommended)
| Service | Cost |
|---------|------|
| Web App (Basic) | $5/month |
| PostgreSQL (Basic) | $7/month |
| **Total** | **$12/month** |

### Droplet + Managed DB
| Service | Cost |
|---------|------|
| Droplet (1GB) | $6/month |
| PostgreSQL (Basic) | $7/month |
| **Total** | **$13/month** |

### Droplet Only (DB on same server)
| Service | Cost |
|---------|------|
| Droplet (2GB) | $12/month |
| **Total** | **$12/month** |

---

## Support

- DigitalOcean Docs: https://docs.digitalocean.com/
- Django Deployment: https://docs.djangoproject.com/en/5.2/howto/deployment/
- Community: DigitalOcean Community tutorials
