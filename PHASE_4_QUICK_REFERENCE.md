# PHASE 4 QUICK REFERENCE

**Service Worker & PWA Implementation**

---

## 🎯 What's New

| Feature | Location | Purpose |
|---------|----------|---------|
| Service Worker | `/public/service-worker.js` | Offline caching & routing |
| Offline Page | `/public/offline.html` | Fallback when offline |
| Manifest | `/public/manifest.json` | PWA metadata |
| Install Hook | `/hooks/useInstallPrompt.js` | App installation |
| Background Sync | `/utils/backgroundSync.js` | Queue & sync scores |
| Cache Strategies | `/utils/cacheStrategies.js` | Smart caching |
| SW Utils | `/utils/serviceWorkerUtils.js` | SW management |
| Update Banner | `/components/PWAUpdateBanner.jsx` | Update notifications |
| Install Prompt | `/components/InstallPrompt.jsx` | Install UI |

---

## ⚡ Common Tasks

### Queue a Score for Offline Sync
```javascript
import { addScoreToPendingQueue } from './utils/backgroundSync';

const scoreData = {
  athlete: 1,
  competition: 1,
  score: 85,
  deductions: 15
};

const id = await addScoreToPendingQueue(scoreData);
console.log('Queued for sync:', id);
```

### Sync Pending Scores
```javascript
import { syncAllPendingScores } from './utils/backgroundSync';

const { success, failed } = await syncAllPendingScores(jwtToken);
console.log(`Synced: ${success}, Failed: ${failed}`);
```

### Check Connection Status
```javascript
import { isOnline, onConnectionChange } from './utils/serviceWorkerUtils';

console.log('Online:', isOnline());

onConnectionChange((online) => {
  if (online) {
    console.log('Connected!');
  } else {
    console.log('Offline - queuing changes');
  }
});
```

### Listen for Score Sync Events
```javascript
window.addEventListener('scoreSync', (event) => {
  const { scoreId, success, error } = event.detail;
  if (success) {
    console.log('Score synced:', scoreId);
  } else {
    console.log('Sync failed:', error);
  }
});
```

### Get Cache Statistics
```javascript
import { getCacheStats } from './utils/serviceWorkerUtils';

const stats = await getCacheStats();
console.log(stats);
// {
//   'vovinam-api-v1': { count: 25, size: 1250000 },
//   'vovinam-static-v1': { count: 45, size: 5000000 }
// }
```

### Clear Caches (for testing)
```javascript
import { clearAllCaches } from './utils/serviceWorkerUtils';

const cleared = await clearAllCaches();
console.log(`Cleared ${cleared} caches`);
```

---

## 🔌 Add to App Component

```javascript
import PWAUpdateBanner from './components/PWAUpdateBanner';
import InstallPrompt from './components/InstallPrompt';

export default function App() {
  return (
    <>
      <PWAUpdateBanner />
      <InstallPrompt />
      
      {/* Your app content */}
    </>
  );
}
```

---

## 📡 Cache Strategies

### Cache-First (Default for static assets)
```javascript
import { cacheFirst } from './utils/cacheStrategies';

// Returns cached version if available, fetches fresh if not
const response = await cacheFirst('/static/styles.css');
```

### Network-First (Default for API)
```javascript
import { networkFirst } from './utils/cacheStrategies';

// Tries network first, falls back to cache if offline
const response = await networkFirst('/api/athletes/');
```

### Stale-While-Revalidate
```javascript
import { staleWhileRevalidate } from './utils/cacheStrategies';

// Returns cached version immediately, updates in background
const response = await staleWhileRevalidate('/api/recent-scores/');
```

---

## 📦 Service Worker Lifecycle

### When User Opens App
1. Service worker registers in `main.jsx`
2. Download & install service worker
3. App shell cache created
4. Service worker activated
5. Requests routed through service worker

### When App Updates
1. Service worker checks for updates every 60 seconds
2. New service worker downloads
3. `appUpdateAvailable` event fires
4. Update banner shows
5. User clicks "Update"
6. New service worker takes control
7. Page reloads with new version

### When User Goes Offline
1. Network request fails
2. Service worker catches fetch
3. Returns cached version if available
4. Shows offline page if no cache

