# FRVV Local Event + Cloud Sync Technical Plan

> **Operator runbook:** for the step-by-step, non-technical guide to actually
> run a competition on the venue LAN (start the local server, take/restore
> backups, sync results back), see
> [`docs/GHID_COMPETITIE_LOCALA.md`](./GHID_COMPETITIE_LOCALA.md).
>
> **Implementation status:** Phase 1 (event pack export/import, sync lock
> state, `SyncCenterPage`) and Phase 2 (local deployment: `docker-compose.local.yml`,
> `crud.settings_local`, PostgreSQL, backup/restore panel) are implemented.
> Phases 3-5 (consensus scoring mode, offline device queue, cloud push of
> raw/consensus events) remain planned, as described below.
>
> **Known limitation — new entities during results sync:** `sync_locked`
> only blocks operational writes in the **cloud** copy of the event
> (`Event.operational_lock_active`); the local copy created by
> `import_event_pack` always starts with `sync_locked=False`, so athletes,
> categories, matches, etc. can be freely created/edited on the local
> server during the event. However, `import_event_results` intentionally
> **rejects** any `athlete_id`/`category_id`/`match_id`/`team_id` that does
> not already exist in cloud (see `backend/api/sync/import_event_results.py`)
> — it only upserts results for entities that existed at export time. New
> athletes/categories created locally during the event must be added to
> cloud separately (re-export/re-import the event pack while online, or
> manually recreate them in cloud after the event). See the "FAQ" section
> of `docs/GHID_COMPETITIE_LOCALA.md` for the operator-facing explanation.

## Goal

Define a concrete implementation plan for this repo so that:

- the cloud/web platform remains the master setup environment before and after an event
- a full event can be exported from cloud to a local event server before competition day
- `competition-admin`, `referee-scoring`, `public-display`, and `backend` run fully on a local LAN during the event
- after the event, local data can be synchronized back to the cloud platform
- fight matches support two scoring modes:
  - `final_reveal` (existing model)
  - `consensus_window` (new mode where a point is validated only if at least 2 referees submit the same vote within 1 second)

---

## Scope

This plan covers:

- data model changes
- API changes
- app changes in `apps/competition-admin`, `apps/referee-scoring`, `apps/public-display`, and `apps/shared`
- local deployment architecture
- sync flows: cloud -> local and local -> cloud
- LAN/router requirements
- implementation phases and file-level targets

This document is a technical plan, not an implementation.

---

## Current Repo Baseline

### Shared API base

Current frontend apps already support configurable API base URLs through `VITE_API_BASE_URL`:

- [apps/shared/lib/api.js](../apps/shared/lib/api.js)
- [apps/referee-scoring/src/pages/ScoringPanel.jsx](../apps/referee-scoring/src/pages/ScoringPanel.jsx)
- [apps/competition-admin/src/pages/BracketPage.jsx](../apps/competition-admin/src/pages/BracketPage.jsx)

This is a strong foundation for a local-event mode.

### Existing scoring building blocks

Backend already has:

- raw point events: [backend/api/models.py](../backend/api/models.py)
  - `RefereePointEvent`
- per-referee match scores: [backend/api/models.py](../backend/api/models.py)
  - `MatchRefereeScore`
- structured match events: [backend/api/models.py](../backend/api/models.py)
  - `MatchEvent`
- scoring aggregation logic: [backend/api/scoring.py](../backend/api/scoring.py)
- basic offline sync endpoints: [backend/api/views.py](../backend/api/views.py)
  - `OfflineSyncViewSet`
- API registration: [backend/api/urls.py](../backend/api/urls.py)

### Existing event/live display building blocks

- `competition-admin` already manages fields, schedules, referee assignments, and matches
- `public-display` already consumes monitor sessions, matches, rounds, events, and referee scores
- `referee-scoring` already polls and submits match data to the backend

---

# 1. Target Architecture

## 1.1 Operating modes

### Mode A: Cloud mode

Used before and after the event.

Responsibilities:

- registration and approvals
- event configuration
- athlete enrollment
- group/category setup
- bracket generation
- field scheduling
- referee roster assignment
- exporting an event pack for local operation
- importing final results back from local

