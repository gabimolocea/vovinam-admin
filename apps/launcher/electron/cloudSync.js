// Orchestrates the cloud <-> local sync flow by composing the SAME
// endpoints SyncCenterPage already drives by hand (see
// backend/api/views/sync.py's OfflineSyncViewSet and
// backend/api/views/competitions.py's mark-local-in-progress/
// complete-local-sync actions) - no new backend behavior, just automation
// with the admin's own login instead of the fixed service-account flow
// pull_from_cloud.py uses.

async function apiCall(baseUrl, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = data?.detail || data?.error || data?.non_field_errors?.[0] || `${res.status} ${res.statusText}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  return data;
}

async function login(baseUrl, email, password) {
  const data = await apiCall(baseUrl, '/api/auth/login/', {
    method: 'POST',
    body: { email, password },
  });
  return {
    user: data.user,
    access: data.tokens?.access,
    refresh: data.tokens?.refresh,
  };
}

async function listCompetitionEvents(baseUrl, token) {
  const data = await apiCall(baseUrl, '/api/competitions/', { token });
  const list = Array.isArray(data) ? data : data?.results || [];
  // Only competition-type events make sense to run a local venue for.
  return list.filter((ev) => !ev.event_type || ev.event_type === 'competition');
}

// Shown right after login so the operator can see what's actually in the
// cloud database before picking an event - both endpoints are unpaginated
// on this backend (AthleteViewSet/ClubViewSet return a plain array), so
// the array length doubles as the total count.
async function getOverview(baseUrl, token) {
  const [athletes, clubs] = await Promise.all([
    apiCall(baseUrl, '/api/athletes/', { token }),
    apiCall(baseUrl, '/api/clubs/', { token }),
  ]);
  const athleteList = Array.isArray(athletes) ? athletes : athletes?.results || [];
  const clubList = Array.isArray(clubs) ? clubs : clubs?.results || [];
  return {
    athleteCount: Array.isArray(athletes) ? athletes.length : athletes?.count ?? athleteList.length,
    clubCount: Array.isArray(clubs) ? clubs.length : clubs?.count ?? clubList.length,
    athletes: athleteList,
    clubs: clubList,
  };
}

// Cloud -> local: pull the event pack from cloud (this also locks the
// event on cloud, per event_pack()'s mark_exported_to_local() call), then
// import it into the local instance, then mark local operation started.
async function syncEventLocal({ cloudBaseUrl, cloudToken, localBaseUrl, localToken, eventId, onProgress }) {
  const report = onProgress || (() => {});

  report('Se descarcă datele evenimentului din cloud…');
  const pack = await apiCall(cloudBaseUrl, `/api/offline/event-pack/?event_id=${eventId}`, { token: cloudToken });

  report('Se importă datele pe acest calculator…');
  await apiCall(localBaseUrl, '/api/offline/event-pack/import/', { method: 'POST', token: localToken, body: pack });

  report('Se marchează evenimentul ca fiind în desfășurare locală…');
  await apiCall(localBaseUrl, `/api/competitions/${eventId}/mark-local-in-progress/`, { method: 'POST', token: localToken });

  report('Sincronizare locală completă.');
  return pack;
}

// Local -> cloud: export results from local and import them into cloud
// (which marks results_uploaded on the cloud's copy of the event).
// Deliberately does NOT finalize the sync (see completeSyncOnCloud below) -
// import_event_results requires the cloud event to still be sync_locked,
// so this needs to stay safely repeatable throughout the competition day
// (push again after more matches finish) without permanently unlocking
// the event and blocking every subsequent push with "Event must be
// locked for local operation before results can be imported."
async function syncEventToCloud({ cloudBaseUrl, cloudToken, localBaseUrl, localToken, eventId, onProgress }) {
  const report = onProgress || (() => {});

  report('Se exportă rezultatele de pe acest calculator…');
  const results = await apiCall(localBaseUrl, `/api/offline/event-results/?event_id=${eventId}`, { token: localToken });

  report('Se trimit rezultatele în cloud…');
  const importReport = await apiCall(cloudBaseUrl, '/api/offline/event-results/import/', { method: 'POST', token: cloudToken, body: results });

  // Reading cloud's own results pack back and diffing it against what we
  // just sent is the only thing that actually answers "did it land?".
  // Every layer here reports success on its own terms - the HTTP call
  // succeeded, the importer counted rows - while the *content* can still
  // be wrong (a push made while local had no places recorded writes a
  // perfectly successful pack full of nulls).
  report('Se verifică ce a ajuns efectiv în cloud…');
  const verification = await verifyEventSync({
    cloudBaseUrl, cloudToken, localBaseUrl, localToken, eventId, localResults: results,
  });

  report(verification.ok
    ? 'Verificat: cloud-ul are aceleași rezultate ca acest calculator.'
    : `Atenție: ${verification.differences.length} nepotriviri între local și cloud (vezi lista de mai jos).`);

  return { results, imported: importReport?.imported || {}, skipped: importReport?.skipped || [], verification };
}

const COUNTED_SECTIONS = [
  'matches', 'match_rounds', 'match_events', 'point_events', 'match_referee_scores',
  'category_athletes', 'category_teams', 'fight_athlete_weights', 'category_athlete_scores',
];

const AWARD_KEYS = [
  'first_place_id', 'second_place_id', 'third_place_id',
  'first_place_team_id', 'second_place_team_id', 'third_place_team_id',
];

const MAX_REPORTED_DIFFERENCES = 50;

function diffResultPacks(local, cloud) {
  const differences = [];
  const add = (message) => {
    if (differences.length < MAX_REPORTED_DIFFERENCES) differences.push(message);
  };

  const cloudCategories = new Map((cloud.category_results || []).map((entry) => [entry.id, entry]));
  for (const entry of local.category_results || []) {
    const counterpart = cloudCategories.get(entry.id);
    if (!counterpart) {
      add(`Categoria ${entry.id} lipsește în cloud.`);
      continue;
    }
    for (const key of AWARD_KEYS) {
      if ((entry[key] ?? null) !== (counterpart[key] ?? null)) {
        add(`Categoria ${entry.id}: ${key} local=${entry[key] ?? '—'}, cloud=${counterpart[key] ?? '—'}`);
      }
    }
  }

  const cloudPlaces = new Map(
    (cloud.category_athletes || []).map((entry) => [`${entry.category_id}:${entry.athlete_id}`, entry.place ?? null]),
  );
  for (const entry of local.category_athletes || []) {
    const key = `${entry.category_id}:${entry.athlete_id}`;
    if (!cloudPlaces.has(key)) {
      add(`Sportivul ${entry.athlete_id} (categoria ${entry.category_id}) lipsește în cloud.`);
    } else if ((entry.place ?? null) !== cloudPlaces.get(key)) {
      add(`Loc diferit — sportiv ${entry.athlete_id}, categoria ${entry.category_id}: local=${entry.place ?? '—'}, cloud=${cloudPlaces.get(key) ?? '—'}`);
    }
  }

  const cloudMatches = new Map((cloud.matches || []).map((entry) => [entry.id, entry]));
  for (const entry of local.matches || []) {
    const counterpart = cloudMatches.get(entry.id);
    if (!counterpart) add(`Meciul ${entry.id} lipsește în cloud.`);
    else if (entry.status !== counterpart.status) {
      add(`Meciul ${entry.id}: status local=${entry.status}, cloud=${counterpart.status}`);
    }
  }

  const counts = {};
  for (const section of COUNTED_SECTIONS) {
    const localCount = (local[section] || []).length;
    const cloudCount = (cloud[section] || []).length;
    counts[section] = { local: localCount, cloud: cloudCount };
    // Cloud legitimately holds data this venue never had, so only a
    // shortfall means something of ours failed to land.
    if (cloudCount < localCount) add(`${section}: local ${localCount}, cloud ${cloudCount}`);
  }

  const localRefereeScores = (local.category_athlete_scores || [])
    .reduce((total, entry) => total + (entry.referee_scores || []).length, 0);
  const cloudRefereeScores = (cloud.category_athlete_scores || [])
    .reduce((total, entry) => total + (entry.referee_scores || []).length, 0);
  counts.category_referee_scores = { local: localRefereeScores, cloud: cloudRefereeScores };
  if (cloudRefereeScores < localRefereeScores) {
    add(`category_referee_scores: local ${localRefereeScores}, cloud ${cloudRefereeScores}`);
  }

  return { ok: differences.length === 0, differences, counts };
}

// Usable on its own, not just after a push - answers "is the web up to
// date with this machine right now?" without changing anything.
async function verifyEventSync({ cloudBaseUrl, cloudToken, localBaseUrl, localToken, eventId, localResults }) {
  const local = localResults
    || await apiCall(localBaseUrl, `/api/offline/event-results/?event_id=${eventId}`, { token: localToken });
  const cloud = await apiCall(cloudBaseUrl, `/api/offline/event-results/?event_id=${eventId}`, { token: cloudToken });
  return diffResultPacks(local, cloud);
}

// Separate, deliberate action - unlocks the event on cloud (sync_mode
// reverts to 'cloud', sync_locked=False) and ends local operation for
// good. Only call this once the operator is sure no more results need to
// be pushed from this machine for this event.
async function completeSyncOnCloud({ cloudBaseUrl, cloudToken, eventId, onProgress }) {
  const report = onProgress || (() => {});

  report('Se finalizează sincronizarea în cloud…');
  await apiCall(cloudBaseUrl, `/api/competitions/${eventId}/complete-local-sync/`, { method: 'POST', token: cloudToken });

  report('Sincronizare în cloud completă.');
}

module.exports = {
  login, listCompetitionEvents, getOverview,
  syncEventLocal, syncEventToCloud, completeSyncOnCloud, verifyEventSync,
  diffResultPacks, // exported for testing - pure, no I/O
};
