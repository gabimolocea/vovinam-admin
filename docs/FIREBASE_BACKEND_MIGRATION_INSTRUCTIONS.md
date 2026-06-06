# Firebase Backend Migration Instructions

## Short recommendation

For this project, a full migration from Django to Firebase backend logic is usually **not the best option**.

This codebase is heavily relational and workflow-driven:
- many interconnected models
- approval/status workflows
- admin-style operations
- referee assignments and scoring logic
- match/category/field scheduling
- signals and side effects
- complex reporting and filtering

A better architecture is usually:
- **Firebase Auth** for authentication
- optional **Firestore** for realtime/mobile-friendly data
- keep **Django + SQL** as the main backend and source of truth

## When Firebase backend is reasonable

A Firebase-first backend can work if you want:
- mobile-first clients
- realtime dashboards
- low-ops deployment
- serverless functions instead of a traditional backend

But you must accept:
- more manual enforcement of relational integrity
- harder transactional workflows
- more complexity for reports and ranking logic
- more work to replicate Django admin behavior

## Recommended decision

### Best option for this repo
Use a **hybrid architecture**:
1. Keep Django as the main API and database backend.
2. Use Firebase Auth for identity if needed.
3. Optionally mirror selected realtime data to Firestore.
4. Use Firebase only where it adds value: auth, push, realtime views, mobile integration.

### If you still want full Firebase migration
Use:
- **Firebase Auth**
- **Firestore** for documents
- **Cloud Functions / Cloud Run** for backend logic
- optionally **Cloud SQL (PostgreSQL)** if you want to preserve relational structure better

If you want the data model to stay close to Django, **Cloud SQL is much better than pure Firestore**.

---

# Prompt you can give to Firebase Studio / Gemini / another AI

Use the prompt below.

## Prompt

I have an existing sports competition management platform currently built with Django REST + SQLite/PostgreSQL-style relational models and multiple React apps.

I want you to design a Firebase-based backend architecture that preserves the business logic and data structure as closely as possible.

Important: do NOT simplify this into a generic CRUD app. This is a federation competition platform with approvals, referee assignments, scoring workflows, scheduling, and rankings.

## Existing architecture summary

Backend currently contains:
- Django project in backend/
- custom user model: api.User
- athlete-centric data model
- event/competition management
- categories, groups, matches, rounds, fields/tatamis
- referee assignments for categories and matches
- scoring for technique and fighting
- notification system
- approval workflows with statuses
- signal-driven side effects
- admin-oriented operations

Frontend apps currently include:
- competition-admin
- coach-dashboard
- athlete-enrollment
- referee-scoring
- public-display

## Core domain entities to preserve

Design equivalents for these entities:
- User
- Athlete
- Club
- City
- Grade
- Event / Competition
- Group
- Category
- CategoryAthlete
- CategoryTeam
- Team
- TeamMember
- Match
- MatchRound
- CompetitionField
- CategoryFieldAssignment
- MatchFieldAssignment
- CategoryRefereeAssignment
- MatchRefereeAssignment
- CompetitionReferee
- CategoryAthleteScore
- CategoryRefereeScore
- MatchRefereeScore
- MatchEvent
- RefereePointEvent
- DisplayMonitorSession
- FieldBreak
- Notification
- NotificationSettings
- GradeHistory
- GradeHistorySubmission
- TrainingSeminarParticipation
- EventEnrollment
- DiplomaTemplate

## Critical behavior to preserve

Preserve these system rules:

1. Approval workflows
- Many records use status values like pending, approved, rejected, revision_required.
- There are review timestamps, reviewer fields, admin notes.
- Approval actions trigger additional side effects.

2. Role model
- Roles include admin, athlete, supporter, user.
- Some records are editable only by admins.
- Some are editable by owner or admin.
- Coaches and referees also have operational permissions.

3. Referee assignment logic
- Categories and matches can have 5 referees assigned.
- Referee seat/position matters.
- Referee scoring is separated per referee.

4. Match and category scoring
- Fighting has rounds, point events, penalties, warnings, final referee decisions.
- Technique/solo/team scoring stores referee-by-referee scores.
- Rankings and totals are derived from workflow data.

5. Field/tatami scheduling
- Categories and matches can be assigned to fields.
- Field status can be not_started, in_progress, completed.
- Monitor/public display sessions depend on field assignments.

6. Notifications
- Business events can generate notifications.
- Notification settings affect delivery.

7. Data integrity
- Need strong consistency for scoring, assignments, and approvals.
- Avoid designs that risk conflicting writes.

## What I want from you

Create a migration design with these sections:

1. Recommended Firebase architecture
- Tell me honestly whether pure Firestore is enough
- Or if Firebase Auth + Cloud Functions + Cloud SQL is better
- Explain the tradeoffs

2. Target schema design
- Show collection/table structure
- Show which data should live in Firestore vs SQL
- Preserve relational behavior as much as possible

3. Auth and authorization design
- Firebase Auth mapping to current User model
- role claims
- server-side permission enforcement

4. Backend logic migration plan
- How to migrate Django ViewSets into Cloud Functions / Cloud Run endpoints
- How to migrate model methods and approval workflows
- How to migrate signals into explicit event handlers or functions

5. API compatibility plan
- Keep endpoint shapes as close as possible to current Django REST API
- Suggest a versioned API structure
- Note where compatibility shims are needed

6. Data migration strategy
- How to migrate existing SQL data
- Mapping from relational rows to Firebase/Firestore/Cloud SQL structures
- Ordering of migration steps

7. Realtime strategy
- Which data should be pushed in realtime for referee scoring and public display
- How to avoid race conditions

8. Risks and mitigations
- Call out which parts are harder in Firebase than Django
- Explain what should remain relational if possible

## Very important constraints

- Preserve the current sports domain and workflow complexity.
- Do not flatten everything into naive JSON documents.
- Prefer relational design where needed.
- If pure Firestore is a bad idea for this project, say so clearly.
- If a hybrid Firebase + Cloud SQL architecture is better, propose that as the main solution.
- Include example schemas and endpoint patterns.

## Preferred output style

Please provide:
- a recommended architecture first
- then a detailed migration blueprint
- then a phased implementation plan
- then example schema definitions
- then example API endpoint mappings

---

# My recommendation for you

## Option A — recommended
Keep Django backend, add Firebase around it.

Use this if you want stability and faster delivery.

### Good for
- existing workflows
- current admin behavior
- relational data consistency
- rankings and approvals

### Add Firebase only for
- auth
- push notifications
- realtime mirrors for live screens

## Option B — acceptable
Move API compute layer to Cloud Run / Functions, but keep relational DB in Cloud SQL.

Use this if you want Google Cloud style deployment but want to preserve your backend shape.

### Stack
- Firebase Auth
- Cloud Run
- Cloud SQL PostgreSQL
- optional Firestore for realtime projections

This is the closest Firebase-family equivalent to your Django architecture.

## Option C — least recommended
Pure Firestore + Functions only.

Use this only if you are willing to redesign parts of the system.

### Main drawbacks
- relational joins become harder
- ranking logic becomes more custom
- approval chains are harder to keep strict
- data duplication rises a lot

---

# Final conclusion

For this repo, the most realistic answer is:

**Do not migrate the whole backend to pure Firebase if your goal is to keep the same structure and behavior.**

If you want Google/Firebase infrastructure, the best equivalent is:
- Firebase Auth
- Cloud Run
- Cloud SQL PostgreSQL
- optional Firestore for realtime displays

That preserves your Django-style model much better.