### Mode B: Local event mode

Used in the venue during the event.

Responsibilities:

- all operational workflows run locally
- all referee actions are written to local backend + local DB
- public displays read from local backend only
- cloud internet is optional, not required

During this mode, the local backend becomes the source of truth.

---

## 1.2 System topology

### Cloud side

- Cloud Django backend
- Cloud database
- Admin / web frontend
- Export service for `event pack`
- Import service for `event results`

### Venue side

- Local Django backend
- Local PostgreSQL database
- Static frontend builds for:
  - `competition-admin`
  - `referee-scoring`
  - `public-display`
- Reverse proxy (`nginx` or `caddy`)
- Router/LAN for all devices
- Sync service to push results to cloud after event

---

# 2. Core Data Ownership Rules

## 2.1 Before local export

Source of truth: cloud

## 2.2 During event

Source of truth: local server

## 2.3 After sync back

Source of truth: cloud archive, populated from local event results

## 2.4 Event lock rule

Once an event pack is exported for local operation, the event must be marked as locked in cloud for operational entities.

Recommended cloud event state:

- `sync_mode = 'cloud' | 'local_event'`
- `sync_locked = true | false`
- `exported_to_local_at`
- `local_sync_status`

When `sync_locked = true`, these must not be edited in cloud:

- enrollments
- teams
- matches/brackets
- field assignments
- referee assignments
- monitor sessions

---

# 3. Match Scoring Modes

## 3.1 Existing mode: `final_reveal`

This remains the current mode:

- referees submit round/final scores
- winner is revealed/aggregated at the end
- current models remain valid:
  - `MatchRefereeScore`
  - `MatchEvent`
  - `RefereePointEvent`

## 3.2 New mode: `consensus_window`

New fight scoring mode:

- a point vote is not immediately displayed as a score
- a point becomes valid only if at least 2 referees submit the same vote
- same vote means:
  - same `match`
  - same `round`
  - same `side`
  - same `points` (`1` or `2`)
- validation window: maximum `1000ms`

### Why backend validation is required

This cannot be trusted to the clients because:

- device clocks differ
- duplicate taps happen
- network delay exists
- LAN may be temporarily unstable

Validation must happen on the server using server receipt timestamps.

---

# 4. Required Model Changes

## 4.1 `Match`

File target:

- [backend/api/models.py](../backend/api/models.py)

Add fields:

- `scoring_mode`
  - `final_reveal`
  - `consensus_window`
- `consensus_min_referees` default `2`
- `consensus_window_ms` default `1000`
- `local_origin_id` / `external_id` for sync-safe identity

Purpose:

- select scoring strategy per match
- support future flexibility

## 4.2 `RefereePointEvent`

File target:

- [backend/api/models.py](../backend/api/models.py)

Keep this as append-only raw event log.

Add/extend with fields or normalized metadata:

- `external_id` (required for idempotent sync)
- `device_id`
- `client_timestamp`
- `server_received_at`
- `sync_status`
- `consensus_status`
- `consensus_group_id`
- `origin_server`
- `round_number` or keep round in metadata but standardize access
- `vote_type` (`score_claim`, `penalty`, `bonus`, etc.)

Recommendation:

Prefer explicit model fields for frequently queried sync/scoring properties instead of storing everything in `metadata`.

## 4.3 New model: `ValidatedMatchPoint`

File target:

- [backend/api/models.py](../backend/api/models.py)

Purpose:

Represent a server-validated scoring outcome in consensus mode.

Suggested fields:

- `match`
- `round`
- `side`
- `points`
- `validated_at`
- `referee_count`
- `window_ms`
- `source_event_ids` or M2M to `RefereePointEvent`
- `sequence_number`
- `external_id`
- `origin_server`

Use cases:

- public display
- score summaries
- audit trail
- cloud sync

## 4.4 Sync metadata mixin (recommended)

Apply to event-operational models that participate in cloud/local sync:

- `external_id`
- `origin_server`
- `source_updated_at`
- `last_synced_at`
- `sync_version`

Suggested targets:

