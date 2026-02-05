# Automatic Identifier Generation

## Overview
Categories and matches now automatically generate unique identifiers when created.

## How It Works

### Categories
When you create a new category (Solo, Team, or Fight), the system automatically assigns a `category_number` based on:

**Format:** `{Type}{Gender}{Number}`

- **Solo Male**: `S1`, `S2`, `S3`...
- **Solo Female**: `SF1`, `SF2`, `SF3`...
- **Solo Mixed**: `SM1`, `SM2`, `SM3`...
- **Team Male**: `T1`, `T2`, `T3`...
- **Team Female**: `TF1`, `TF2`, `TF3`...
- **Team Mixed**: `TM1`, `TM2`, `TM3`...
- **Fight Male**: `F1`, `F2`, `F3`...
- **Fight Female**: `FF1`, `FF2`, `FF3`...
- **Fight Mixed**: `FM1`, `FM2`, `FM3`...

The number automatically increments based on existing categories of the same type and gender.

### Matches
When you create a new match, the system automatically assigns a `match_number` based on:

**Format:** `{CategoryNumber}-{MatchType}{Number}`

- **Qualifications**: `Q1`, `Q2`, `Q3`...
- **Semi-finals**: `SF1`, `SF2`, `SF3`...
- **Finals**: `F1`, `F2`, `F3`...

**Examples:**
- `F1-Q1` - First qualification match in Fight category 1
- `F1-Q2` - Second qualification match in Fight category 1
- `S8-SF1` - First semi-final in Solo category 8
- `TM1-F1` - Finals match in Team Mixed category 1

## Usage

### In Admin Interface
Simply create a new category or match - the identifier is generated automatically. You can also manually override it if needed.

### In Code
```python
from api.models import SoloCategory, Match
from landing.models import Event

# Create category - identifier auto-generated
event = Event.objects.first()
category = SoloCategory.objects.create(
    name='U18 Male Forms',
    event=event,
    gender='male'
)
print(category.category_number)  # Outputs: S9 (next available)

# Create match - identifier auto-generated
match = Match.objects.create(
    category=category,
    match_type='qualifications',
    red_corner=athlete1,
    blue_corner=athlete2
)
print(match.match_number)  # Outputs: S9-Q1
```

### Manual Override
You can always override the auto-generated identifier:

```python
category = SoloCategory.objects.create(
    name='Elite Championship',
    event=event,
    gender='male',
    category_number='ELITE-1'  # Custom identifier
)
```

## Current Database State

All existing categories and matches have been assigned identifiers:

**Categories:**
- S1-S9: Solo Male categories
- SF2-SF4: Solo Female categories
- TM1: Team Mixed category
- F1: Fight Male category
- C1: Generic category

**Matches:**
- F1-Q1, F1-Q2: Qualification matches in Fight category 1
- S8-Q2: Qualification match in Solo category 8

## Status Tracking

Every category and match also has a `status` field (automatically set to `not_started`):

- `not_started` - Not yet begun
- `in_progress` - Currently active
- `completed` - Finished

Use the management command to update:
```bash
python manage.py update_status category 15 --status in_progress
python manage.py update_status match 2 --status completed
```

## Benefits

✅ **No manual numbering needed** - Create categories and matches without worrying about identifiers
✅ **Consistent format** - All identifiers follow the same pattern
✅ **Type-specific** - Easy to identify category type at a glance
✅ **Sequential** - Numbers increment logically within each type
✅ **Customizable** - Can override with custom identifiers when needed
