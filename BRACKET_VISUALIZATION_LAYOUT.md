# Visual Bracket Display - UI Layout Reference

## Main Bracket Management Interface

```
┌─ FRVV Admin - Brackets Tab ─────────────────────────────────────────┐
│                                                                       │
│  [🔄 Refresh] Category: [Lupta -85kg ▼]          [➕ New] [🗑️ Delete] │
│                                                                       │
│  ┌─ Brackets List ─────────────────────────────────────────────────┐ │
│  │ ID │ Name      │ Type              │ Part │ Status   │ Created   │ │
│  ├────┼───────────┼──────────────────┼──────┼──────────┼───────────┤ │
│  │ 1  │ Main  Draw│ single_elimination│  8   │ active   │ 2024-02-03│ │ ← Select
│  │ 2  │ Reserve   │ round_robin       │  4   │ pending  │ 2024-02-03│ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Bracket Structure:                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Position │ Round │ Athlete 1   │ Athlete 2   │ Status    │ ID  │ │
│  ├──────────┼───────┼─────────────┼─────────────┼───────────┼─────┤ │
│  │ 1        │   1   │ John Doe    │ Maria Silva │ completed │ 11  │ │
│  │ 2        │   1   │ Alex Costa  │ Sofia Perez │ pending   │ 12  │ │
│  │ 3        │   2   │ TBD         │ TBD         │ pending   │ 13  │ │
│  │ 4        │   2   │ TBD         │ TBD         │ pending   │ 14  │ │
│  │ 5        │   3   │ TBD         │ TBD         │ pending   │ 15  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌─ Tabs ──────────────────────────────────────────────────────────┐ │
│  │ [🥊 Bracket Visualization] [📋 Matches Details] [🏆 Standings]  │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  [✏️ Edit Match] [👑 Set Winner] [🔄 Refresh]                  │ │
│  │                                                                 │ │
│  │     Round 1          Round 2          Round 3                  │ │
│  │   ┌─────────┐      ┌─────────┐      ┌─────────┐               │ │
│  │   │ John    │      │         │      │         │               │ │
│  │   │ Maria   │──┐   │ John    │──┐   │ Winner! │               │ │
│  │   └─────────┘  │   │ ?       │  │   └─────────┘               │ │
│  │       ↓       │   │ (Gold)  │  │        ↓                     │ │
│  │   ┌─────────┐  │   └─────────┘  │                             │ │
│  │   │ Alex    │  │                │                             │ │
│  │   │ Sofia   │──┴──→┌─────────┐  │                             │ │
│  │   └─────────┘      │ Match   │──┘                             │ │
│  │                    │         │                                │ │
│  │                    └─────────┘                                │ │
│  │                                                                 │ │
│  └─ (Scrollable visual tournament bracket) ───────────────────────┘ │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Visual Bracket Details

### Match Box (Close-up)
```
┌──────────────────────┐
│  Athlete Name (Top)  │  ← Competitor 1
│  (Dark text/Gray bg) │     
├──────────────────────┤  ← Line separates competitors
│  Opponent Name (Bot) │  ← Competitor 2
│  (Dark text/Gray bg) │     
└──────────────────────┘

If match completed and John won:
┌──────────────────────┐
│  John (Winner)       │  ← GOLD background
│  (Bold/Gold bg)      │     + Bold text
├──────────────────────┤
│  Maria (Loser)       │  ← Gray background
│  (Gray bg)           │
└──────────────────────┘
```

### Bracket Connections
```
Winner lines from Round 1 to Round 2:

    Round 1            Round 2
  ┌────────┐        ┌────────┐
  │ Match 1├─────┐  │        │
  └────────┘     ├─→│ Match 3│
                 │  │        │
  ┌────────┐   ┌─┘  └────────┘
  │ Match 2├──→│
  └────────┘   │    ┌────────┐
               └───→│ Match 4│
                    │        │
                    └────────┘