- `Event`
- `Group`
- `Category`
- `Athlete`
- `CategoryAthlete`
- `CategoryTeam`
- `Team`
- `Match`
- `MatchRound`
- `CompetitionField`
- `CategoryFieldAssignment`
- `MatchFieldAssignment`
- `CategoryRefereeAssignment`
- `MatchRefereeAssignment`
- `CompetitionReferee`
- `DisplayMonitorSession`
- `RefereePointEvent`
- `ValidatedMatchPoint`
- `MatchEvent`
- `MatchRefereeScore`

---

# 5. Backend Service Layer Changes

## 5.1 Scoring strategy service

File target:

- [backend/api/scoring.py](../backend/api/scoring.py)

Refactor into strategy-based scoring:

- `compute_match_results_final_reveal(match, ...)`
- `compute_match_results_consensus(match, ...)`
- `compute_match_results(match, ...)` dispatches by `match.scoring_mode`

## 5.2 Consensus validator service

Add a new module:

- `backend/api/consensus_scoring.py`

Responsibilities:

- accept a new raw point event
- find matching candidate events within configured window
- ensure unique referees
- ensure unused source events
- validate the point if quorum is met
- create `ValidatedMatchPoint`
- mark raw events as consumed
- update match score summary
- trigger live display notifications

## 5.3 Sync services

Add modules:

- `backend/api/sync/export_event_pack.py`
- `backend/api/sync/import_event_pack.py`
- `backend/api/sync/push_event_results.py`
- `backend/api/sync/conflict_resolution.py`

Responsibilities:

### Export
- build full event snapshot from cloud
- include manifest version
- include entity sections in deterministic order

### Import
- upsert entities into local DB
- validate dependencies
- produce import report

### Push results
- upload local results back to cloud
- use idempotent `external_id`
- support resume/retry

### Conflict resolution
- reject illegal updates when event is locked
- prefer local results for operational entities once event is in local mode

---

# 6. API Plan

## 6.1 Extend offline/sync endpoints

Current router:

- [backend/api/urls.py](../backend/api/urls.py)

Current `offline` endpoints are too limited.

### New cloud -> local export endpoint

Add to `OfflineSyncViewSet` or a dedicated sync viewset:

- `GET /api/offline/event-pack/?event_id=<id>`

Response shape:

```json
{
  "manifest": {
    "schema_version": 1,
    "event_id": 9,
    "exported_at": "...",
    "origin": "cloud"
  },
  "event": {},
  "clubs": [],
  "athletes": [],
  "groups": [],
  "categories": [],
  "enrollments": [],
  "teams": [],
  "matches": [],
  "match_rounds": [],
  "fields": [],
  "category_field_assignments": [],
  "match_field_assignments": [],
  "competition_referees": [],
  "category_referee_assignments": [],
  "match_referee_assignments": [],
  "monitor_sessions": []
}
```

### New local -> cloud push endpoint

Examples:

- `POST /api/sync/import-local-event-results/`
- `POST /api/sync/push-event-results/`

Payload sections:

- match state updates
- validated points
- raw point events (optional audit)
- match events
- referee scores (for final reveal mode)
- schedule/assignment changes if allowed

### New bulk point event ingest endpoint

For consensus mode, add:

- `POST /api/matches/<id>/point-events/bulk/`

Purpose:

- accept buffered offline queue from referee device
- deduplicate by `external_id`
- validate consensus on server

### New validated points read endpoint

For public display and manager views:

- `GET /api/matches/<id>/validated-points/`
- `GET /api/matches/<id>/score-summary/`

---

# 7. Event Pack Contents

## 7.1 Must include

For a single event:

- event
- clubs used by enrolled athletes
- athletes participating in that event
- groups
- categories
- category enrollments
- teams + team members
- matches
- match rounds
- competition fields
- category field assignments
- match field assignments
- competition referee roster
- category referee assignments
- match referee assignments
- display monitor sessions
- optionally existing pending scores/events if export is a continuation

## 7.2 Import order

The importer must follow dependency order:

