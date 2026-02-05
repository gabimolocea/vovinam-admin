# Bracket System - Feature Overview

## Overview
The offline app now supports creating tournament brackets for each category type, particularly for **fight/match** competitions. Brackets automatically generate match positions based on selected athletes and bracket type.

## Features

### Bracket Types Supported

1. **Single Elimination** - Standard knockout tournament
   - Athletes paired up for first round
   - Winners advance to next round
   - Losers are eliminated
   - Suitable for direct/fight competitions

2. **Round Robin** - Every athlete fights every other athlete
   - All possible combinations created as matches
   - Best for smaller groups or preliminary rounds
   - No eliminations

3. **Double Elimination** - Winners and losers brackets
   - Two brackets: winners bracket and losers bracket
   - Athletes get second chance after first loss
   - More complex but fairer tournament structure

### UI Location
- **Main Window** → **🏁 Brackets tab** (new tab added to main navigation)

### Workflow

#### Creating a Bracket
1. Open the **Brackets** tab in the main window
2. Select a **Category** from the dropdown (e.g., "Men's Individual Combat")
3. Click **➕ New Bracket** button
4. In the dialog:
   - Enter a **Bracket Name** (optional - auto-generates from category)
   - Select **Bracket Type** (single_elimination, round_robin, or double_elimination)
   - Select athletes from "Available Athletes" list
   - Click **➕ Add** to add athletes to the bracket
   - Click **➖ Remove** to remove selected athletes
   - Click **Create Bracket** to generate the bracket

#### Viewing Bracket Structure
- Once created, brackets appear in the Brackets table
- Select a bracket to see the **Bracket Structure** below
- The structure shows:
  - Position number
  - Round number
  - Athlete 1 name
  - Athlete 2 name
  - Match status (pending/completed)

#### Managing Brackets
- **Delete**: Select a bracket and click **🗑️ Delete** to remove it
- **View**: The preview table shows all match positions for selected bracket

## Database Schema

### brackets table
- `id` - Primary key
- `category_id` - Reference to category
- `category_name` - Category name (cached)
- `category_type` - Type of category (solo, match, team)
- `bracket_type` - Tournament format (single_elimination, round_robin, double_elimination)
- `bracket_name` - Descriptive name for the bracket
- `total_participants` - Number of athletes in bracket
- `status` - 'active', 'completed', or 'cancelled'
- `created_at`, `updated_at` - Timestamps

### bracket_positions table
- `id` - Primary key
- `bracket_id` - Reference to bracket
- `position_number` - Sequence position in bracket
- `round` - Which round this match belongs to
- `match_id` - Reference to match (once created)
- `athlete1_id`, `athlete1_name` - First athlete
- `athlete2_id`, `athlete2_name` - Second athlete
- `winner_id`, `winner_name` - Match winner (once completed)
- `status` - 'pending', 'in_progress', or 'completed'
- `created_at`, `updated_at` - Timestamps

## API Methods

```python
# Create a bracket
db.create_bracket(
    category_id=1,
    category_name='Men Combat',
    category_type='match',
    bracket_type='single_elimination',
    bracket_name='Regional Finals',
    participants=[
        {'id': 1, 'name': 'Athlete 1'},
        {'id': 2, 'name': 'Athlete 2'},
        # ... more athletes
    ]
)

# Get brackets for a category
brackets = db.get_brackets_for_category(category_id=1)

# Get positions in a bracket
positions = db.get_bracket_positions(bracket_id=1, round_num=1)

# Update a position with match result
db.update_bracket_position(
    position_id=1,
    match_id=42,
    winner_id=1,
    winner_name='Athlete 1'
)
```

## Integration with Match System

Brackets can be linked to the Match system:
1. Create a bracket with athletes
2. Create matches from bracket positions
3. Record match results (winner, scores)
4. Update bracket positions with match results
5. Continue through tournament rounds

## Example Flow - Fight Tournament

1. **Setup**
   - Create new Bracket for "Men's Individual Combat"
   - Add 8 athletes
   - Select "single_elimination" type
   - Creates 4 first-round matches, then 2 semi-finals, then 1 final

2. **Round 1 - First Matches**
   - Bracket shows 4 positions (Pos 1-4) for Round 1
   - Each has 2 athletes assigned

3. **Score & Advance**
   - Record match results
   - Winners are recorded in bracket_positions
   - System can auto-generate Round 2 positions

4. **Continue**
   - Same process for Rounds 2 and 3
   - Final bracket shows champion

## Future Enhancements

- Auto-advance winners to next round
- Bye handling (for odd number participants)
- Seeding/ranking system
- Draw/tournament printouts
- Integration with live scoring system
- Sync brackets to backend Django API
