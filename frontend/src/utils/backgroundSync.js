/**
 * Background Sync Manager
 * Handles offline score submissions and automatic sync when online
 */

import axios from 'axios';

/**
 * Initialize background sync
 */
export async function initializeBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    console.warn('Background Sync not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register('sync-scores');
    console.log('Background sync initialized');
    return true;
  } catch (error) {
    console.error('Background sync initialization failed:', error);
    return false;
  }
}

/**
 * Add score to pending sync queue
 */
export async function addScoreToPendingQueue(scoreData) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_scores', 'readwrite');
    const store = tx.objectStore('pending_scores');

    const pendingScore = {
      id: Date.now() + Math.random(),
      ...scoreData,
      createdAt: new Date().toISOString(),
      synced: false,
      attempts: 0
    };

    await store.add(pendingScore);

    console.log('Score added to pending queue:', pendingScore.id);

    // Notify listeners
    window.dispatchEvent(
      new CustomEvent('scorePendingAdded', { detail: { score: pendingScore } })
    );

    return pendingScore.id;
  } catch (error) {
    console.error('Failed to add score to pending queue:', error);
    throw error;
  }
}

/**
 * Get pending scores
 */
export async function getPendingScores() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_scores', 'readonly');
    const store = tx.objectStore('pending_scores');
    const scores = await store.getAll();

    return scores.filter(score => !score.synced);
  } catch (error) {
    console.error('Failed to get pending scores:', error);
    return [];
  }
}

/**
 * Get pending score count
 */
export async function getPendingScoreCount() {
  const scores = await getPendingScores();
  return scores.length;
}

/**
 * Sync single score
 */
export async function syncSingleScore(scoreId, token) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_scores', 'readonly');
    const store = tx.objectStore('pending_scores');
    const score = await store.get(scoreId);

    if (!score) {
      console.warn('Score not found in queue:', scoreId);
      return false;
    }

    // Prepare API call
    const endpoint = score.type === 'solo' 
      ? '/api/category-athlete-scores/'
      : '/api/team-result-scores/';

    const response = await axios.post(endpoint, score, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 201 || response.status === 200) {
      // Mark as synced
      const updateTx = db.transaction('pending_scores', 'readwrite');
      await updateTx.objectStore('pending_scores').put({
        ...score,
        synced: true,
        syncedAt: new Date().toISOString()
      });

      console.log('Score synced successfully:', scoreId);

      window.dispatchEvent(
        new CustomEvent('scoreSync', { detail: { scoreId, success: true } })
      );

      return true;
    }
  } catch (error) {
    console.error('Failed to sync score:', scoreId, error);

    // Update attempt count
    try {
      const db = await openOfflineDB();
      const tx = db.transaction('pending_scores', 'readonly');
      const store = tx.objectStore('pending_scores');
      const score = await store.get(scoreId);

      const updateTx = db.transaction('pending_scores', 'readwrite');
      await updateTx.objectStore('pending_scores').put({
        ...score,
        attempts: (score.attempts || 0) + 1,
        lastError: error.message
      });
    } catch (updateError) {
      console.error('Failed to update attempt count:', updateError);
    }

    window.dispatchEvent(
      new CustomEvent('scoreSync', { detail: { scoreId, success: false, error } })
    );

    return false;
  }
}

/**
 * Sync all pending scores
 */
export async function syncAllPendingScores(token) {
  const scores = await getPendingScores();

  if (scores.length === 0) {
    console.log('No pending scores to sync');
    return { success: 0, failed: 0 };
  }

  console.log(`Syncing ${scores.length} pending scores`);

  let successCount = 0;
  let failureCount = 0;

  for (const score of scores) {
    const success = await syncSingleScore(score.id, token);
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }

    // Add delay between syncs to avoid overwhelming server
    await sleep(100);
  }

  console.log(`Sync complete: ${successCount} succeeded, ${failureCount} failed`);

  window.dispatchEvent(
    new CustomEvent('syncComplete', {
      detail: { success: successCount, failed: failureCount }
    })
  );

  return { success: successCount, failed: failureCount };
}

/**
 * Clear synced scores from queue
 */
export async function clearSyncedScores() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_scores', 'readwrite');
    const store = tx.objectStore('pending_scores');

    // Get all synced scores
    const allScores = await store.getAll();
    const syncedScores = allScores.filter(s => s.synced);

    for (const score of syncedScores) {
      await store.delete(score.id);
    }

    console.log(`Cleared ${syncedScores.length} synced scores`);

    return syncedScores.length;
  } catch (error) {
    console.error('Failed to clear synced scores:', error);
    return 0;
  }
}

/**
 * Remove score from pending queue
 */
export async function removeFromPendingQueue(scoreId) {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('pending_scores', 'readwrite');
    await tx.objectStore('pending_scores').delete(scoreId);

    console.log('Score removed from pending queue:', scoreId);

    return true;
  } catch (error) {
    console.error('Failed to remove score from pending queue:', error);
    return false;
  }
}

/**
 * Open offline database
 */
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vovinam-offline', 1);

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
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Listen for online status changes and sync automatically
 */
export function setupAutoSync(token) {
  const syncOnOnline = async () => {
    console.log('Connection restored, syncing pending scores');
    await syncAllPendingScores(token);
  };

  window.addEventListener('online', syncOnOnline);

  // Also setup periodic sync attempts
  setInterval(() => {
    if (navigator.onLine) {
      console.log('Periodic sync check');
      syncAllPendingScores(token).catch(err => 
        console.error('Periodic sync failed:', err)
      );
    }
  }, 300000); // Every 5 minutes

  return () => {
    window.removeEventListener('online', syncOnOnline);
  };
}

export default {
  initializeBackgroundSync,
  addScoreToPendingQueue,
  getPendingScores,
  getPendingScoreCount,
  syncSingleScore,
  syncAllPendingScores,
  clearSyncedScores,
  removeFromPendingQueue,
  setupAutoSync
};