1. manifest/event
2. reference entities: cities, grades, titles, federation roles, clubs
3. athletes
4. groups
5. categories
6. category athletes / category teams
7. teams / team members (depending on model dependencies)
8. competition fields
9. category field assignments
10. matches
11. match rounds
12. match field assignments
13. competition referee roster
14. category referee assignments
15. match referee assignments
16. monitor sessions

## 7.3 Import behavior

- idempotent upsert only
- no destructive delete by default
- report missing references
- reject if manifest schema version is unsupported

---

# 8. Frontend Changes by App

## 8.1 `apps/shared`

File targets:

- [apps/shared/lib/api.js](../apps/shared/lib/api.js)

Changes:

- add sync APIs:
  - `offlineAPI.eventPack(eventId)`
  - `syncAPI.pushEventResults()`
- add consensus APIs:
  - `matchPointEventAPI.bulkCreate()`
  - `validatedPointAPI.list(matchId)`
  - `matchScoreSummaryAPI.get(matchId)`
- add helper for local event mode base URLs if needed

## 8.2 `apps/competition-admin`

Primary target areas:

- export event pack from cloud
- import event pack into local
- display sync status
- lock event when exported
- show local/cloud mode badges
- show sync reports after event

Likely file targets:

- event admin pages under `apps/competition-admin/src/pages/`
- hooks under `apps/competition-admin/src/hooks/`

Required UI additions:

- `Export to local event server`
- `Import event pack`
- `Lock event for local operation`
- `View sync report`
- `Push local results to cloud`

## 8.3 `apps/referee-scoring`

File targets:

- [apps/referee-scoring/src/pages/MatchScoring.jsx](../apps/referee-scoring/src/pages/MatchScoring.jsx)

Required refactor:

### Mode branch 1: `final_reveal`
- keep existing scoreboard workflow

### Mode branch 2: `consensus_window`
- UI becomes vote-based
- buttons send raw vote events, not cumulative score totals
- button set:
  - `Red +1`
  - `Red +2`
  - `Blue +1`
  - `Blue +2`
- show submission state:
  - `sent`
  - `saved locally`
  - `synced`
  - `validated`

### Offline/LAN resilience
- add IndexedDB queue
- store pending vote events with `external_id`
- resend automatically to local server when connectivity returns
- do not compute consensus in frontend

Suggested new modules:

- `apps/referee-scoring/src/lib/offlineQueue.js`
- `apps/referee-scoring/src/lib/deviceIdentity.js`
- `apps/referee-scoring/src/lib/matchScoringMode.js`

## 8.4 `apps/public-display`

File targets:

- [apps/public-display/src/pages/DisplayScreen.jsx](../apps/public-display/src/pages/DisplayScreen.jsx)

Add layout branch by match scoring mode:

### For `final_reveal`
- keep existing display behavior

### For `consensus_window`
- compact athlete names
- very large score values in each corner box
- no referee grid / no per-referee totals
- optional small recent-events strip based on validated points only
- penalties/warnings still read from `MatchEvent`

Potential new component:

- `apps/public-display/src/components/ConsensusFightDisplay.jsx`

---

# 9. Local Deployment Architecture

## 9.1 Recommended stack in venue

- 1 local server laptop or mini PC
- PostgreSQL local DB
- Django backend
- reverse proxy (`nginx` or `caddy`)
- built frontend assets for:
  - `competition-admin`
  - `referee-scoring`
  - `public-display`

## 9.2 Why PostgreSQL, not SQLite

SQLite is not recommended for local event mode because:

- many concurrent writes from multiple referee devices
- transaction contention
- weaker locking behavior for this workload
- consensus scoring needs transactional grouping and event consumption

PostgreSQL is required for reliability.

## 9.3 Serving strategy

Preferred local URLs:

- `http://event.local/admin/`
- `http://event.local/competition/`
- `http://event.local/referee/`
- `http://event.local/display/`

Fallback local IP strategy:

- `http://192.168.10.10/admin/`
- `http://192.168.10.10/competition/`
- `http://192.168.10.10/referee/`
- `http://192.168.10.10/display/`

Use a single local host where possible to simplify auth/cookies.

---

# 10. LAN / Router Requirements

## 10.1 Minimum network setup

Hardware:

