# Component Architecture: Competition Categories Tabs

## Overview
This document describes the component structure and data flow for the competition categories tabs feature.

## Component Hierarchy

```
DashboardPage
├── AppBar (Navigation)
│   ├── Desktop Navigation (flex, hidden on mobile)
│   └── Mobile Menu (hamburger drawer)
├── Container
│   ├── Tab 0: My Athletes
│   ├── Tab 1: Competitions (UPDATED)
│   │   ├── Competition List View
│   │   │   ├── Tabs (Upcoming/Ongoing/Past)
│   │   │   └── Competition Cards Grid
│   │   │       └── Card (clickable)
│   │   └── Competition Details View (NEW)
│   │       ├── Back Button
│   │       ├── Competition Header
│   │       └── Category Tabs (NEW)
│   │           ├── Solo Categories
│   │           │   └── Category Cards Grid
│   │           │       └── Category Card
│   │           ├── Fight Categories
│   │           │   └── Category Cards Grid
│   │           │       └── Category Card
│   │           └── Team Categories
│   │               └── Category Cards Grid
│   │                   └── Category Card
│   └── Tab 2: Results
```

## State Management

### Local Component State (useState)

```javascript
// Existing states
const [athletes, setAthletes] = useState([])
const [competitions, setCompetitions] = useState([])
const [loading, setLoading] = useState(true)
const [eventTab, setEventTab] = useState('ongoing')
const [activeTab, setActiveTab] = useState(0)
const [userClubId, setUserClubId] = useState(null)
const [visaData, setVisaData] = useState({})
const [drawerOpen, setDrawerOpen] = useState(false)

// New states for category tabs
const [selectedCompetition, setSelectedCompetition] = useState(null)
const [competitionCategories, setCompetitionCategories] = useState([])
const [categoryTabValue, setCategoryTabValue] = useState(0)
```

### State Flow

```
┌─────────────────────────────────────────┐
│ User Navigates to Competitions Tab       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ fetchCompetitions()                     │
│ GET /landing/events/?status=ongoing     │
│ setCompetitions(list)                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Display Competition Cards (List View)   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ User Clicks Competition Card            │
│ handleSelectCompetition(competition)    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ setSelectedCompetition(competition)     │
│ fetchCategoriesForCompetition(eventId)  │
│ GET /categories/?event=eventId          │
│ setCompetitionCategories(categories)    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Display Competition Details View        │
│ With Three Category Tabs                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ User Switches Category Tabs             │
│ setCategoryTabValue(0/1/2)              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Display Filtered Categories             │
└─────────────────────────────────────────┘
```

## Data Fetching

### API Endpoints

#### 1. Get Competitions
```
GET /landing/events/?status={upcoming|ongoing|past}

Response:
[
  {
    "id": 1,
    "title": "Regional Championship 2024",
    "city_name": "Kyiv",
    "start_date": "2024-05-15",
    "is_past": false
  }
]
```

#### 2. Get Categories for Event
```
GET /categories/?event={eventId}

Response:
[
  {
    "id": 1,
    "name": "Form Solo (15-17) Male",
    "type": "solo",
    "gender": "male",
    "event": 1,
    "enrolled_athletes_count": 5,
    "enrolled_teams_count": 0
  },
  {
    "id": 2,
    "name": "1v1 Fight (15-17) Male",
    "type": "fight",
    "gender": "male",
    "event": 1,
    "enrolled_athletes_count": 8,
    "enrolled_teams_count": 0
  },
  {
    "id": 3,
    "name": "Group Form (Mixed)",
    "type": "team",
    "gender": "mixed",
    "event": 1,
    "enrolled_athletes_count": 0,
    "enrolled_teams_count": 3
  }
]
```

## Event Handlers

### Competition Selection Flow

```javascript
// User clicks a competition card
onClick={() => handleSelectCompetition(competition)}

// Handler sets selected competition and fetches categories
const handleSelectCompetition = (competition) => {
  setSelectedCompetition(competition)
  fetchCategoriesForCompetition(competition.id)
}

// Fetches categories and resets category tab
const fetchCategoriesForCompetition = async (competitionId) => {
  // API call to get categories
  const response = await categoryAPI.getEventCategories(competitionId)
  
  // Process response
  setCompetitionCategories(categories)
  setCategoryTabValue(0) // Reset to first tab
}
```

### Back Navigation Flow

```javascript
// Back button click
onClick={handleBackToCompetitions}

// Handler clears selected competition and categories
const handleBackToCompetitions = () => {
  setSelectedCompetition(null)
  setCompetitionCategories([])
  // State change triggers re-render to show list view
}
```

### Category Tab Switching

