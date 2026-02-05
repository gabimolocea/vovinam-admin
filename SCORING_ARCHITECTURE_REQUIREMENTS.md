# Scoring System Architecture - Complete Requirements

## Overview
This document clarifies the scoring logic across all three competition category types with emphasis on video timestamp linking for fight categories.

---

## 1. SOLO CATEGORIES - Individual Athlete Scoring

### Data Model
```
Category (base) → SoloCategory
├─ athletes (M2M via CategoryAthlete)
├─ categories.athlete_scores (FK to CategoryAthleteScore)
├─ Referees assigned: 5 (stored in CategoryRefereeAssignment.referee_1 to referee_5)
└─ Awards: first_place, second_place, third_place (FK to Athlete)
```

### Scoring Logic
- **5 Referees** each score the **athlete individually**
- Each referee assigns a **numeric score** (typically 0-10 scale)
- **Final Score Calculation**:
  1. Collect all 5 referee scores
  2. Remove the **highest** and **lowest** scores
  3. **Sum the middle 3 scores** for the final result
  4. If < 3 referees have scored, result is invalid
  5. If exactly 3-4 scores exist, adjust by removing only highest or highest+lowest

### Special Cases
- **Athlete Disqualification**: Mark with status='rejected' or add disqualification flag
- **No Show**: Athlete scored = 0 or special "DNS" (Did Not Show) status
- **Withdrawal**: Score removed from calculation
- **Approval Workflow**: Score status field = 'pending' | 'approved' | 'rejected' | 'revision_required'

### Current Implementation Status
✅ **IMPLEMENTED**:
- `CategoryRefereeScore` model stores individual scores
- `CategoryAthleteScore.calculated_score` property implements 3-out-of-5 logic
- `SoloCategoryAdmin` with inline referee assignment (`CategoryRefereeAssignmentInline`)
- `CategoryAthleteScoreInline` with R1-R5 editable fields

📋 **NEEDED**:
- Disqualification/No-Show handling in admin UI
- Approval workflow enforcement in admin forms

---

## 2. TEAM CATEGORIES - Team Scoring

### Data Model
```
Category (base) → TeamCategory
├─ athletes (M2M via CategoryAthlete) - all eligible athletes
├─ teams (M2M via CategoryTeam)
├─ categories.athlete_scores (FK to CategoryAthleteScore, type='teams')
├─ Referees assigned: 5 (stored in CategoryRefereeAssignment.referee_1 to referee_5)
└─ Awards: first_place_team, second_place_team, third_place_team (FK to Team)
```

### Scoring Logic
- **Per Team** (not per individual athlete):
  - **5 Referees** each score the **team as a unit**
  - Team can have multiple athletes/members
  - Final Score = **middle 3 scores** (same as Solo)
  
- **Team Composition**:
  - `team_members` M2M relationship tracks which athletes are on the team
  - `team_name` field identifies the team (e.g., "Team A")
  - Can be self-submitted or officially registered

### Approval Workflow
- Teams submitted by athletes require approval (status='pending')
- Admin reviews and approves/rejects (`CategoryAthleteScore.status`)
- Team awards auto-populate when score is approved

### Current Implementation Status
✅ **IMPLEMENTED**:
- `CategoryAthleteScore` with type='teams'
- `team_name` and `team_members` M2M fields
- `TeamCategoryAdmin` with team scores inline
- `CategoryTeamScoreInline` for editing team scores

📋 **NEEDED**:
- Better team enrollment management UI
- Clarify if team submission is athlete-initiated vs admin-registered

---

## 3. FIGHT CATEGORIES - Bracket-Based Match Scoring 🥋

