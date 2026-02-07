# Fixing Service Worker Cache Error

**Fix for: "Uncaught (in promise) TypeError: Failed to execute 'addAll' on 'Cache': Request failed"**

---

## 🎯 What's Happening

The Service Worker is trying to cache failed API requests (404 errors). This happens when:
- `/api/auth/me/` returns 404 (but we just fixed this!)
- `/ws/` endpoint doesn't exist
- Other failed requests try to be cached

**Why it matters:**
- Service Worker cache can become corrupted
- App might not work offline properly
- Performance issues may occur

---

## ✅ How to Fix It

### Option 1: Quick Cache Clear (Recommended)

#### For Chrome/Edge/Brave:
1. Open DevTools: `F12` or `Cmd+Option+I` (Mac)
2. Go to **Application** tab
3. Left sidebar → **Service Workers**
4. Click "Unregister" next to the service worker
5. Left sidebar → **Storage** → **Cache Storage**
6. Delete all caches (click the trash icon next to each)
7. Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

#### For Firefox:
1. Open DevTools: `F12` or `Cmd+Option+I` (Mac)
2. Go to **Storage** tab
3. Expand **Cache Storage**
4. Delete each cache (right-click → Delete)
5. Go to **Service Workers**
6. Unregister the service worker
7. Hard refresh: `Ctrl+Shift+R`

#### For Safari:
1. Open DevTools: `Cmd+Option+U` (Mac)
2. Go to **Storage** tab
3. Go to **Service Workers**
4. Unregister
5. Clear website data:
   - Safari menu → Preferences
   - Privacy → Manage Website Data
   - Find `localhost:5173` and click Remove
6. Hard refresh: `Cmd+Shift+R`

### Option 2: Console Script

1. Open your browser console: `F12` → **Console** tab
2. Copy and paste this code:

```javascript
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    console.log('Found caches:', cacheNames);
    
    const deletePromises = cacheNames.map(cacheName => {
      console.log('Deleting cache:', cacheName);
      return caches.delete(cacheName);
    });
    
    const deletedCaches = await Promise.all(deletePromises);
    console.log('Deleted caches:', deletedCaches);
    
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('Found service workers:', registrations.length);
      
      for (let registration of registrations) {
        console.log('Unregistering:', registration.scope);
        await registration.unregister();
      }
    }
    
    console.log('✓ All caches cleared!');
    console.log('Refresh the page to reload');
    
  } catch (error) {
    console.error('Error clearing caches:', error);
  }
}

clearAllCaches();
```

3. Press Enter
4. Wait for the "✓ All caches cleared!" message
5. Refresh the page: `F5` or `Cmd+R`

### Option 3: Hard Reset Everything

1. **Close all tabs** with the app
2. **Close all DevTools** windows
3. **Clear browser cache:**
   - Chrome: Settings → Privacy → Clear browsing data → All time
   - Firefox: Preferences → Privacy → Clear Data → All
   - Safari: History → Clear History → All time
4. **Reopen the app** in a new tab
5. App will reinstall Service Worker fresh

---

## 🔄 After Clearing Cache

### What Happens:
✅ Service Worker re-installs cleanly  
✅ Cache initialized with only valid files  
✅ No more failed cache errors  
✅ App works normally  

### If Still Having Issues:

1. **Check backend is running:**
   ```bash
   curl http://127.0.0.1:8000/api/
   ```
   Should return 200 OK and JSON

2. **Check frontend is running:**
   ```bash
   curl http://localhost:5173
   ```
   Should return HTML page

