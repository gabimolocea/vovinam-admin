export function getSyncStatusMeta(eventLike) {
  const syncStatus = eventLike?.local_sync_status || 'idle';
  const syncMode = eventLike?.sync_mode || 'cloud';
  const syncLocked = Boolean(eventLike?.sync_locked);

  const statusMap = {
    idle: {
      label: 'Neexportat',
      shortLabel: 'Idle',
      className: 'bg-gray-100 text-gray-700 border border-gray-300',
      description: 'Evenimentul este doar în cloud și nu a fost exportat pentru operare locală.',
    },
    exported: {
      label: 'Exportat local',
      shortLabel: 'Exported',
      className: 'bg-orange-100 text-orange-800 border border-orange-300',
      description: 'Event pack a fost exportat, iar evenimentul este blocat pentru operare locală.',
    },
    local_in_progress: {
      label: 'În desfășurare local',
      shortLabel: 'Local live',
      className: 'bg-amber-100 text-amber-900 border border-amber-300',
      description: 'Competiția rulează local pe LAN, iar cloud-ul rămâne blocat pentru editări operaționale.',
    },
    results_uploaded: {
      label: 'Rezultate importate',
      shortLabel: 'Uploaded',
      className: 'bg-blue-100 text-blue-800 border border-blue-300',
      description: 'Rezultatele locale au fost încărcate în cloud și așteaptă validare/finalizare.',
    },
    completed: {
      label: 'Sync finalizat',
      shortLabel: 'Completed',
      className: 'bg-green-100 text-green-800 border border-green-300',
      description: 'Sincronizarea a fost finalizată, iar evenimentul a revenit în modul cloud.',
    },
  };

  const fallback = {
    label: syncLocked || syncMode === 'local_event' ? 'Blocat local' : 'Cloud',
    shortLabel: syncLocked || syncMode === 'local_event' ? 'Local' : 'Cloud',
    className: syncLocked || syncMode === 'local_event'
      ? 'bg-orange-100 text-orange-800 border border-orange-300'
      : 'bg-gray-100 text-gray-700 border border-gray-300',
    description: syncLocked || syncMode === 'local_event'
      ? 'Evenimentul este blocat pentru operare locală.'
      : 'Evenimentul este administrat în cloud.',
  };

  return statusMap[syncStatus] || fallback;
}

export function getSyncModeMeta(eventLike) {
  if ((eventLike?.sync_mode || 'cloud') === 'local_event') {
    return {
      label: 'Eveniment local',
      className: 'bg-orange-100 text-orange-800 border border-orange-300',
    };
  }

  return {
    label: 'Cloud',
    className: 'bg-gray-100 text-gray-700 border border-gray-300',
  };
}

export function getSyncLockMeta(eventLike) {
  if (eventLike?.sync_locked) {
    return {
      label: 'Blocat',
      className: 'bg-red-100 text-red-800 border border-red-300',
    };
  }

  return {
    label: 'Deblocat',
    className: 'bg-green-100 text-green-800 border border-green-300',
  };
}