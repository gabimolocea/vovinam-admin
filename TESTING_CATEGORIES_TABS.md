# Testing Guide: Competition Categories Tabs

## Quick Test Checklist

### Prerequisites
- Backend server running (`python manage.py runserver`)
- Frontend server running (`npm run dev`)
- User logged in with a club that has athletes
- Competitions with categories exist in the database

### Frontend Tests

#### 1. Competition List View
- [ ] Navigate to Competitions tab
- [ ] Verify competitions are displayed as cards
- [ ] Filter works for Upcoming/Ongoing/Past tabs
- [ ] Cards are clickable and responsive

#### 2. Competition Selection
- [ ] Click on a competition card
- [ ] Competition details view appears
- [ ] "Back to Competitions" button is visible
- [ ] Navigation works both ways

#### 3. Category Tabs Display
- [ ] Three tabs are visible: Solo, Fight, Teams
- [ ] Tab labels show category count (e.g., "Solo (5)")
- [ ] Tab counts match actual categories
- [ ] Tabs are clickable and switch views

#### 4. Solo Categories Tab
- [ ] Solo categories are displayed as cards
- [ ] Card shows:
  - [ ] Category name
  - [ ] Blue "Solo" badge with gender indicator (M/F/Mix)
  - [ ] "Enrolled: X athletes" text
  - [ ] "Enroll Athletes" button (if competition not past)
- [ ] Enrollment count is accurate
- [ ] Button links to enrollment page

#### 5. Fight Categories Tab
- [ ] Fight categories are displayed as cards
- [ ] Card shows:
  - [ ] Category name
  - [ ] Orange "Fight" badge with gender indicator
  - [ ] "Enrolled: X athletes" text
  - [ ] "Enroll Athletes" button
- [ ] Only fight-type categories appear

#### 6. Teams Categories Tab
- [ ] Team categories are displayed as cards
- [ ] Card shows:
  - [ ] Category name
  - [ ] Green "Team" badge with gender indicator
  - [ ] "Enrolled: X teams" text
  - [ ] "Enroll Teams" button
- [ ] Only team-type categories appear
- [ ] Team count displays correctly

#### 7. Past Competitions
- [ ] For past competitions, enrollment buttons are hidden/disabled
- [ ] Categories still display with enrollment counts
- [ ] Navigation and tabs work normally

#### 8. Responsive Layout
- [ ] Mobile (< 600px): Full-width cards
- [ ] Tablet (600-960px): 2 cards per row
- [ ] Desktop (>960px): 3 cards per row

### Backend Tests

#### 1. Category Endpoint Filtering
```bash
# Get all categories for a specific event
curl "http://127.0.0.1:8000/api/categories/?event=1"
```
- [ ] Returns array of categories
- [ ] Only categories for that event are included
- [ ] Response includes enrolled_athletes_count
- [ ] Response includes enrolled_teams_count

#### 2. Count Fields Accuracy
```bash
# Check a specific category
curl "http://127.0.0.1:8000/api/categories/1/"
```
- [ ] `enrolled_athletes_count` matches number of CategoryAthlete entries
- [ ] `enrolled_teams_count` matches number of CategoryTeam entries
- [ ] Counts update after athlete/team enrollment

#### 3. Category Type Field
```bash
# Verify type field
curl "http://127.0.0.1:8000/api/categories/?event=1" | jq '.[] | {id, name, type}'
```
- [ ] Categories have type field (solo/fight/team)
- [ ] Type values are correct for each category

### Integration Tests

#### 1. End-to-End Flow
- [ ] User navigates to Competitions
- [ ] Selects a competition
- [ ] Sees categories grouped by type
- [ ] Can view enrollment counts
- [ ] Can navigate to enrollment page

#### 2. Data Consistency
- [ ] Frontend enrollment counts match backend
- [ ] Category types are consistent
- [ ] Filtering works correctly

#### 3. Error Handling
- [ ] Missing event parameter doesn't crash
- [ ] Invalid event ID returns proper error
- [ ] Empty category list shows appropriate message
- [ ] Network errors are handled gracefully

### API Response Example

```json
{
  "id": 1,
  "name": "Форма соло (15-17 років) (Юнаки)",
  "type": "solo",
  "gender": "male",
  "event": 1,
  "enrolled_athletes_count": 5,
  "enrolled_teams_count": 0,
  "enrolled_athletes": [
    {
      "athlete": { "id": 1, "first_name": "John", "last_name": "Doe" },
      "weight": 65
    }
  ],
  "enrolled_teams": []
}
```

### Performance Tests

- [ ] Categories load within 2 seconds for event with 20+ categories
- [ ] Tab switching is instant (no loading delay)
- [ ] No layout shift when switching tabs
- [ ] Memory usage is reasonable with many categories

### Browser Compatibility

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

### Tabs Don't Show Categories
1. Check browser console for errors
2. Verify API endpoint returns data: `GET /categories/?event=<id>`
3. Ensure CategorySerializer includes count fields

### Enrollment Counts Are Wrong
1. Check database for CategoryAthlete/CategoryTeam records
2. Verify serializer methods are calculating correctly
3. Check for prefetch issues in CategoryViewSet

### Buttons Not Appearing for Past Competitions
1. Verify `selectedCompetition.is_past` field is set correctly
2. Check API response includes this field
3. Verify backend Event model has proper past date logic

## Notes

- The implementation uses Material-UI Tabs for category type selection
- Badges use color coding: Blue (Solo), Orange (Fight), Green (Teams)
- Gender indicators: M=Male, F=Female, Mix=Mixed
- Responsive breakpoints follow MUI defaults (xs, sm, md, lg, xl)