### Data Model Hierarchy
```
FightCategory
├─ athletes (M2M via CategoryAthlete) - all enrolled fighters
├─ matches (FK - multiple Match objects)
├─ awards: first_place, second_place, third_place (FK to Athlete)
└─ brackets (logical: qualifications, semi-finals, finals)

Match (one match per bracket round pairing)
├─ category (FK to FightCategory)
├─ match_type ('qualifications' | 'semi-finals' | 'finals')
├─ red_corner (FK to Athlete)
├─ blue_corner (FK to Athlete)
├─ central_referee (FK to Athlete) - assigned after match
├─ referee_assignment (OneToOne to MatchRefereeAssignment)
├─ matches.point_events (FK to RefereePointEvent)
├─ matches.simplified_referee_scores (FK to MatchRefereeScore)
└─ Video recording metadata (NEW - see below)

MatchRefereeAssignment
├─ match (OneToOne)
├─ referee_1 through referee_5 (FK to Athlete)
└─ [Optional] central_referee position tracking

RefereePointEvent (Per-Round Scoring)
├─ match (FK)
├─ referee (FK to Athlete - one of R1-R5)
├─ side ('red' | 'blue')
├─ points (integer - points awarded this round)
├─ round (metadata['round'] - which round of the match)
├─ event_type ('score' | 'penalty' | 'deduction' | 'other')
└─ metadata (JSON - extensible data including round number)

MatchRefereeScore (Final Aggregated Score Per Referee)
├─ match (FK)
├─ referee (FK)
├─ red_corner_score (decimal - final aggregated)
├─ blue_corner_score (decimal - final aggregated)
└─ submitted_date (timestamp)
```

### Scoring Process

#### Phase 1: Per-Round Referee Scoring
```
For each round (1, 2, 3, ... N):
  For each of 5 referees:
    - Assigns points to RED corner: points = X
    - Assigns points to BLUE corner: points = Y
    - Creates RefereePointEvent(referee=R1, side='red', points=X, metadata={'round': 1})
    - Creates RefereePointEvent(referee=R1, side='blue', points=Y, metadata={'round': 1})
```

**Current Implementation**: Uses `api.scoring.compute_match_results()` which:
1. Groups events by referee and round
2. Sums points per referee/side/round
3. Returns per-referee aggregated scores (red_corner_score, blue_corner_score)

#### Phase 2: Central Referee Penalties (After Rounds End)
```
Central Referee can assign penalty points to RED or BLUE corner:
  - Creates RefereePointEvent(referee=central_ref, event_type='penalty', side='red', points=-5)
  - These are proportionally deducted from EACH referee's score
  - Example: If central gives -10 to RED:
    - Each referee's red_corner_score reduced by some amount
    - Deduction is proportional to referee's raw score contribution
```

**Current Implementation**: `scoring.py` handles central penalties with proportional allocation logic.

#### Phase 3: Winner Determination
```
After all referees score:
  1. Calculate score difference for each referee: (red - blue)
  2. Sort by absolute difference to find extreme scores
  3. Remove highest and lowest differences (outliers)
  4. Count votes from middle 3 referees:
     - If red's score > blue's score = RED WINS
     - If blue's score > red's score = BLUE WINS
     - If equal = TIE (or additional rounds)
```

**Current Implementation**: `Match.calculate_winner_simplified()` and `scoring.compute_match_results()`.

### Display Requirements for Fight Admin

#### 1. **Bracket Visualization**
The admin interface should show:
```
Category: Light Weight (U21)
├─ QUALIFICATIONS Round
│  ├─ Match 1: [Athlete A (Red)] vs [Athlete B (Blue)] → Winner: A
│  ├─ Match 2: [Athlete C (Red)] vs [Athlete D (Blue)] → Winner: C
│  └─ Match 3: [Athlete E (Red)] vs [Athlete F (Blue)] → Winner: E
│
├─ SEMI-FINALS Round
│  ├─ Match 4: [Winner 1 (Red)] vs [Winner 2 (Blue)] → Winner: A
│  └─ Match 5: [Winner 3 (Red)] vs [Bye/Reserve] → Winner: C
│
└─ FINALS Round
   └─ Match 6: [Winner 4 (Red)] vs [Winner 5 (Blue)] → Winner: A
       → 1st Place Award
       → 2nd Place Award (loser of Match 6)
       → 3rd Place Award (loser of Match 4 and 5)
```

**Current Status**: ✅ Partially implemented
- `FightCategory` has `matches` relationship
- `Match.match_type` field for bracket stage
- `MatchAdmin` displays matches with inline editing
- Admin can view/edit matches within category

**Needed**:
- Visual bracket layout (tree/tournament view)
- Auto-creation of next-round matches based on winners
- Match seeding and bye handling

#### 2. **Enrolled Athletes View**
```
FightCategory Admin → Athletes Tab
┌─────────────────────────────────────────┐
│ Enrolled Athletes (15)                  │
├─────────────────────────────────────────┤
│ Name          | Club      | Grade      │
│ Athlete A     | Club 1    | 3rd Kyu    │
│ Athlete B     | Club 2    | 2nd Kyu    │
│ Athlete C     | Club 3    | 1st Kyu    │
│ ...           | ...       | ...        │
└─────────────────────────────────────────┘
```