- dedicated Wi-Fi router
- local server connected by Ethernet
- referee tablets/phones on Wi-Fi
- public display screens or their driving devices on same LAN

## 10.2 Router configuration

- dedicated SSID, e.g. `FRVV-EVENT`
- WPA2/WPA3 password
- DHCP enabled
- client/AP isolation disabled
- 5GHz preferred
- optional 2.4GHz fallback SSID if needed
- internet/WAN optional

## 10.3 Server networking

- static IP or DHCP reservation
- recommended fixed IP: `192.168.10.10`

All apps must point to that host via `VITE_API_BASE_URL` in local mode.

## 10.4 Why a router is still needed without internet

Even with no internet access, the router provides:

- stable LAN addressing
- low-latency connectivity
- shared access to one local backend
- reliable venue-wide wireless coverage

---

# 11. Sync Flows

## 11.1 Before event: cloud -> local

### Step sequence

1. operator finalizes event data in cloud
2. operator locks event for local operation
3. cloud exports `event pack`
4. local server imports `event pack`
5. local validation report is shown
6. all venue apps use local backend only

## 11.2 During event: local only

- all operational writes go only to local DB
- optional device queue buffers temporary LAN interruptions
- no dependency on cloud availability

## 11.3 After event: local -> cloud

### Push contents

- final match states
- final reveal scores
- raw point events (optional but recommended for audit)
- validated points
- penalties/warnings/disqualifications
- revised schedule/assignment state if these are considered authoritative

### Push rules

- idempotent by `external_id`
- retryable
- resumable
- sync report generated

---

# 12. Security and Identity

## 12.1 Device identity

For referee-scoring in local mode, each device should generate/store:

- `device_id` UUID
- optional `device_label`

This must be included in raw point events.

## 12.2 Auth model

Recommended short-term:

- reuse current auth model locally
- import only users/referees relevant to the event or support offline session bootstrap

Recommended long-term:

- event-scoped local auth bootstrap tokens or QR codes

## 12.3 Auditability

Every scoring event should be attributable to:

- referee user
- athlete referee entity
- device ID
- local server timestamp

---

# 13. Implementation Plan by Phase

## Phase 1 - Event sync foundation

Goal:

- full cloud -> local event pack import/export

Backend:

- extend `OfflineSyncViewSet`
- add event manifest schema
- add export service
- add import management command / service
- add event lock state

Frontend:

- add export/import UI in `competition-admin`
- add sync status UI

Acceptance criteria:

- a full event can be exported from cloud
- local server can import it and reconstruct operational data

## Phase 2 - Local deployment mode — ✅ implemented

Goal:

- run backend + 3 apps locally on LAN

Implemented as:

- `backend/crud/settings_local.py` — local settings profile (PostgreSQL, WhiteNoise, `IS_LOCAL_EVENT_SERVER=True`)
- `docker-compose.local.yml` + `backend/Dockerfile.local` — Postgres + backend + `backup-scheduler` containers
- `backend/api/local_backup.py` + `LocalBackupViewSet` (`/api/local-backups/`) — on-demand and scheduled `pg_dump`/`pg_restore` snapshots, with an automatic pre-restore/pre-import safety backup
- `apps/competition-admin/src/components/LocalBackupPanel.jsx` — backup/restore UI embedded in `SyncCenterPage`
- frontend apps keep using `./scripts/start-all-apps.sh` (Vite dev servers already bind `0.0.0.0`, no separate reverse proxy/build step needed)
- see `docs/GHID_COMPETITIE_LOCALA.md` for the operator runbook

Backend/devops:

- local settings profile
- PostgreSQL local config
- reverse proxy config
- serving frontend builds locally

Frontend:

- environment config for local base URL
- smoke test all 3 apps against local backend

Acceptance criteria:

- `competition-admin`, `referee-scoring`, `public-display` all work against local backend without internet

## Phase 3 - Consensus scoring mode

Goal:

- introduce `consensus_window` fight mode

Backend:

- add `Match.scoring_mode`
- add `ValidatedMatchPoint`
- add consensus validator service
- add validated score summary endpoints

Frontend:

