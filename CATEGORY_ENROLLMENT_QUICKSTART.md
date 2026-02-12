# Category Enrollment - Quick Start Guide

## What's New

Your club enrollment app now supports enrolling athletes to specific competition **categories**!

## How It Works

### For Coaches:

1. **View Competition**
   - Navigate to "Competitions" from dashboard
   - Click on a competition that's "upcoming" or "ongoing"

2. **See Available Categories**
   - Page shows all categories for that competition
   - Categories are separated into two tabs:
     - **Solo/Fight**: Individual athlete competitions
     - **Team**: Team-based competitions

3. **Enroll Individual Athletes (Solo/Fight)**
   - Click "Enroll Athletes" on a category card
   - Select one or more athletes from your club
   - Click "Enroll (X)" button
   - ✓ Athletes appear in "Enrolled Athletes" section

4. **Create and Enroll Teams (Team Categories)**
   - Click "Create & Enroll Team" on a category card
   - Enter team name (e.g., "Elite Team A")
   - Select athletes to add to team
   - Click "Create Team"
   - ✓ Team appears in "Enrolled Teams" section

5. **Manage Enrollments**
   - View all enrolled athletes/teams in the category card
   - Click "Remove" to unenroll an athlete or team
   - Only available if event hasn't ended yet

## Category Information Displayed

For each category, you'll see:
- **Category Name** - e.g., "Under 18 Males"
- **Type & Gender** - e.g., "Solo - M" (Solo Male), "Team - Mixed", "Fight - F" (Fight Female)
- **Enrollment Count** - How many athletes or teams are already enrolled
- **Enrolled Members** - List of currently enrolled athletes or teams

## Mobile Support

The page is fully responsive:
- **Desktop**: Two-column card layout
- **Tablet**: Single column with all features
- **Mobile**: Full-width cards, same functionality

## Backend Automatically Updated

When you enroll athletes or teams:
- Django admin automatically records the enrollments
- Data is saved in the database
- Ready for bracket generation and scoring

## Status Indicators

- **Upcoming**: 🟡 Yellow - Enrollment available soon or now
- **Ongoing**: 🟢 Green - Competition active, enrollment still available
- **Past**: ⚫ Gray - Competition finished, enrollment disabled

## Tips

1. **Check Event Status** - Only upcoming/ongoing events allow enrollment
2. **Team Names** - Use clear, memorable names for teams
3. **Athlete Requirements** - Ensure athletes are registered in your club first
4. **Multiple Enrollments** - Same athlete can be in multiple categories if allowed
5. **Changes** - Remove and re-enroll to modify enrollments

## What Gets Created in Django Admin

### SoloCategory / FightCategory
- ✓ CategoryAthlete records with athlete enrollment details
- Used for:
  - Generating brackets
  - Tracking scoring
  - Managing athlete awards

### TeamCategory
- ✓ Team records with club association
- ✓ CategoryTeam records linking teams to categories
- Used for:
  - Team bracket generation
  - Team scoring
  - Team awards and standings

## Common Issues

**"No categories available"**
- The event might not have categories set up yet
- Or the event might be in the past
- Contact event organizers if categories are missing

**"Athlete already enrolled"**
- Athlete is already in a category
- Click "Remove" to unenroll first if needed
- Some competitions might prevent duplicate enrollments

**"Team creation failed"**
- Make sure team name is not empty
- Select at least one athlete for the team
- Check your internet connection

## Next Steps

1. Go to `/dashboard/competitions`
2. Find an upcoming or ongoing event
3. Click on the event to go to enrollment
4. Select your categories
5. Enroll athletes or create teams
6. Confirm in success message

## Support

If you encounter any issues:
1. Check that the event status is "upcoming" or "ongoing"
2. Verify athletes are registered in your club
3. Ensure you have the required permissions
4. Contact the system administrator if problems persist

---

**Last Updated**: December 2024
**Version**: 1.0