**Current Status**: ✅ Implemented via `CategoryAthlete` M2M inline

#### 3. **Awarded Athletes View**
```
FightCategory Admin → Awards Tab
┌──────────────────────────────────┐
│ Awards                           │
├──────────────────────────────────┤
│ 1st Place: Athlete A (Final Win) │
│ 2nd Place: Athlete X (Final Loss)│
│ 3rd Place: Athlete Y (Semi Loss) │
└──────────────────────────────────┘
```

**Current Status**: ✅ Implemented via `SoloCategoryAdmin` pattern (inherited by FightCategory)

#### 4. **Matches with IDs**
```
FightCategory Admin → Matches Tab
┌────────────────────────────────────────────────┐
│ Matches (6)                                    │
├────────────────────────────────────────────────┤
│ ID | Round  | Red Corner | Blue Corner | Win  │
│ 101| Quals  | Athlete A  | Athlete B   | A    │
│ 102| Quals  | Athlete C  | Athlete D   | D    │
│ 103| Quals  | Athlete E  | Athlete F   | E    │
│ 104| Semis  | Athlete A  | Athlete D   | A    │
│ 105| Semis  | Athlete E  | Athlete G   | E    │
│ 106| Finals | Athlete A  | Athlete E   | A    │
└────────────────────────────────────────────────┘
```

**Current Status**: ✅ Implemented via `MatchInline` in FightCategoryAdmin

---

## 4. VIDEO RECORDING TIMESTAMPS - NEW REQUIREMENT 📹

### Current Video Support
✅ **Existing in Models**:
- `Match.match_video` - FileField to store match video file
- Can upload MP4, WebM, etc.
- Stored in `/media/match_videos/`

❌ **Missing**:
- Video URL/timestamp linking
- Round-specific video segments
- Timestamp-based playback correlation

### Proposed Video Recording Model

```python
class MatchVideoRecording(models.Model):
    """
    Links a match to video recordings with timestamp segments.
    Supports multiple videos and round-specific timestamps.
    """
    match = models.OneToOneField(
        'Match',
        on_delete=models.CASCADE,
        related_name='video_recording',
        help_text='The match this video records'
    )
    
    # Video storage
    video_file = models.FileField(
        upload_to='match_videos/%Y/%m/%d/',
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    # External URL (e.g., YouTube, Vimeo, S3)
    video_url = models.URLField(
        blank=True,
        null=True,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    # Video metadata
    duration_seconds = models.IntegerField(
        null=True,
        blank=True,
        help_text='Total video duration in seconds'
    )
    recorded_at = models.DateTimeField(
        help_text='When the video was recorded'
    )
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Match Video Recording'
        verbose_name_plural = 'Match Video Recordings'


class MatchVideoSegment(models.Model):
    """
    Defines timestamp ranges in a video for specific rounds/periods.
    Allows quick navigation to relevant parts of the match.
    """
    video_recording = models.ForeignKey(
        'MatchVideoRecording',
        on_delete=models.CASCADE,
        related_name='segments',
        help_text='The video this segment belongs to'
    )
    
    # Round/Period identification
    round_number = models.IntegerField(
        help_text='Round number (1, 2, 3, etc.)'
    )
    
    # Timestamp range
    start_time_seconds = models.IntegerField(
        help_text='Start of segment in seconds (0-based)'
    )
    end_time_seconds = models.IntegerField(
        help_text='End of segment in seconds'
    )
    
    # Optional labels
    label = models.CharField(
        max_length=100,
        blank=True,
        help_text='e.g., "Round 2 - Red Corner Attack"'
    )
    notes = models.TextField(
        blank=True,
        help_text='Specific events/notes during this segment'
    )
    
    class Meta:
        ordering = ['round_number', 'start_time_seconds']
        unique_together = ('video_recording', 'round_number')
        verbose_name = 'Video Segment'
        verbose_name_plural = 'Video Segments'


class RefereePointEventWithTimestamp(models.Model):
    """
    Links a specific point event to a video timestamp.
    Allows replaying the exact moment a referee awarded points.
    """
    point_event = models.OneToOneField(
        'RefereePointEvent',
        on_delete=models.CASCADE,
        related_name='video_timestamp',
        help_text='The scoring event'
    )
    
    video_recording = models.ForeignKey(
        'MatchVideoRecording',
        on_delete=models.CASCADE,
        related_name='timestamped_events',
        help_text='The video containing this event'
    )
    
    # Timestamp in video
    timestamp_seconds = models.IntegerField(
        help_text='When in the video this event occurred (seconds)'
    )
    
    # Optional context
    notes = models.TextField(
        blank=True,
        help_text='e.g., "Kick to head", "Takedown"'
    )
    
    class Meta:
        verbose_name = 'Point Event Timestamp'
        verbose_name_plural = 'Point Event Timestamps'
```

