# Category Enrollment with Drag-and-Drop

## Overview
The new CategoryEnrollPage provides a dedicated enrollment interface for individual categories with drag-and-drop functionality and quick-enroll buttons.

## User Flow

1. **Navigate to Competitions Tab** → `/dashboard/competitions`
2. **Select a Competition** → Shows categories grouped by type (Solo/Fight/Teams)
3. **Click "Enroll Athletes" or "Enroll Teams"** → Navigates to `/enroll/{competitionId}/{categoryId}`
4. **Category Enrollment Page Opens** with:
   - Category details (name, type, gender, competition info)
   - Two-column layout:
     - **Left**: Available athletes/teams to enroll
     - **Right**: Already enrolled athletes/teams
   - Drag-and-drop between columns
   - One-click "Enroll" and "Remove" buttons

## Features

### Drag-and-Drop Enrollment
- **Drag** an athlete/team from the "Available" column
- **Drop** into the "Enrolled" column
- Visual feedback during drag (blue highlight and "grab" cursor)
- Drop zone highlights when dragging over (green border)

### Quick Enroll Button
- Click "Enroll" button next to any athlete/team
- Instantly adds them to the enrolled list
- No drag-and-drop required

### One-Click Remove
- Click the **trash icon** next to any enrolled athlete/team
- Instantly removes them from the enrollment

### Category Information
- Displays category name
- Shows category type (Solo/Fight/Team)
- Displays gender (Male/Female/Mixed)
- Shows competition date

## Technical Details

### New Routes
```
/enroll/:competitionId/:categoryId  → CategoryEnrollPage (specific category)
/enroll/:competitionId              → EnrollPage (legacy, all categories)
```

### API Endpoints Used
- `GET /categories/{id}/` - Get category details
- `GET /category-athletes/?category={id}` - Get enrolled athletes
- `GET /category-teams/?category={id}` - Get enrolled teams
- `POST /category-athletes/` - Enroll athlete
- `POST /category-teams/` - Enroll team
- `DELETE /category-athletes/{id}/` - Remove enrollment
- `DELETE /category-teams/{id}/` - Remove enrollment

### Data Flow

```
DashboardPage (Competition + Category selected)
    ↓
    [Click "Enroll Athletes" on specific category]
    ↓
Navigate to /enroll/{competitionId}/{categoryId}
    ↓
CategoryEnrollPage mounts
    ↓
Fetch category, athletes, teams, and enrollments
    ↓
Display two-column layout with drag-and-drop
    ↓
User can:
  - Drag athletes/teams to enroll
  - Click "Enroll" button
  - Click "Remove" (trash) button
    ↓
Real-time updates after each action
```

## Component State

```javascript
// Category & Competition
const [competition, setCompetition] = useState(null)
const [category, setCategory] = useState(null)

// Athletes & Teams (available to enroll)
const [athletes, setAthletes] = useState([])
const [teams, setTeams] = useState([])

// Already enrolled
const [enrolledAthletes, setEnrolledAthletes] = useState([])
const [enrolledTeams, setEnrolledTeams] = useState([])

// Drag state
const [draggedAthlete, setDraggedAthlete] = useState(null)
const [draggedTeam, setDraggedTeam] = useState(null)

// UI state
const [loading, setLoading] = useState(true)
const [enrolling, setEnrolling] = useState(false)
const [successMessage, setSuccessMessage] = useState('')
```

## Styling

### Colors
- **Available athletes/teams**: Blue cards (#2196f3 avatars)
- **Enrolled athletes/teams**: Orange/Light Blue cards
- **Drag-over zone**: Green border (#4caf50)
- **Dragging item**: Light blue background (#e3f2fd)

### Responsive Layout
- **Mobile** (xs): Single column, stacked sections
- **Desktop** (md+): Two-column side-by-side layout

### Visual Feedback
- Cards scale up on hover (`transform: scale(1.02)`)
- Drop zone changes to green when dragging
- Cursor changes to "grab" on hover, "grabbing" when dragging
- Success messages fade after 3 seconds

## Drag-and-Drop Implementation

```javascript
// Start drag
onDragStart={(e) => handleDragStartAthlete(e, athlete)}

// Handle over drop zone
onDragOver={(e) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
}}

// Drop to enroll
onDrop={(e) => {
  e.preventDefault()
  if (draggedAthlete) {
    await handleEnrollAthlete(draggedAthlete.id)
  }
}}
```

## Features by Category Type

### Solo/Fight Categories
- Shows available **athletes**
- Enrolls individual athletes
- Displays athlete grade/rank
- Count shows "Enrolled (N)" athletes

### Team Categories
- Shows available **teams**
- Enrolls entire teams at once
- Displays team member count
- Count shows "Enrolled (N)" teams

## Keyboard & Accessibility

- **Back button**: Returns to previous page (competition details)
- **Dashboard link**: Navigates to competitions tab
- **Mobile menu**: Hamburger menu on small screens
- **Success alerts**: Dismissible with close button

## Error Handling

- Network errors are logged to console
- Failed enrollments show error messages
- Automatic page state refresh after each action
- Loading spinners during API calls

## Performance Optimizations

- Prefetching related data (athletes, teams, categories)
- Efficient filtering of available vs enrolled
- Minimal re-renders on state updates
- Single data fetch on component mount

## Testing Checklist

- [ ] Navigate to category enrollment page
- [ ] Verify category details display correctly
- [ ] Drag athlete to enrolled section
- [ ] Click "Enroll" button on an athlete
- [ ] Click "Remove" (trash icon) on enrolled athlete
- [ ] Verify success messages appear and disappear
- [ ] Test with team category
- [ ] Test responsive layout on mobile
- [ ] Verify back button works
- [ ] Check browser console for errors

## Future Enhancements

1. **Bulk Upload**: Upload multiple athletes from CSV
2. **Search/Filter**: Search athletes by name or grade
3. **Weight Categories**: Show weight limits if applicable
4. **Confirmation Dialog**: Ask before removing enrollment
5. **Undo Feature**: Undo last action
6. **Sort Options**: Sort by name, grade, enrollment date
7. **Seat/Lane Assignment**: Assign specific seats during enrollment
8. **Export List**: Download enrolled athletes as PDF/CSV
