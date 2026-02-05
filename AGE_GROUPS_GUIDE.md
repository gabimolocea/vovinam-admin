# Age-Based Groups for Categories - User Guide

## Overview

The system now supports organizing categories by **age-based groups**. Groups represent age ranges based on athlete birth years (e.g., athletes born 2015-2018).

## How It Works

### 1. Create Groups First

Before creating categories, you should create age groups for your event:

1. Go to **Admin Panel** → **Groups** → **Add Group**
2. Fill in:
   - **Name**: Descriptive name (e.g., "U12 Beginners", "Youth Division")
   - **Event**: Select the event this group belongs to
   - **Birth Year Start**: Starting year (e.g., 2015)
   - **Birth Year End**: Ending year (e.g., 2018)

**Example Groups:**
- Name: "Juniors 2015-2018", Birth Years: 2015-2018
- Name: "Cadets 2010-2014", Birth Years: 2010-2014
- Name: "Seniors 2000-2009", Birth Years: 2000-2009

### 2. Create Categories Within Groups

After creating groups, create your categories and assign them to the appropriate group:

1. Go to **Solo Categories**, **Team Categories**, or **Fight Categories**
2. Click **Add** to create a new category
3. In **Category Details**:
   - **Name**: Category name (e.g., "Male Kata")
   - **Event**: Select the event
   - **Group**: Select the age group this category belongs to
   - **Gender**: Male/Female/Mixt

### 3. View and Filter

The admin interface now shows:
- **Group with age range** in category lists (e.g., "Juniors [2015-2018]")
- **Filter categories by group** using the right sidebar
- **Number of categories** in each group

## Benefits

✅ **Clear Organization**: Categories are logically grouped by age
✅ **Easy Navigation**: Filter and search by group
✅ **Validation**: System ensures birth year ranges are valid
✅ **Flexible**: Groups can have no age range if not needed

## Workflow Example

### Setting Up a Competition

1. **Create Event** (if not exists)
   - Go to Events → Add Event
   - Fill in event details

2. **Create Age Groups**
   - U8 Group: Birth years 2016-2018
   - U12 Group: Birth years 2012-2015
   - U16 Group: Birth years 2008-2011

3. **Create Categories** (within each group)
   - U8 Group:
     - "U8 Male Kata" (Solo Category)
     - "U8 Female Kata" (Solo Category)
     - "U8 Combat" (Fight Category)
   
   - U12 Group:
     - "U12 Male Kata" (Solo Category)
     - "U12 Female Kata" (Solo Category)
     - "U12 Team Performance" (Team Category)

4. **Enroll Athletes** in their appropriate categories based on age

## Admin Interface Features

### Group Admin
- **List View**: Shows group name, event, age range, and category count
- **Age Range Display**: Automatically formats as "2015-2018", "2015+", or "up to 2018"
- **Validation**: Prevents invalid ranges (e.g., start year > end year)

### Category Admins
- **Enhanced Display**: Shows "Group Name (2015-2018)" in list view
- **Filtering**: Filter categories by group
- **Search**: Search by group name
- **Help Text**: Descriptive text explaining group purpose

## Migration Notes

- Existing groups are preserved
- Age range fields are optional (can be added later)
- No data loss - all existing categories maintain their group associations
- Migration: `0045_add_age_range_to_groups.py`

## Tips

💡 **Consistent Naming**: Use clear, consistent group names (e.g., "U12", "Juniors 2015-2018")  
💡 **Year Ranges**: Use actual birth years, not age calculations  
💡 **Optional**: Groups can exist without age ranges for non-age-based categories  
💡 **Reusable**: Same group can be used across multiple events if needed

## Technical Details

### Model Changes
- `Group` model now has:
  - `birth_year_start` (IntegerField, optional)
  - `birth_year_end` (IntegerField, optional)
  - `clean()` method for validation
  - Enhanced `__str__()` showing age ranges

### Admin Enhancements
- `GroupAdmin`: Shows age range and category count
- `CategoryAdmin` classes: Display group with age range, filtering enabled