### When User Comes Online
1. Connection event fires
2. Background sync triggered
3. Pending scores queued
4. Service worker syncs scores
5. `syncComplete` event fires
6. Notification shown

---

## 🔍 Debugging

### Check Service Worker Status
```javascript
import { getServiceWorkerStatus } from './utils/serviceWorkerUtils';

const status = await getServiceWorkerStatus();
console.log(status);
// { installed: true, status: 'active', scope: '/' }
```

### View Chrome DevTools
1. Open DevTools (F12)
2. Go to "Application" tab
3. Click "Service Workers" in left menu
4. See registration status, scope, update frequency

### View Cache Contents
DevTools → Application → Cache Storage → Click cache name

### Test Offline Mode
DevTools → Network → Throttling → Offline

### Check IndexedDB for Pending Scores
DevTools → Application → IndexedDB → vovinam-offline → pending_scores

---

## 📱 Installation UX

### Android
1. User opens app
2. Install prompt appears in 3 seconds
3. User taps "Install"
4. App added to home screen
5. App runs in standalone mode

### iOS
1. User opens app
2. Manual "Add to Home Screen" button shown
3. User taps button
4. Shown iOS instructions
5. App added after 5 taps

### Desktop
1. User opens app
2. Optional install prompt in address bar (browser-specific)
3. User clicks icon
4. App installs to applications

---

## 🚨 Common Issues

### Service Worker Not Loading
- Check HTTPS enabled
- Check `/public/service-worker.js` exists
- Check main.jsx imports registerServiceWorker
- Clear browser cache

### Offline Page Shows When Online
- Check network connectivity
- Clear browser cache
- Check manifest.json valid JSON
- Restart service worker (unregister, reload)

### Sync Not Working
- Check IndexedDB has pending_scores store
- Check token passed to syncAllPendingScores
- Check API endpoint accessible
- Check CORS enabled on backend

### Install Prompt Not Showing
- Must be HTTPS (or localhost)
- Must visit app multiple times
- Must meet PWA criteria (manifest, icon, etc.)
- Check beforeinstallprompt event fired

---

## 📊 Production Checklist

- [ ] Service worker installed and active
- [ ] Manifest.json valid and linked
- [ ] Offline page displays correctly
- [ ] Cache sizes monitored
- [ ] Update notifications work
- [ ] Install prompts work on mobile
- [ ] Sync queues tested
- [ ] Background sync tested
- [ ] Performance metrics captured
- [ ] Security audit passed

---

## 🎓 File Dependencies

```
main.jsx
├── serviceWorkerUtils.js
│   ├── registerServiceWorker()
│   ├── getServiceWorkerRegistration()
│   ├── updateApp()
│   └── onConnectionChange()
├── PWAUpdateBanner.jsx
│   └── updateApp()
└── InstallPrompt.jsx
    └── useInstallPrompt()
        └── beforeinstallprompt event

RefereeScoringPage.jsx / AdminDashboard.jsx
├── backgroundSync.js
│   ├── addScoreToPendingQueue()
│   ├── syncAllPendingScores()
│   └── setupAutoSync()
├── cacheStrategies.js
│   ├── networkFirst()
│   ├── cacheFirst()
│   └── getCacheStats()
└── api.js
    ├── submitScore()
    ├── getAthletes()
    └── [other API calls]

service-worker.js
├── cacheStrategies (cache-first, network-first)
├── offline.html (fallback)
└── manifest.json (app metadata)
```

---

## 💡 Pro Tips

1. **Use `setupAutoSync()`** in your auth context to auto-sync when token available
2. **Listen to `online` events** to trigger immediate sync
3. **Check `isOnline()`** before making critical API calls
4. **Cache warming** helps with app startup performance
5. **Stale-while-revalidate** balances performance and freshness
6. **Monitor cache size** regularly to prevent bloat
7. **Test offline** frequently during development
8. **Use DevTools** to debug service worker issues

---

## 📞 Support

**Phase 4 Files**: `/frontend/public/`, `/frontend/src/`
**Backend API**: Still on port 8000
**Frontend Dev**: Port 5173 (Vite)
**Database**: SQLite or PostgreSQL (no changes)

---

**Phase 4 Complete ✅**
Ready for Phase 5: Testing & Deployment
