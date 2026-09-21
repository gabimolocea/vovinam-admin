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

// Local -> cloud: export results from local, import them into cloud
// (which marks results_uploaded on the cloud's copy of the event), then
// finalize the sync there.
async function syncEventToCloud({ cloudBaseUrl, cloudToken, localBaseUrl, localToken, eventId, onProgress }) {
  const report = onProgress || (() => {});

  report('Se exportă rezultatele de pe acest calculator…');
  const results = await apiCall(localBaseUrl, `/api/offline/event-results/?event_id=${eventId}`, { token: localToken });

  report('Se trimit rezultatele în cloud…');
  await apiCall(cloudBaseUrl, '/api/offline/event-results/import/', { method: 'POST', token: cloudToken, body: results });

  report('Se finalizează sincronizarea în cloud…');
  await apiCall(cloudBaseUrl, `/api/competitions/${eventId}/complete-local-sync/`, { method: 'POST', token: cloudToken });

  report('Sincronizare în cloud completă.');
  return results;
}

module.exports = { login, listCompetitionEvents, getOverview, syncEventLocal, syncEventToCloud };