### Implementation Plan

#### Phase 1: Add Video Models (Migration)
1. Create `MatchVideoRecording` model
2. Create `MatchVideoSegment` model
3. Create `RefereePointEventWithTimestamp` model
4. Create migration: `0047_add_match_video_recording_models.py`

#### Phase 2: Admin Interface
```python
# admin.py

class MatchVideoSegmentInline(admin.TabularInline):
    model = MatchVideoSegment
    extra = 1
    fields = ['round_number', 'start_time_seconds', 'end_time_seconds', 'label', 'notes']

class MatchVideoRecordingInline(admin.TabularInline):
    model = MatchVideoRecording
    inlines = [MatchVideoSegmentInline]
    extra = 0
    fields = ['video_file', 'video_url', 'duration_seconds', 'recorded_at', 'is_public']

@admin.register(MatchVideoRecording)
class MatchVideoRecordingAdmin(admin.ModelAdmin):
    list_display = ('match_display', 'recorded_at', 'duration_seconds', 'is_public')
    search_fields = ('match__name', 'match__category__name')
    list_filter = ('is_public', 'recorded_at')
    inlines = [MatchVideoSegmentInline]
    
    def match_display(self, obj):
        return f"{obj.match.red_corner.first_name} vs {obj.match.blue_corner.first_name}"
    match_display.short_description = 'Match'
```

#### Phase 3: Frontend Display
```jsx
// React component for video playback with segments

<MatchVideoPlayer>
  <VideoFile src={match.video_recording.video_url || match.video_recording.video_file} />
  
  <VideoSegments>
    {segments.map(seg => (
      <Segment 
        key={seg.id}
        round={seg.round_number}
        startTime={seg.start_time_seconds}
        label={seg.label}
        onClick={() => player.seek(seg.start_time_seconds)}
      />
    ))}
  </VideoSegments>
  
  <TimestampedEvents>
    {timestamped_events.map(ev => (
      <Event
        time={ev.timestamp_seconds}
        referee={ev.point_event.referee.name}
        points={ev.point_event.points}
        onClick={() => player.seek(ev.timestamp_seconds)}
      />
    ))}
  </TimestampedEvents>
</MatchVideoPlayer>
```

---

## 5. Summary - What's Currently Implemented vs TODO

### ✅ IMPLEMENTED

| Feature | Model | Status |
|---------|-------|--------|
| Solo Category Scoring | CategoryAthleteScore + CategoryRefereeScore | ✅ Complete |
| 5 Referee Assignment (Solo) | CategoryRefereeAssignment | ✅ Complete |
| 3-out-of-5 Score Calculation | CategoryAthleteScore.calculated_score | ✅ Complete |
| Team Category Scoring | CategoryAthleteScore (type='teams') | ✅ Complete |
| Team Member Tracking | CategoryAthleteScore.team_members M2M | ✅ Complete |
| Fight Category Matches | Match model | ✅ Complete |
| Match Brackets | Match.match_type ('qualifications', 'semi-finals', 'finals') | ✅ Complete |
| Per-Round Referee Scoring | RefereePointEvent | ✅ Complete |
| Central Referee Penalties | RefereePointEvent (metadata['central']) | ✅ Complete |
| Winner Calculation (Fights) | Match.calculate_winner_simplified() | ✅ Complete |
| Enrolled Athletes Display | CategoryAthlete M2M inline | ✅ Complete |
| Awarded Athletes Display | Category.first_place, second_place, third_place | ✅ Complete |
| Match List with IDs | MatchInline in FightCategoryAdmin | ✅ Complete |
| Basic Video Upload | Match.match_video FileField | ✅ Complete |

### 📋 TODO

