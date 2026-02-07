/**
 * Service Worker Registration and Management
 * Handles service worker lifecycle, updates, and offline notifications
 */

/**
 * Register service worker on app initialization
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      '/service-worker.js',
      {
        scope: '/',
        updateViaCache: 'none' // Always fetch fresh SW
      }
    );

    console.log('Service Worker registered:', registration);

    // Check for updates periodically
    setInterval(() => {
      registration.update();
    }, 60000); // Check every minute

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // New version available
          notifyUpdateAvailable(registration);
        }
      });
    });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Handle messages from service worker
 */
function handleServiceWorkerMessage(event) {
  const { type, synced } = event.data;

  if (type === 'SYNC_COMPLETE') {
    console.log(`Synced ${synced} pending scores`);
    // Dispatch custom event that components can listen to
    window.dispatchEvent(
      new CustomEvent('scoresSynced', { detail: { count: synced } })
    );
  }
}

/**
 * Notify user that app update is available
 */
function notifyUpdateAvailable(registration) {
  // Create a notification banner
  const event = new CustomEvent('appUpdateAvailable', {
    detail: { registration }
  });
  window.dispatchEvent(event);

  console.log('App update available');
}

/**
 * Update the app to the latest version
 */
export async function updateApp(registration) {
  const newWorker = registration.waiting;

  if (newWorker) {
    newWorker.postMessage({ type: 'SKIP_WAITING' });

    // Reload page when new SW takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

/**
 * Unregister service worker (for development/troubleshooting)
 */
export async function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  for (let registration of registrations) {
    await registration.unregister();
  }

  console.log('Service Worker unregistered');
}

/**
 * Get current service worker registration
 */
export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null;

  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.length > 0 ? registrations[0] : null;
}

/**
 * Trigger background sync (sync pending scores)
 */
export async function triggerBackgroundSync() {
  const registration = await getServiceWorkerRegistration();

  if (!registration) {
    console.error('No service worker registered');
    return false;
  }

  try {
    await registration.sync.register('sync-scores');
    console.log('Background sync registered');
    return true;
  } catch (error) {
    console.error('Background sync registration failed:', error);
    return false;
  }
}

/**
 * Request immediate sync from service worker
 */
export async function requestImmediateSync() {
  if (!navigator.serviceWorker.controller) {
    console.warn('No active service worker');
    return false;
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'SYNC_NOW'
  });

  return true;
}

/**
 * Clear all caches (useful for development)
 */
export async function clearAllCaches() {
  const cacheNames = await caches.keys();
  const cleared = await Promise.all(
    cacheNames.map(name => caches.delete(name))
  );

  console.log(`Cleared ${cleared.length} caches`);
  return cleared.length;
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = {};

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    stats[name] = {
      count: keys.length,
      urls: keys.map(req => req.url)
    };
  }

  return stats;
}

/**
 * Check online/offline status
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Listen for online/offline changes
 */
export function onConnectionChange(callback) {
  window.addEventListener('online', () => {
    console.log('Connection restored');
    callback(true);
  });

  window.addEventListener('offline', () => {
    console.log('Connection lost');
    callback(false);
  });
}

/**
 * Get service worker status
 */
export async function getServiceWorkerStatus() {
  const registration = await getServiceWorkerRegistration();

  if (!registration) {
    return {
      installed: false,
      status: 'none'
    };
  }

  let status = 'installing';
  if (registration.active) {
    status = 'active';
  } else if (registration.installing) {
    status = 'installing';
  } else if (registration.waiting) {
    status = 'waiting-activation';
  }

  return {
    installed: true,
    status,
    scope: registration.scope,
    updateViaCache: registration.updateViaCache
  };
}

// Export for use in React components
export default {
  registerServiceWorker,
  updateApp,
  unregisterServiceWorker,
  getServiceWorkerRegistration,
  triggerBackgroundSync,
  requestImmediateSync,
  clearAllCaches,
  getCacheStats,
  isOnline,
  onConnectionChange,
  getServiceWorkerStatus
};
