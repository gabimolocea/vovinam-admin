# Local Event Implementation Backlog

Concrete execution backlog for the local-event architecture described in [docs/LOCAL_EVENT_TECHNICAL_PLAN.md](LOCAL_EVENT_TECHNICAL_PLAN.md).

## Phase 1 - Event Pack Export/Import Foundation

### 1.1 Export manifest and event pack
- [ ] Add dedicated event-pack export service in backend
- [ ] Add `GET /api/offline/event-pack/?event_id=<id>`
- [ ] Include manifest metadata
- [ ] Include event-scoped sections:
  - [ ] event
  - [ ] clubs
  - [ ] athletes
  - [ ] groups
  - [ ] categories
  - [ ] category athletes
  - [ ] category teams
  - [ ] teams
  - [ ] team members
  - [ ] matches
  - [ ] match rounds
  - [ ] competition fields
  - [ ] category field assignments
  - [ ] match field assignments
  - [ ] competition referees
  - [ ] category referee assignments
  - [ ] match referee assignments
  - [ ] monitor sessions
- [ ] Add automated tests for export shape

### 1.2 Local import scaffolding
- [ ] Add import service module
- [ ] Define import order and dependency validation
- [ ] Add management command for import
- [ ] Add import report format
- [ ] Add automated tests for import idempotency

### 1.3 Event lock scaffolding
- [ ] Add event sync state fields or sidecar sync state model
- [ ] Add admin visibility for lock state
- [ ] Prevent cloud edits to operational event entities when locked

## Phase 2 - Local Runtime Profile

### 2.1 Backend local profile
- [ ] Add local event settings profile
- [ ] Configure PostgreSQL local database profile
- [ ] Add static serving strategy for built apps
- [ ] Add host/base URL config for LAN

### 2.2 Frontend local profile
- [ ] Define local environment templates for:
  - [ ] competition-admin
  - [ ] referee-scoring
  - [ ] public-display
- [ ] Standardize `VITE_API_BASE_URL` usage
- [ ] Smoke-test all apps against local backend

### 2.3 Deployment assets
- [ ] Add local runbook
- [ ] Add startup script for local event stack
- [ ] Add backup/export scripts

## Phase 3 - Consensus Scoring Mode

### 3.1 Data model
- [ ] Add `Match.scoring_mode`
- [ ] Add `Match.consensus_min_referees`
- [ ] Add `Match.consensus_window_ms`
- [ ] Extend `RefereePointEvent` with sync and consensus metadata
- [ ] Add `ValidatedMatchPoint`

### 3.2 Backend validation
- [ ] Add consensus validation service
- [ ] Add validated points endpoints
- [ ] Add transactional event consumption logic
- [ ] Add automated tests for 2-referee/1-second validation

### 3.3 Referee scoring UI
- [ ] Add match scoring mode branch in referee app
- [ ] Add vote-based UI for consensus mode
- [ ] Add local queue support for raw vote events

### 3.4 Public display UI
- [ ] Add dedicated consensus display layout
- [ ] Display only validated totals
- [ ] Keep penalties/warnings separate via `MatchEvent`

## Phase 4 - Local Device Resilience

### 4.1 Referee offline queue
- [ ] Add IndexedDB queue
- [ ] Add device ID generation
- [ ] Add resend/retry behavior
- [ ] Add duplicate-safe bulk ingest endpoint

### 4.2 Operator visibility
- [ ] Add sync health UI
- [ ] Add pending device queue stats if feasible

## Phase 5 - Local to Cloud Result Sync

### 5.1 Result push
- [ ] Add local result export/push service
- [ ] Add cloud import endpoint for event results
- [ ] Add idempotent external ID handling

### 5.2 Reporting
- [ ] Add sync report UI
- [ ] Add conflict/error report
- [ ] Add post-sync verification checklist

## Recommended implementation order
1. Event pack export endpoint
2. Event pack import command/service
3. Event lock state
4. Local runtime profile
5. Consensus scoring backend
6. Consensus scoring UI/display
7. Referee device queue
8. Local-to-cloud push and reporting