- `referee-scoring` vote UI
- `public-display` consensus layout

Acceptance criteria:

- two matching referee votes within 1 second validate a point
- validated points appear on public display

## Phase 4 - Local queue resilience

Goal:

- survive short LAN interruptions on referee devices

Frontend:

- IndexedDB queue
- retry/background sync
- duplicate-safe resend

Backend:

- bulk ingest endpoint with idempotent `external_id`

Acceptance criteria:

- temporary device disconnect does not lose votes

## Phase 5 - Post-event push to cloud

Goal:

- push local results back to cloud

Backend:

- result push APIs
- import result APIs in cloud
- sync report generation

Frontend/admin:

- push and report UI in `competition-admin`

Acceptance criteria:

- local event data can be uploaded to cloud and verified

---

# 14. Concrete File-Level Plan

## Backend files to modify

### Existing files
- [backend/api/models.py](../backend/api/models.py)
- [backend/api/views.py](../backend/api/views.py)
- [backend/api/urls.py](../backend/api/urls.py)
- [backend/api/scoring.py](../backend/api/scoring.py)
- [backend/api/serializers.py](../backend/api/serializers.py)
- [backend/api/admin.py](../backend/api/admin.py)
- [backend/crud/settings.py](../backend/crud/settings.py)

### New backend files suggested
- `backend/api/consensus_scoring.py`
- `backend/api/sync/export_event_pack.py`
- `backend/api/sync/import_event_pack.py`
- `backend/api/sync/push_event_results.py`
- `backend/api/management/commands/export_event_pack.py`
- `backend/api/management/commands/import_event_pack.py`
- `backend/api/tests/test_event_pack_export.py`
- `backend/api/tests/test_event_pack_import.py`
- `backend/api/tests/test_consensus_scoring.py`
- `backend/api/tests/test_local_to_cloud_sync.py`

## Frontend files to modify

### Shared
- [apps/shared/lib/api.js](../apps/shared/lib/api.js)

### Referee scoring
- [apps/referee-scoring/src/pages/MatchScoring.jsx](../apps/referee-scoring/src/pages/MatchScoring.jsx)
- [apps/referee-scoring/src/pages/ScoringPanel.jsx](../apps/referee-scoring/src/pages/ScoringPanel.jsx)
- new: `apps/referee-scoring/src/lib/offlineQueue.js`
- new: `apps/referee-scoring/src/lib/deviceIdentity.js`

### Competition admin
- relevant event/schedule/admin pages under [apps/competition-admin/src/pages](../apps/competition-admin/src/pages)
- relevant hooks under [apps/competition-admin/src/hooks](../apps/competition-admin/src/hooks)

### Public display
- [apps/public-display/src/pages/DisplayScreen.jsx](../apps/public-display/src/pages/DisplayScreen.jsx)
- new: `apps/public-display/src/components/ConsensusFightDisplay.jsx`

---

# 15. Acceptance Criteria Summary

## Cloud -> local
- full event pack export exists
- import reconstructs event locally
- event lock prevents cloud-side operational drift

## Local operation
- local backend supports all 3 apps
- no internet required during event
- all operational writes persist locally

## Consensus scoring
- point validation requires at least 2 referees within 1 second
- validated points are separated from raw referee events
- public display uses a dedicated layout

## Local resilience
- temporary LAN drops do not lose referee actions
- queued events resend safely

## Local -> cloud
- results push is idempotent
- sync report is available
- cloud receives authoritative local event outcomes

---

# 16. Recommended Build Order

1. Event pack export/import
2. Event lock and sync metadata
3. Local deployment profile
4. Consensus scoring backend
5. Consensus scoring frontend + public display layout
6. Referee local queue
7. Local -> cloud push and sync report

This ordering minimizes risk and unlocks venue operation early.

---

# 17. Final Recommendation

For this repo, the safest path is:

- first build a reliable cloud -> local event package flow
- then make the venue run fully on local server + LAN
- then add the new consensus scoring mode on top of that local foundation
- finally add post-event cloud synchronization and reporting

Do not implement consensus scoring before local event architecture is in place, because the new mode depends on low-latency, server-side validation and stable local persistence.
