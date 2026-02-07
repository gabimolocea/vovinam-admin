/**
 * Cache Strategies Manager
 * Handles different caching strategies and cache operations
 */

export const CACHE_NAMES = {
  APP_SHELL: 'vovinam-app-shell-v1',
  API: 'vovinam-api-v1',
  STATIC: 'vovinam-static-v1',
  IMAGES: 'vovinam-images-v1'
};

/**
 * Cache-first strategy
 * Good for: Static assets that don't change often
 */
export async function cacheFirst(url, cacheName = CACHE_NAMES.STATIC) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url);

    if (cached) {
      return cached;
    }

    const response = await fetch(url);

    if (response.status === 200) {
      cache.put(url, response.clone());
    }

    return response;
  } catch (error) {
    console.error('Cache-first strategy failed:', error);
    throw error;
  }
}

/**
 * Network-first strategy
 * Good for: API calls and dynamic content
 */
export async function networkFirst(url, cacheName = CACHE_NAMES.API) {
  try {
    const response = await fetch(url);

    if (response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(url, response.clone());
    }

    return response;
  } catch (error) {
    // Network failed, try cache
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url);

    if (cached) {
      console.log('Serving from cache (network failed):', url);
      return cached;
    }

    throw error;
  }
}

/**
 * Stale-while-revalidate strategy
 * Return cached version immediately, update in background
 */
export async function staleWhileRevalidate(url, cacheName = CACHE_NAMES.API) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(url);

  const fetchPromise = fetch(url).then(response => {
    if (response.status === 200) {
      cache.put(url, response.clone());
    }
    return response;
  });

  return cached || fetchPromise;
}

/**
 * Cache image with fallback
 */
export async function cacheImage(url, fallbackUrl = null) {
  try {
    return await cacheFirst(url, CACHE_NAMES.IMAGES);
  } catch (error) {
    if (fallbackUrl) {
      console.warn(`Failed to cache ${url}, using fallback`);
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
          <rect fill="#f0f0f0" width="100" height="100"/>
          <text x="50" y="50" text-anchor="middle" dy=".3em" fill="#999">No Image</text>
        </svg>`,
        {
          headers: { 'Content-Type': 'image/svg+xml' }
        }
      );
    }
    throw error;
  }
}

/**
 * Get all cached URLs
 */
export async function getAllCachedUrls(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    return keys.map(req => req.url);
  } catch (error) {
    console.error('Failed to get cached URLs:', error);
    return [];
  }
}

/**
 * Check if URL is cached
 */
export async function isCached(url, cacheName = CACHE_NAMES.API) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url);
    return !!cached;
  } catch (error) {
    return false;
  }
}

/**
 * Remove specific URL from cache
 */
export async function removeFromCache(url, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    return await cache.delete(url);
  } catch (error) {
    console.error('Failed to remove from cache:', error);
    return false;
  }
}

/**
 * Clear entire cache
 */
export async function clearCache(cacheName) {
  try {
    return await caches.delete(cacheName);
  } catch (error) {
    console.error('Failed to clear cache:', error);
    return false;
  }
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    const cleared = await Promise.all(
      cacheNames.map(name => caches.delete(name))
    );
    console.log(`Cleared ${cleared.length} caches`);
    return cleared.length;
  } catch (error) {
    console.error('Failed to clear all caches:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const cacheNames = await caches.keys();
    const stats = {};

    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      const urls = keys.map(req => req.url);

      stats[name] = {
        count: keys.length,
        urls: urls,
        size: calculateCacheSize(urls)
      };
    }

    return stats;
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return {};
  }
}

/**
 * Calculate cache size (approximate)
 */
function calculateCacheSize(urls) {
  // Rough estimate: URLs + average response size
  const urlSize = urls.reduce((sum, url) => sum + url.length, 0);
  const estimatedResponseSize = urls.length * 50000; // ~50KB per response
  return urlSize + estimatedResponseSize;
}

/**
 * Warm up cache with critical assets
 */
export async function warmUpCache(urls, cacheName = CACHE_NAMES.APP_SHELL) {
  try {
    const cache = await caches.open(cacheName);

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (response.status === 200) {
          await cache.put(url, response);
        }
      } catch (error) {
        console.warn(`Failed to warm cache for ${url}:`, error);
      }
    }

    console.log(`Warmed cache with ${urls.length} URLs`);
  } catch (error) {
    console.error('Cache warm-up failed:', error);
  }
}

/**
 * Cache API response
 */
export async function cacheAPIResponse(url, response, cacheName = CACHE_NAMES.API) {
  try {
    if (response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(url, response.clone());
    }
    return response;
  } catch (error) {
    console.error('Failed to cache API response:', error);
    return response;
  }
}

/**
 * Get cached API response with freshness check
 */
export async function getCachedAPIResponse(url, maxAge = 3600000) { // 1 hour
  try {
    const cache = await caches.open(CACHE_NAMES.API);
    const cached = await cache.match(url);

    if (!cached) {
      return null;
    }

    // Check if cache is still fresh
    const cacheDate = new Date(cached.headers.get('date') || cached.headers.get('x-cached-date'));
    const now = new Date();
    const age = now - cacheDate;

    if (age > maxAge) {
      console.log('Cache expired:', url);
      return null;
    }

    return cached;
  } catch (error) {
    console.error('Failed to get cached API response:', error);
    return null;
  }
}

export default {
  CACHE_NAMES,
  cacheFirst,
  networkFirst,
  staleWhileRevalidate,
  cacheImage,
  getAllCachedUrls,
  isCached,
  removeFromCache,
  clearCache,
  clearAllCaches,
  getCacheStats,
  warmUpCache,
  cacheAPIResponse,
  getCachedAPIResponse
};