```

## Tab Views Comparison

### Tab 1: 🥊 Bracket Visualization (VISUAL)
```
Professional tournament bracket tree showing:
✓ All rounds displayed horizontally
✓ All matches visible at once
✓ Connecting lines showing bracket flow
✓ Gold highlighting for winners
✓ Clean, professional appearance
✓ Easy to understand tournament structure

Perfect for:
- Tournament display
- Live scoreboard reference  
- Printing the bracket
- Presentation viewing
```

### Tab 2: 📋 Matches Details (TABULAR)
```
┌──────┬──────┬──────────┬──────────┬────────┬──────────┬───────┐
│Pos   │Round │Athlete 1 │Athlete 2 │Winner  │Status    │Match# │
├──────┼──────┼──────────┼──────────┼────────┼──────────┼───────┤
│  1   │  1   │ John Doe │ Maria    │ John   │completed │ 11    │
│  2   │  1   │ Alex     │ Sofia    │        │ pending  │ 12    │
│  3   │  2   │ John     │ TBD      │        │ pending  │ 13    │
└──────┴──────┴──────────┴──────────┴────────┴──────────┴───────┘

Perfect for:
- Detailed editing
- Match-by-match review
- Data verification
- Score recording
```

### Tab 3: 🏆 Standings (RANKINGS)
```
┌────────┬──────────────┬──────┐
│ Place  │ Athlete      │ Wins │
├────────┼──────────────┼──────┤
│ 🥇 1st │ John Doe     │  2   │  ← Gold medal
│ 🥈 2nd │ Alex Costa   │  1   │  ← Silver medal
│ 🥉 3rd │ Sofia Perez  │  1   │  ← Bronze medal
│ 4th    │ Maria Silva  │  0   │
└────────┴──────────────┴──────┘

Perfect for:
- Final results display
- Rankings announcement
- Medal assignment
```

## User Workflow

### Step 1: Select Bracket
```
1. Choose category from dropdown
2. Click on bracket in list below
3. All 3 tabs auto-populate
```

### Step 2: View Tournament Structure
```
1. Click "🥊 Bracket Visualization" tab (auto-selected)
2. See entire tournament tree
3. Winners highlighted in GOLD
4. Connecting lines show progression
```

### Step 3: Edit Match Results
```
Quick Method:
1. Click "👑 Set Winner" 
2. Select winner from dialog
3. Match updates in visual

Detailed Method:
1. Click "✏️ Edit Match"
2. Enter detailed scores/notes
3. Confirm winner
4. Match updates in visual
```

### Step 4: View Final Rankings
```
1. Click "🏆 Standings" tab
2. See ranked athletes with medals
3. Standings auto-calculated from winners
```

## Responsive Design

### Small Screen (1024px width)
```
Visual bracket may need horizontal scrolling
All functionality still available
Tab switching works seamlessly
```

### Normal Screen (1280px width)
```
Most tournament brackets fit on screen
Visible: Rounds 1-3 typically
Comfortable match visibility
```

### Large Screen (1920px+ width)
```
Large tournaments fit fully on screen
All rounds visible without scrolling
Impressive visual presentation
Professional display appearance
```

## Color Scheme

| Element | Color | RGB |
|---------|-------|-----|
| Match box bg | Light Gray | #DCDCDC |
| Match box border | Dark Gray | #646464 |
| Winner highlight | Gold | #FFD700 |
| Winner text | Black | #000000 |
| Lines | Gray | #999999 |
| Background | Off-white | #F8F8F8 |

## Interaction Points

- **Match Box**: Clickable to edit (future feature)
- **"Edit Match" Button**: Opens detailed dialog
- **"Set Winner" Button**: Quick winner selection
- **"Refresh" Button**: Reloads visual from database
- **Tab Switching**: Smooth transitions between views
- **Scrolling**: Navigate large bracket visualizations

This is the professional tournament bracket display matching your reference image! 🏆
