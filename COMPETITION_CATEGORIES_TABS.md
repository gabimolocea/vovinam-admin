# Competition Categories Tabs Implementation

## Overview
Added separate tabs for different category types (Solo/Fight/Teams) on the competitions dashboard, allowing users to view and enroll athletes/teams by category type.

## Changes Made

### Frontend Changes

#### File: `apps/club-enrollment/src/pages/DashboardPage.jsx`

1. **New State Variables**:
   - `selectedCompetition`: Tracks the currently selected competition
   - `competitionCategories`: Stores the categories for the selected competition
   - `categoryTabValue`: Tracks which category type tab is active (0=Solo, 1=Fight, 2=Teams)

2. **New Handler Functions**:
   - `handleSelectCompetition(competition)`: Selects a competition and loads its categories
   - `handleBackToCompetitions()`: Returns to the competitions list view
   - `fetchCategoriesForCompetition(competitionId)`: Fetches categories for a specific competition

3. **UI Changes**:
   - **Competitions List View**: Cards now clickable to view competition details
   - **Competition Details View**: 
     - Shows competition name, city, and date
     - "Back to Competitions" button to return to list
     - Three tabs for category types:
       - Solo tab: Shows solo categories with athlete enrollment count
       - Fight tab: Shows fight categories with athlete enrollment count  
       - Teams tab: Shows team categories with team enrollment count
     - Each category card displays:
       - Category name
       - Gender badge (M/F/Mix)
       - Enrollment count (athletes or teams)
       - "Enroll Athletes/Teams" button (disabled for past competitions)

### Backend Changes

#### File: `backend/api/serializers.py`

1. **CategorySerializer Updates**:
   - Added two new fields:
     - `enrolled_athletes_count`: Returns the count of enrolled athletes for a category
     - `enrolled_teams_count`: Returns the count of enrolled teams for a category
   
2. **New Methods**:
   - `get_enrolled_athletes_count(obj)`: Calculates the number of enrolled athletes
   - `get_enrolled_teams_count(obj)`: Calculates the number of enrolled teams

3. **Updated Meta Fields**:
   - Added both count fields to the serializer's field list for proper exposure via API

## How It Works

### User Flow

1. User navigates to Competitions tab
2. Sees list of competitions (filtered by status: upcoming/ongoing/past)
3. Clicks on a competition card to view its details
4. Competition details page displays three tabs:
   - **Solo (N)**: Shows solo categories with athlete enrollment counts
   - **Fight (N)**: Shows fight categories with athlete enrollment counts
   - **Teams (N)**: Shows team categories with team enrollment counts
5. Each tab displays category cards with relevant enrollment information
6. Users can click "Enroll Athletes" or "Enroll Teams" buttons to proceed with enrollment
7. "Back to Competitions" button returns to the competitions list

### Data Flow

1. Frontend fetches competitions: `GET /landing/events/?status={status}`
2. When competition is selected, frontend fetches categories: `GET /categories/?event={eventId}`
3. Backend CategorySerializer returns:
   - Category basic info (id, name, type, gender, etc.)
   - `enrolled_athletes_count`: Count of CategoryAthlete entries
   - `enrolled_teams_count`: Count of CategoryTeam entries
4. Frontend groups categories by type and displays in tabs

## Category Types

The system supports three category types:
- **solo**: Individual athlete competitions (e.g., Form competition)
- **fight**: One-on-one fight categories (e.g., Boxing match)
- **team**: Team-based competitions (e.g., Group form)

Each type shows relevant enrollment counts:
- Solo and Fight categories show `enrolled_athletes_count`
- Team categories show `enrolled_teams_count`

## API Endpoints Used

- `GET /landing/events/?status={status}` - List competitions by status
- `GET /categories/?event={eventId}` - Get categories for a competition

## Visual Indicators

- **Badges**: 
  - Solo categories: Primary color (Blue) badge
  - Fight categories: Warning color (Orange) badge
  - Teams categories: Success color (Green) badge
- **Gender Indicators**: M (Male), F (Female), Mix
- **Responsive Layout**: 
  - Mobile: Full-width cards
  - Tablet: 2 cards per row
  - Desktop: 3 cards per row

## Future Enhancements

Potential improvements to consider:
1. Add search/filter functionality for categories
2. Show category weight limits or other constraints
3. Display entry deadline information
4. Add category-specific requirements or rules
5. Show average enrollment numbers or competition level indicators

## Testing Recommendations

1. **Frontend**:
   - Test competition selection and navigation
   - Verify category tabs filter correctly by type
   - Test enrollment counts display properly
   - Test responsive layout on mobile/tablet/desktop

2. **Backend**:
   - Verify `enrolled_athletes_count` and `enrolled_teams_count` are accurate
   - Test with competitions having mixed category types
   - Ensure counts update after enrollment/withdrawal

3. **Integration**:
   - Test full flow from competition list to enrollment
   - Verify data consistency between frontend and backend
   - Test with competitions in different status states (upcoming/ongoing/past)