| Feature | Priority | Effort | Notes |
|---------|----------|--------|-------|
| **Video Recording Models** | HIGH | Medium | MatchVideoRecording, MatchVideoSegment models |
| **Video Timestamp Linking** | HIGH | Medium | RefereePointEventWithTimestamp model |
| **Admin UI for Video Segments** | MEDIUM | Medium | Inline edit round timestamps |
| **Bracket Auto-Generation** | MEDIUM | Large | Auto-create next-round matches based on winners |
| **Disqualification/No-Show UI** | MEDIUM | Small | Admin interface for marking athletes unavailable |
| **Approval Workflow Enforcement** | MEDIUM | Small | Ensure status transitions follow rules |
| **Video Player Frontend** | MEDIUM | Large | React component with segment navigation |
| **Timestamp Sync Backend** | LOW | Medium | API endpoint to save timestamp mappings |
| **Video Analytics** | LOW | Large | Heatmaps, replay analytics, etc. |

---

## 6. Data Flow Diagram - Fight Category with Video

```
FightCategory
    ↓
Match (Red: A, Blue: B, Type: Qualifications)
    ├── MatchRefereeAssignment (R1, R2, R3, R4, R5)
    │
    ├── RefereePointEvent (per round)
    │   ├── R1: Round 1, Red = 5pts, Blue = 3pts
    │   ├── R1: Round 2, Red = 4pts, Blue = 5pts
    │   ├── Central: Round 3, Red penalty = -2pts
    │   └── ...
    │
    ├── MatchRefereeScore (aggregated per referee)
    │   ├── R1: Red = 9pts, Blue = 8pts
    │   ├── R2: Red = 7pts, Blue = 10pts
    │   └── ...
    │
    ├── MatchVideoRecording (NEW)
    │   ├── video_file: match_20250205_lightweght_qual1.mp4
    │   ├── duration_seconds: 1200
    │   ├── recorded_at: 2025-02-05 14:30:00
    │   │
    │   └── MatchVideoSegment (NEW)
    │       ├── Round 1: 0-300 seconds
    │       ├── Round 2: 300-600 seconds
    │       └── Round 3: 600-900 seconds
    │
    └── RefereePointEventWithTimestamp (NEW)
        ├── Event: R1 Round 1 Head Kick (5pts) → timestamp 45 seconds
        ├── Event: R2 Round 2 Takedown (4pts) → timestamp 350 seconds
        └── Event: Central Penalty → timestamp 750 seconds

Winner Determination:
  1. Aggregate scores from all RefereePointEvents
  2. Apply central penalties proportionally
  3. Remove highest/lowest referee differences
  4. Count votes from middle 3 referees
  5. Award to Match.red_corner or Match.blue_corner
  6. Update FightCategory.first_place and propagate

Video Playback (Frontend):
  1. Load MatchVideoRecording
  2. Display MatchVideoSegments as chapter markers
  3. Show RefereePointEventWithTimestamp events on timeline
  4. Allow clicking to jump to specific timestamp
  5. Show context: which referee, which side, how many points
```

---

## 7. Key Database Relationships - Final Architecture

```
Category (base)
    ├── SoloCategory
    │   ├── athletes (M2M)
    │   └── athlete_scores (CategoryAthleteScore, type='solo')
    │       └── referee_scores (CategoryRefereeScore, 5 per athlete)
    │           └── referee (FK to Athlete.is_referee=True)
    │
    ├── TeamCategory
    │   ├── athletes (M2M)
    │   ├── teams (M2M)
    │   └── athlete_scores (CategoryAthleteScore, type='teams')
    │       ├── team_members (M2M to Athlete)
    │       └── referee_scores (CategoryRefereeScore, 5 per team)
    │
    └── FightCategory
        ├── athletes (M2M - all enrolled fighters)
        ├── matches (FK)
        │   ├── red_corner (FK to Athlete)
        │   ├── blue_corner (FK to Athlete)
        │   ├── central_referee (FK to Athlete)
        │   ├── referee_assignment (OneToOne to MatchRefereeAssignment)
        │   │   └── referee_1...5 (FK to Athlete.is_referee=True)
        │   ├── point_events (RefereePointEvent)
        │   │   └── video_timestamp (RefereePointEventWithTimestamp - NEW)
        │   ├── simplified_referee_scores (MatchRefereeScore)
        │   │   └── referee (FK to Athlete)
        │   └── video_recording (MatchVideoRecording - NEW)
        │       └── segments (MatchVideoSegment - NEW)
        └── awards: first_place, second_place, third_place
```

This ensures:
- **Solo**: Individual athlete scoring with 5 referees per athlete
- **Teams**: Team-level scoring with 5 referees per team
- **Fights**: Per-round per-referee scoring with central penalties and video timestamp correlation
- **Video**: Complete timestamp-to-event linking for replay and analysis

