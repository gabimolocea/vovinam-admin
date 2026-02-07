import React, { createContext, useEffect, useState, useCallback } from 'react';
import { openDB } from 'idb';

export const OfflineContext = createContext();

const DB_NAME = 'vovinam-scoring-db';
const DB_VERSION = 1;

const STORES = {
  PENDING_SCORES: 'pending-category-scores',
  PENDING_MATCH_SCORES: 'pending-match-scores',
  PENDING_WINNERS: 'pending-winner-selections',
  CACHED_DATA: 'cached-data',
};

export const OfflineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [db, setDb] = useState(null);
  const [pendingSync, setPendingSync] = useState(0);

  // Initialize IndexedDB
  useEffect(() => {
    const initDB = async () => {
      const database = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Store pending category scores
          if (!db.objectStoreNames.contains(STORES.PENDING_SCORES)) {
            db.createObjectStore(STORES.PENDING_SCORES, { keyPath: 'id', autoIncrement: true });
          }

          // Store pending match scores
          if (!db.objectStoreNames.contains(STORES.PENDING_MATCH_SCORES)) {
            db.createObjectStore(STORES.PENDING_MATCH_SCORES, { keyPath: 'id', autoIncrement: true });
          }

          // Store pending winner selections
          if (!db.objectStoreNames.contains(STORES.PENDING_WINNERS)) {
            db.createObjectStore(STORES.PENDING_WINNERS, { keyPath: 'id', autoIncrement: true });
          }

          // Cache data for offline access
          if (!db.objectStoreNames.contains(STORES.CACHED_DATA)) {
            db.createObjectStore(STORES.CACHED_DATA, { keyPath: 'key' });
          }
        },
      });
      setDb(database);
    };

    initDB();
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save pending category score
  const savePendingCategoryScore = useCallback(async (athleteScoreId, deductions) => {
    if (!db) return;

    const score = {
      athleteScoreId,
      deductions,
      timestamp: new Date().toISOString(),
      synced: false,
    };

    await db.add(STORES.PENDING_SCORES, score);
    setPendingSync((prev) => prev + 1);
  }, [db]);

  // Save pending match score
  const savePendingMatchScore = useCallback(async (matchId, roundNumber, redScore, blueScore) => {
    if (!db) return;

    const score = {
      matchId,
      roundNumber,
      redScore,
      blueScore,
      timestamp: new Date().toISOString(),
      synced: false,
    };

    await db.add(STORES.PENDING_MATCH_SCORES, score);
    setPendingSync((prev) => prev + 1);
  }, [db]);

  // Save pending winner selection
  const savePendingWinner = useCallback(async (matchId, winner) => {
    if (!db) return;

    const selection = {
      matchId,
      winner,
      timestamp: new Date().toISOString(),
      synced: false,
    };

    await db.add(STORES.PENDING_WINNERS, selection);
    setPendingSync((prev) => prev + 1);
  }, [db]);

  // Get all pending scores
  const getPendingScores = useCallback(async () => {
    if (!db) return [];
    return await db.getAll(STORES.PENDING_SCORES);
  }, [db]);

  // Get all pending match scores
  const getPendingMatchScores = useCallback(async () => {
    if (!db) return [];
    return await db.getAll(STORES.PENDING_MATCH_SCORES);
  }, [db]);

  // Get all pending winners
  const getPendingWinners = useCallback(async () => {
    if (!db) return [];
    return await db.getAll(STORES.PENDING_WINNERS);
  }, [db]);

  // Mark score as synced
  const markScoreSynced = useCallback(async (id) => {
    if (!db) return;
    const score = await db.get(STORES.PENDING_SCORES, id);
    if (score) {
      score.synced = true;
      await db.put(STORES.PENDING_SCORES, score);
    }
    setPendingSync((prev) => Math.max(0, prev - 1));
  }, [db]);

  // Cache data for offline access
  const cacheData = useCallback(async (key, data) => {
    if (!db) return;
    await db.put(STORES.CACHED_DATA, { key, data, timestamp: new Date().toISOString() });
  }, [db]);

  // Get cached data
  const getCachedData = useCallback(async (key) => {
    if (!db) return null;
    const entry = await db.get(STORES.CACHED_DATA, key);
    return entry?.data || null;
  }, [db]);

  const value = {
    isOnline,
    pendingSync,
    savePendingCategoryScore,
    savePendingMatchScore,
    savePendingWinner,
    getPendingScores,
    getPendingMatchScores,
    getPendingWinners,
    markScoreSynced,
    cacheData,
    getCachedData,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = React.useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider');
  }
  return context;
};