3. **Verify /api/auth/me/ endpoint:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:8000/api/auth/me/
   ```

4. **Check browser console for errors:**
   - DevTools → Console tab
   - Look for red error messages
   - Report errors to development team

---

## 🛡️ Prevention

### Don't Let This Happen Again

1. **Fix API errors first** (don't let 404s accumulate)
2. **Monitor Service Worker** in DevTools
3. **Clear cache periodically** during development
4. **Check backend logs** for API failures:
   ```bash
   tail -f /var/log/django.log
   ```

### Development Tips

**When deploying fixes:**
1. Deploy backend fix first
2. Verify API working (test with curl or Postman)
3. Then deploy frontend
4. Users may need to clear cache

**When testing offline features:**
1. Clear cache before testing
2. Log in once to populate cache
3. Turn off network in DevTools
4. Test offline behavior

---

## 📊 What Gets Cached

### App Shell (Always Cached)
```
/index.html          ✓ Cached
/manifest.json       ✓ Cached
/favicon.ico         ✓ Cached
/offline.html        ✓ Cached
```

### Static Assets (Cached on First Load)
```
*.js files           ✓ Cached
*.css files          ✓ Cached
*.png, *.jpg, *.svg  ✓ Cached
```

### API Responses (Cached if Status = 200)
```
GET /api/athletes/    ✓ Cached if successful
GET /api/categories/  ✓ Cached if successful
POST /api/scores/     ✗ Not cached (it's a mutation)
GET /api/auth/me/     ✓ Cached if successful
```

### NOT Cached (Never)
```
POST, PUT, DELETE requests   ✗ Never cached
WebSocket connections         ✗ Never cached
404 errors                    ✗ Not cached
500 errors                    ✗ Not cached
```

---

## 🔍 Checking Service Worker Health

### In Chrome DevTools:

1. Open DevTools: `F12`
2. Go to **Application** → **Service Workers**
3. You should see:
   ```
   ✓ Service Worker registered
   Status: activated and running
   ✓ Clients: 1
   ```

4. Go to **Application** → **Cache Storage**
5. You should see:
   ```
   vovinam-app-shell-v1  (5 files)
   vovinam-api-v1        (cached API responses)
   vovinam-v1            (static assets)
   ```

### In Firefox DevTools:

1. Open DevTools: `F12`
2. Go to **Storage** → **Service Workers**
3. You should see:
   ```
   ✓ https://localhost:5173 [activated and running]
   ```

4. Go to **Storage** → **Cache Storage**
5. Should show cache entries

### If Service Worker Won't Register:

1. **Check console errors:** DevTools → Console
2. **Check manifest.json:** Must be valid JSON
3. **Check HTTPS/HTTP:** Service Workers need HTTPS or localhost
4. **Check browser support:** All modern browsers support Service Workers

---

## 📝 Checklist After Fix

- [ ] Cache cleared from DevTools
- [ ] Service Worker unregistered
- [ ] Browser hard-refreshed (Ctrl+Shift+R)
- [ ] Page loads without console errors
- [ ] Can log in successfully
- [ ] API requests work (check Network tab)
- [ ] Service Worker re-registered (check Application tab)
- [ ] Cache now contains only valid files

---

## 🆘 Still Having Issues?

### Troubleshooting Checklist

1. **Is backend running?**
   ```bash
   ps aux | grep runserver
   # Should show: python manage.py runserver
   ```

2. **Is frontend running?**
   ```bash
   ps aux | grep vite
   # Should show: npm run dev
   ```

3. **Are endpoints accessible?**
   ```bash
   # Test API
   curl http://127.0.0.1:8000/api/auth/me/ -v
   
   # Test frontend
   curl http://localhost:5173 -v
   ```

4. **Check browser console:**
   - DevTools → Console
   - Any red errors?
   - Copy errors and report them

5. **Try incognito/private mode:**
   - Chrome: Ctrl+Shift+N
   - Firefox: Ctrl+Shift+P
   - Safari: Cmd+Shift+N
   - In private mode, Service Worker is disabled
   - If app works in private mode, it's a cache issue

---

## 📞 Getting Help

**If you're still seeing errors:**

1. Open DevTools (F12)
2. Go to Console tab
3. Copy the error message
4. Share these details:
   - Full error message
   - Browser and version
   - OS (Windows/Mac/Linux)
   - Steps to reproduce

**Contact:** development team or `support@vovinam.ro`

---

## ✨ Summary

| Issue | Fix |
|-------|-----|
| **Cache error on load** | Clear caches in DevTools |
| **Service Worker won't register** | Hard refresh + clear cache |
| **App doesn't work offline** | Check cache contents in DevTools |
| **Old API responses still showing** | Clear cache storage |
| **Still have issues** | Try incognito mode, check backend logs |

---

**Remember:** Service Worker cache is great for offline performance, but if it gets corrupted, a simple clear-cache fixes it!

Refresh the page and enjoy smooth sailing! ⛵

---

**Document Version**: 1.0  
**Last Updated**: February 7, 2026  
**Status**: Ready for Phase 5
