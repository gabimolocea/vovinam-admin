/**
 * Service Worker for Vovinam Admin PWA
 * Handles offline caching, app shell architecture, and background sync
 */

const CACHE_NAME = 'vovinam-v2';
const APP_SHELL_CACHE = 'vovinam-app-shell-v2';
const API_CACHE = 'vovinam-api-v2';
const OFFLINE_FALLBACK = '/offline.html';

// Files to cache on install (App Shell)
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/offline.html'
];

/**
 * Install Event - Cache app shell on first load
 */
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(cache => {
      console.log('Caching app shell');
      // Cache only available files, don't fail on missing ones
      return Promise.all(
        APP_SHELL_URLS.map(url => {
          return fetch(url)
            .then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              // Continue despite failures
            });
        })
      );
    }).then(() => {
      console.log('App shell cached, claiming clients');
      return self.skipWaiting();
    })
  );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== APP_SHELL_CACHE && 
              cacheName !== API_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Fetch Event - Implement caching strategies
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // API requests - Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - Cache first, fallback to network
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Navigation requests - App shell strategy
  if (request.mode === 'navigate') {
    event.respondWith(appShellStrategy(request));
    return;
  }

  // Default - Network first
  event.respondWith(networkFirstStrategy(request));
});

/**
 * Network First Strategy - Try network, fallback to cache
 * Good for: API calls, dynamic content
 */
async function networkFirstStrategy(request) {
  try {
    // Try network request
    const response = await fetch(request);
    
    // Cache successful responses (except 404, 500, etc.)
    if (response.status === 200) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Serving from cache (network failed):', request.url);
      return cachedResponse;
    }
    
    // No cache, return offline page for navigation
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_FALLBACK);
    }
    
    throw error;
  }
}

/**
 * Cache First Strategy - Try cache, fallback to network
 * Good for: Static assets, images, CSS, JS
 */
async function cacheFirstStrategy(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Not in cache, try network
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('Cache first strategy failed:', error);
    throw error;
  }
}

/**
 * App Shell Strategy - Cache app shell, network for content
 */
async function appShellStrategy(request) {
  try {
    // Try network for fresh content
    const response = await fetch(request);
    
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Network failed, try app shell cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fall back to offline page
    return caches.match(OFFLINE_FALLBACK);
  }
}

/**
 * Check if URL is a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', 
    '.woff', '.woff2', '.ttf', '.eot', '.ico'
  ];
  
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

/**
 * Background Sync - Sync pending scores when online
 */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(syncPendingScores());
  }
});

/**
 * Sync pending scores from IndexedDB
 */
async function syncPendingScores() {
  try {
    console.log('Syncing pending scores...');
    
    // Open IndexedDB
    const db = await openDB('vovinam-offline');
    const tx = db.transaction('pending_scores', 'readonly');
    const store = tx.objectStore('pending_scores');
    const pendingScores = await store.getAll();
    
    if (pendingScores.length === 0) {
      console.log('No pending scores to sync');
      return;
    }
    
    // Sync each pending score
    for (const score of pendingScores) {
      try {
        const response = await fetch('/api/category-athlete-scores/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getStoredToken()}`
          },
          body: JSON.stringify(score)
        });
        
        if (response.ok) {
          // Remove from pending after successful sync
          const deleteTx = db.transaction('pending_scores', 'readwrite');
          await deleteTx.objectStore('pending_scores').delete(score.id);
        }
      } catch (error) {
        console.error('Failed to sync score:', error);
        // Will retry on next sync event
      }
    }
    
    console.log('Sync complete');
    
    // Notify clients about sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        synced: pendingScores.length
      });
    });
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}

/**
 * Helper: Open IndexedDB
 */
function openDB(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_scores')) {
        db.createObjectStore('pending_scores', { keyPath: 'id' });
      }
    };
  });
}

/**
 * Helper: Get stored JWT token
 */
async function getStoredToken() {
  // Token should be in localStorage or sessionStorage
  return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
}

/**
 * Message Handler - Communicate with clients
 */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'SYNC_NOW') {
    syncPendingScores().catch(err => console.error('Manual sync failed:', err));
  }
});

console.log('Service Worker loaded');
