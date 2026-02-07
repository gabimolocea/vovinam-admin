// Cache clearing utility for the frontend
// Run this in the browser console to clear Service Worker cache

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
    
    // Clear Service Worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('Found service workers:', registrations.length);
      
      for (let registration of registrations) {
        console.log('Unregistering:', registration.scope);
        await registration.unregister();
      }
    }
    
    // Clear local storage (optional)
    // localStorage.clear();
    
    console.log('✓ All caches cleared!');
    console.log('✓ Service Worker unregistered!');
    console.log('Refresh the page to reload the app with fresh Service Worker');
    
  } catch (error) {
    console.error('Error clearing caches:', error);
  }
}

// Run it
clearAllCaches();
