# PHASE 4 DEPLOYMENT & INTEGRATION GUIDE

**Service Worker & PWA Implementation**

---

## ✅ Pre-Deployment Checklist

### Frontend Configuration
- [ ] Service worker file at `/frontend/public/service-worker.js`
- [ ] Offline page at `/frontend/public/offline.html`
- [ ] Manifest.json at `/frontend/public/manifest.json`
- [ ] PWA utilities in `/frontend/src/utils/`
- [ ] PWA components in `/frontend/src/components/`
- [ ] main.jsx updated with service worker registration
- [ ] index.html updated with PWA meta tags
- [ ] All imports are correct and files exist

### Backend Configuration
- [ ] HTTPS enabled in production
- [ ] CORS headers include frontend domain
- [ ] API endpoints working correctly
- [ ] JWT token validation working
- [ ] Database migrations applied

### Testing
- [ ] Service worker registers successfully
- [ ] Offline page shows when network fails
- [ ] Scores queue in IndexedDB when offline
- [ ] Sync works when coming online
- [ ] Cache statistics are reasonable
- [ ] Install prompt shows on mobile
- [ ] Update prompt shows when available

---

## 🚀 Deployment Steps

### Step 1: Build Frontend
```bash
cd frontend
npm run build
```

Expected output:
```
✓ built 245 modules in 2.33s
dist/
  ├── index.html
  ├── service-worker.js
  ├── manifest.json
  ├── offline.html
  └── assets/
      ├── main-*.js
      ├── main-*.css
      └── vendor-*.js
```

### Step 2: Verify Build Output
```bash
# Check service worker is in dist
ls -la dist/service-worker.js

# Check manifest is valid JSON
cat dist/manifest.json | jq .

# Check offline page exists
cat dist/offline.html | head -20

# Check index.html has manifest link
grep manifest dist/index.html
```

### Step 3: Deploy to Server
```bash
# Option 1: DigitalOcean App Platform (Recommended)
# Push to GitHub, configured auto-deploy

# Option 2: Manual FTP/SCP
scp -r dist/* user@server:/var/www/vovinam/

# Option 3: Docker
docker build -t vovinam-frontend:latest .
docker push youregistry/vovinam-frontend:latest
docker run -p 80:80 vovinam-frontend:latest
```

### Step 4: Configure Web Server
```nginx
# Nginx configuration
server {
    listen 80;
    server_name vovinam-admin.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vovinam-admin.com;

    # SSL certificates
    ssl_certificate /etc/ssl/certs/vovinam-admin.com.crt;
    ssl_certificate_key /etc/ssl/private/vovinam-admin.com.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    root /var/www/vovinam/dist;
    index index.html;

    # Service Worker should not be cached aggressively
    location = /service-worker.js {
        add_header Cache-Control "public, max-age=0, must-revalidate";
        add_header Content-Type "application/javascript";
    }

    # Manifest should not be cached
    location = /manifest.json {
        add_header Cache-Control "public, max-age=0, must-revalidate";
        add_header Content-Type "application/json";
    }

    # Assets can be cached long-term
    location ~* ^/assets/.*\.(js|css|jpg|png|gif|svg|woff|woff2)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        expires 365d;
    }

    # Offline page
    location = /offline.html {
        add_header Cache-Control "public, max-age=3600";
    }

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    # API proxy
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### Step 5: Verify Deployment

#### Check Service Worker
```bash
# Fetch service worker
curl -I https://vovinam-admin.com/service-worker.js

# Should return:
# HTTP/2 200
# Content-Type: application/javascript
# Cache-Control: public, max-age=0, must-revalidate
```

#### Check Manifest
```bash
curl https://vovinam-admin.com/manifest.json | jq .

# Should return valid manifest JSON
```

#### Check Offline Page
```bash
curl https://vovinam-admin.com/offline.html | head -20

# Should show HTML content
```

#### Check PWA Meta Tags
```bash
curl https://vovinam-admin.com/ | grep -E 'manifest|theme-color|apple'

# Should see:
# <link rel="manifest" href="/manifest.json" />
# <meta name="theme-color" content="#667eea" />
# <meta name="apple-mobile-web-app-capable" content="yes" />
```

### Step 6: Test in Browser

#### Desktop Chrome
1. Open https://vovinam-admin.com
2. Open DevTools (F12)
3. Go to Application → Service Workers
4. Verify "Service Worker registered"
5. Go to Application → Manifest
6. Verify manifest loaded correctly
7. Install app via address bar icon

#### Mobile Chrome (Android)
1. Open https://vovinam-admin.com
2. Wait 3 seconds
3. Install prompt should appear
4. Tap Install
5. App added to home screen
6. Tap app icon to launch

#### Mobile Safari (iOS)
1. Open https://vovinam-admin.com in Safari
2. Tap Share button
3. Tap "Add to Home Screen"
4. Name app "Vovinam Admin"
5. Tap Add
6. App added to home screen

### Step 7: Test Offline Mode

#### In DevTools
1. Open app
2. DevTools → Application → Service Workers
3. Check "Offline" checkbox
4. Refresh page
5. App should continue working
6. Offline page should show for unavailable routes

#### Real Offline Testing
1. Close wifi/mobile data
2. Open app
3. Features should work offline
4. Scoring should queue pending scores
5. Reconnect
6. Sync should happen automatically

---

## 🔧 Configuration Files Needed

### HTTPS Certificate
Required for service workers. Options:
- Let's Encrypt (free): `certbot certonly -d vovinam-admin.com`
- Self-signed (dev only): `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem`

### Environment Variables
```bash
# .env.production
VITE_API_BASE_URL=https://api.vovinam-admin.com
VITE_APP_NAME=Vovinam Admin
VITE_APP_VERSION=1.0.0
VITE_ENABLE_PWA=true
```

---

## 📊 Monitoring

### Service Worker Health
```javascript
// Add to app boot
window.addEventListener('load', async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  
  if (registration) {
    console.log('Service Worker Status:', {
      installed: true,
      scope: registration.scope,
      updateViaCache: registration.updateViaCache
    });
    
    // Send to analytics
    fetch('/api/analytics/pwa-status', {
      method: 'POST',
      body: JSON.stringify({
        installed: true,
        scope: registration.scope,
        timestamp: new Date().toISOString()
      })
    });
  }
});
```

### Cache Size Monitoring
```javascript
// Monitor cache growth
setInterval(async () => {
  const stats = await getCacheStats();
  
  // Send to monitoring
  Object.entries(stats).forEach(([name, { size }]) => {
    fetch('/api/analytics/cache-size', {
      method: 'POST',
      body: JSON.stringify({ cache: name, size, timestamp: new Date() })
    });
  });
}, 60000); // Every minute
```

### Sync Monitoring
```javascript
// Track sync events
window.addEventListener('syncComplete', (event) => {
  fetch('/api/analytics/sync-complete', {
    method: 'POST',
    body: JSON.stringify({
      synced: event.detail.synced,
      failed: event.detail.failed,
      timestamp: new Date().toISOString()
    })
  });
});
```

---

## 🚨 Troubleshooting Production

### Service Worker Not Registering
```bash
# Check logs
tail -f /var/log/nginx/error.log

