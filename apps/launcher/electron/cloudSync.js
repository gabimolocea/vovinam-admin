// Orchestrates the cloud <-> local sync flow by composing the SAME
// endpoints SyncCenterPage already drives by hand (see
// backend/api/views/sync.py's OfflineSyncViewSet and
// backend/api/views/competitions.py's mark-local-in-progress/
// complete-local-sync actions) - no new backend behavior, just automation
// with the admin's own login instead of the fixed service-account flow
// pull_from_cloud.py uses.

// Adresa serverului, asa cum o scrie operatorul, adusa la o forma folosibila.
//
// Fara asta, doua greseli marunte de tastare dadeau erori fara nicio
// legatura cu cauza: un "/" in plus la sfarsit facea adresa sa aiba doua
// slash-uri la mijloc, iar lipsa lui "https://" trimitea cererea pe http.
// Serverele care ne-au trimis o data de la http la https. Tinem minte, ca
// sa nu mai pornim de fiecare data pe drumul gresit si sa platim o cerere in
// plus pentru aceeasi corectura.
const trecuteLaHttps = new Set();

function normalizeBaseUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // Fara schema scrisa, presupunem https. Cine vrea backendul local scrie
  // explicit http://localhost:8000, si ramane asa.
  const cuSchema = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(cuSchema);
    if (u.protocol === 'http:' && trecuteLaHttps.has(u.host)) {
      u.protocol = 'https:';
      return u.toString().replace(/\/+$/, '');
    }
  } catch {
    // Adresa nu se poate interpreta - o lasam asa cum e, ca `fetch` sa dea
    // el eroarea lui, care spune mai limpede ce anume e gresit.
  }
  return cuSchema;
}

// Un redirect inseamna aproape sigur ca adresa scrisa nu e chiar cea buna.
//
// Conteaza mai mult decat pare: cand urmeaza un 301, `fetch` schimba POST-ul
// in GET - asa cere standardul - iar serverul raspunde atunci "Metoda GET nu
// este permisa", un mesaj care nu spune nimic despre adevarata problema.
// Deci nu lasam redirectul sa fie urmat pe tacute.
//
// Singurul caz pe care il reparam singuri e trecerea de la http la https
// catre exact acelasi server si aceeasi cale - adica adresa buna, scrisa cu
// schema gresita. Orice alt redirect poate duce catre alt server, si acolo
// nu trimitem parola nimanui fara sa intrebam: spunem ce adresa cere
// serverul si lasam operatorul sa decida.
function redirectTarget(requestUrl, location) {
  if (!location) return null;
  let from;
  let to;
  try {
    from = new URL(requestUrl);
    to = new URL(location, requestUrl);
  } catch {
    return null;
  }
  const doarSchema = from.protocol === 'http:' && to.protocol === 'https:'
    && from.host === to.host && from.pathname === to.pathname && from.search === to.search;
  return { to, doarSchema };
}

async function apiCall(baseUrl, path, { method = 'GET', token, body } = {}) {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`;
  const request = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  };

  let res = await fetch(url, request);

  if (res.status >= 300 && res.status < 400) {
    const target = redirectTarget(url, res.headers.get('location'));
    if (target?.doarSchema) {
      trecuteLaHttps.add(target.to.host);
      res = await fetch(target.to.href, request);
    } else {
      throw new Error(
        target
          ? `Serverul trimite cererea mai departe, catre ${target.to.origin}. `
            + 'Scrie chiar acea adresa in campul "Server".'
          : 'Serverul a raspuns cu o redirectionare. Verifica adresa din campul "Server".',
      );
    }
  }

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
    // Adresa asa cum a iesit dupa indreptare - cu ea lucreaza mai departe
    // restul sesiunii, si tot ea se salveaza pentru data viitoare, ca sa nu
    // fie corectata la fiecare pornire.
    baseUrl: normalizeBaseUrl(baseUrl),
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

// Answers "does this machine already hold a competition in progress for
// this event?" by looking at the local server itself.
//
// The cloud event's local_sync_status can't answer this: every event-pack
// pull resets it to 'exported' on the cloud side, so an event being
// actively run here - matches played, medals recorded - still shows up as
// a fresh, never-imported event in the picker. Deciding whether a
// destructive re-import is safe from that badge is how a full day of
// results gets overwritten by a pre-event snapshot.
async function inspectLocalEvent({ localBaseUrl, localToken, eventId }) {
  let pack;
  try {
    pack = await apiCall(localBaseUrl, `/api/offline/event-results/?event_id=${eventId}`, { token: localToken });
  } catch {
    // Not on this machine yet (404) - nothing to protect.
    return { hasLiveResults: false, summary: {} };
  }

  const summary = {
    matches_started: (pack.matches || []).filter((match) => match.status && match.status !== 'scheduled').length,
    places_recorded: (pack.category_athletes || []).filter((entry) => entry.place).length,
    technique_results: (pack.category_athlete_scores || []).length,
    match_events: (pack.match_events || []).length,
    point_events: (pack.point_events || []).length,
    referee_scores: (pack.match_referee_scores || []).length,
  };

  return {
    hasLiveResults: Object.values(summary).some((count) => count > 0),
    summary,
  };
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

// ── Manual file handoff ──────────────────────────────
// The automated sync needs to reach cloud from the venue. A sports hall
// with no usable internet is a normal situation, and then the only way
// results ever leave the building is a JSON file on a memory stick,
// uploaded from somewhere that does have a connection. These are the two
// halves of that fallback.

function fetchResultsPack({ localBaseUrl, localToken, eventId }) {
  return apiCall(localBaseUrl, `/api/offline/event-results/?event_id=${eventId}`, { token: localToken });
}

function fetchEventPack({ cloudBaseUrl, cloudToken, eventId }) {
  return apiCall(cloudBaseUrl, `/api/offline/event-pack/?event_id=${eventId}`, { token: cloudToken });
}

// ── Local venue backups ("time travel") ──────────────
// Snapshots of the venue database, taken automatically every 15 minutes
// by the backup-scheduler container and on demand here. Restoring is the
// answer to "something just went very wrong mid-competition".

function listBackups({ localBaseUrl, localToken }) {
  return apiCall(localBaseUrl, '/api/local-backups/', { token: localToken });
}

function createBackup({ localBaseUrl, localToken, label = 'manual' }) {
  return apiCall(localBaseUrl, '/api/local-backups/', { method: 'POST', token: localToken, body: { label } });
}

function restoreBackup({ localBaseUrl, localToken, filename }) {
  return apiCall(localBaseUrl, '/api/local-backups/restore/', { method: 'POST', token: localToken, body: { filename } });
}

module.exports = {
  login, listCompetitionEvents, getOverview, normalizeBaseUrl,
  fetchResultsPack, fetchEventPack,
  listBackups, createBackup, restoreBackup,
  syncEventLocal, syncEventToCloud, completeSyncOnCloud, verifyEventSync,
  inspectLocalEvent,
  diffResultPacks, // exported for testing - pure, no I/O
};