```javascript
// Tab change handler
onChange={(_, value) => setCategoryTabValue(value)}

// Tab filters categories by type
{categoryTabValue === 0 && (
  competitionCategories.filter(c => c.type === 'solo')
)}

{categoryTabValue === 1 && (
  competitionCategories.filter(c => c.type === 'fight')
)}

{categoryTabValue === 2 && (
  competitionCategories.filter(c => c.type === 'team')
)}
```

## Conditional Rendering

### Competition View Toggle

```javascript
{!selectedCompetition ? (
  // Show competition list
) : (
  // Show competition details with category tabs
)}
```

### Category Tab Content Rendering

```javascript
{categoryTabValue === 0 && (
  // Solo categories
)}

{categoryTabValue === 1 && (
  // Fight categories
)}

{categoryTabValue === 2 && (
  // Team categories
)}
```

### Enrollment Button Logic

```javascript
{!selectedCompetition.is_past && (
  <Button>Enroll Athletes/Teams</Button>
)}
```
- Button only shows for future/ongoing competitions
- Hidden for past competitions (read-only view)

## Styling & Layout

### Responsive Design

```javascript
// Competition cards grid
<Grid container spacing={2}>
  <Grid item xs={12} sm={6} md={3}>
    // xs: Full width (mobile)
    // sm: 50% width (tablet)
    // md: 25% width (desktop)
  </Grid>
</Grid>

// Category cards grid
<Grid container spacing={2}>
  <Grid item xs={12} sm={6} md={4}>
    // xs: Full width (mobile)
    // sm: 50% width (tablet)
    // md: 33% width (desktop - 3 per row)
  </Grid>
</Grid>
```

### Material-UI Components Used

- **Tabs**: Category type selection
- **Tab**: Individual category type option
- **Card**: Competition and category display
- **CardContent**: Card content container
- **Grid**: Responsive layout
- **Button**: Navigation and enrollment
- **Chip**: Status/info badges
- **Badge**: Gender/count indicators
- **Typography**: Text display
- **Box**: Layout containers
- **CircularProgress**: Loading indicator

## Performance Considerations

### Prefetching (Backend)

```python
# CategoryViewSet uses prefetch for optimization
queryset = Category.objects.prefetch_related(
    'enrolled_athletes__athlete'
).all()
```

### Filtering (Backend)

Categories are filtered by event_id at the database level:
```python
if event_id:
    queryset = queryset.filter(event_id=event_id_int)
```

### Client-Side Filtering (Frontend)

Category types are filtered in JavaScript using `.filter()`:
```javascript
competitionCategories.filter(c => c.type === 'solo')
```

## Key Features

### 1. Category Grouping
- Categories automatically grouped by type (solo/fight/team)
- Tab labels show count of each type
- Easy navigation between category types

### 2. Enrollment Tracking
- Display count of enrolled athletes/teams per category
- Different count fields for athletes vs teams
- Updates reflect database state

### 3. User-Friendly Navigation
- Clear back button to return to list
- Tab switching within details view
- Cards are clickable for quick access

### 4. Responsive Mobile Experience
- Full-width cards on mobile
- Touch-friendly tap targets
- Optimized spacing for small screens

### 5. Past Competition Handling
- Read-only view for past competitions
- Enrollment buttons hidden
- Category information still visible

## Data Validation

### Frontend Validation
- Check for null/undefined competition
- Verify categories array exists before filtering
- Safe property access (optional chaining)

### Backend Validation
- Event ID validation in CategoryViewSet
- Category count fields calculated safely
- Prefetch prevents N+1 queries

## Error Handling

### API Errors
```javascript
catch (error) {
  console.error('Error fetching categories:', error)
  setCompetitionCategories([])
}
```

### Empty States
- "No competitions found" message for empty list
- "No solo categories available" for empty tabs
- Clear visual feedback for each state

## Accessibility Considerations

- Semantic HTML (proper heading hierarchy)
- Tab focus management (Material-UI handles)
- Color coding with labels (not color alone)
- Loading states indicate async operations
- Alt text for icons (Material-UI icons have descriptions)

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- CSS Grid and Flexbox support required
- ES6+ JavaScript features used
- Material-UI v5+ CSS-in-JS approach

## Future Enhancement Opportunities

1. **Search/Filter**: Add search within categories
2. **Sorting**: Sort categories by name, enrollment, etc.
3. **Pagination**: Handle large number of categories
4. **Caching**: Cache category data with refresh option
5. **Real-time Updates**: WebSocket for live enrollment updates
6. **Quick Stats**: Display min/max enrollment per category
7. **Bulk Actions**: Enroll in multiple categories at once