# Check HTTPS working
curl -I https://vovinam-admin.com/

# Verify service-worker.js accessible
curl -I https://vovinam-admin.com/service-worker.js
```

### Cache Growing Too Large
```javascript
// Add cache limits
async function limitCacheSize(cacheName, maxItems = 100) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // Delete oldest items
    for (let i = 0; i < keys.length - maxItems; i++) {
      await cache.delete(keys[i]);
    }
  }
}
```

### Offline Page Shows When Online
```bash
# Check network connectivity in logs
# Check API endpoints accessible
curl https://api.vovinam-admin.com/api/athletes/

# Clear browser cache
# Chrome: DevTools → Application → Cache → Right-click → Delete
```

### Sync Not Completing
```bash
# Check backend API logs
tail -f /var/log/vovinam/backend.log

# Check JWT token expiration
# Implement token refresh logic

# Check CORS headers
curl -H "Origin: https://vovinam-admin.com" -I https://api.vovinam-admin.com/api/athletes/
```

---

## 📈 Performance Optimization

### Compress Assets
```bash
# In dist directory
gzip -9 service-worker.js
gzip -9 offline.html

# Nginx will serve .gz automatically
```

### Cache Warming
```javascript
// Warm up critical assets on first load
import { warmUpCache } from './utils/cacheStrategies';

window.addEventListener('load', () => {
  warmUpCache([
    '/index.html',
    '/manifest.json',
    '/offline.html',
    '/assets/main.js',
    '/assets/main.css'
  ]);
});
```

### Bundle Analysis
```bash
npm run build -- --report

# Check bundle size
du -sh dist/
```

---

## 🔐 Security Checklist

- [ ] HTTPS enabled (no HTTP)
- [ ] Service worker only on HTTPS
- [ ] Manifest.json has HTTPS URLs
- [ ] JWT tokens in Authorization header (not cookies)
- [ ] CSP headers configured
- [ ] CORS properly configured
- [ ] No sensitive data in localStorage
- [ ] API validation on backend
- [ ] Rate limiting enabled
- [ ] DDoS protection configured

---

## 📋 Post-Deployment

### 1. Announce to Users
```
📱 Vovinam Admin is now a Progressive Web App!

✨ New Features:
- Install on your home screen
- Works completely offline
- Automatic sync when back online
- Faster loading times
- Takes up less space

🚀 Get Started:
- Android: Open app → Install prompt
- iOS: Tap Share → Add to Home Screen
```

### 2. Monitor First Week
- Check error logs daily
- Monitor cache sizes
- Track sync success rates
- Collect user feedback

### 3. Gather Metrics
- Unique app installations
- Offline usage rate
- Sync success rate
- Performance metrics
- Error rates

---

## 🎓 Further Reading

- [Web.dev PWA Deployment](https://web.dev/progressive-web-apps/)
- [Service Worker Best Practices](https://web.dev/service-workers-cache-storage/)
- [PWA Security](https://web.dev/security-pwa/)
- [Nginx PWA Config](https://github.com/web-infra-dev/modern-web-dev-plugins)

---

## ✅ Final Verification

```bash
#!/bin/bash
# verify-pwa-deployment.sh

echo "🔍 Verifying PWA Deployment..."

BASE_URL="https://vovinam-admin.com"

# Check Service Worker
echo -n "Service Worker: "
curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/service-worker.js"
echo ""

# Check Manifest
echo -n "Manifest: "
curl -s "$BASE_URL/manifest.json" | jq . > /dev/null && echo "✅ Valid JSON" || echo "❌ Invalid JSON"

# Check Offline Page
echo -n "Offline Page: "
curl -s "$BASE_URL/offline.html" | grep -q "You're Offline" && echo "✅ Found" || echo "❌ Not found"

# Check Index HTML
echo -n "PWA Meta Tags: "
curl -s "$BASE_URL/" | grep -q "manifest.json" && echo "✅ Found" || echo "❌ Not found"

# Check HTTPS
echo -n "HTTPS: "
curl -s -o /dev/null -w "%{http_code}\n" "https://$BASE_URL/" | grep -q 200 && echo "✅ Working" || echo "❌ Failed"

echo ""
echo "✅ Verification complete!"
```

---

**Deployment Status**: ✅ Ready  
**Next Phase**: Phase 5 - End-to-End Testing

