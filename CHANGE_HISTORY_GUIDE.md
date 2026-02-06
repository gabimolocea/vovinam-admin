# Change History Tracking Implementation

## Overview

Added automatic change history tracking for Django admin. Objects created or modified via the API will now appear in the admin history views, instead of showing "This object doesn't have a change history."

## How It Works

### 1. **history_utils.py** - Core History Functions
New utility module with functions to create LogEntry records:
- `create_log_entry()` - Base function to create LogEntry records
- `log_addition()` - Log when an object is created
- `log_change()` - Log when an object is modified
- `log_deletion()` - Log when an object is deleted
- `HistoryTrackingMixin` - Mixin for ViewSets to easily track changes

### 2. **signals.py** - Automatic History Creation
Added signal handlers that automatically create LogEntry records when tracked models are saved:
- Hooks into `post_save` signal for 10+ key models
- Only creates history when a user is available (not for anonymous requests)
- Tracks: Athlete, Event, Category, Team, Match, GradeHistory, CategoryAthleteScore, CategoryTeamScore, TrainingSeminarParticipation, Visa

## Integration Points

### For ViewSets
If you want explicit control over history tracking in a ViewSet, use `HistoryTrackingMixin`:

```python
from rest_framework import viewsets, status
from rest_framework.response import Response
from .history_utils import HistoryTrackingMixin

class AthleteViewSet(HistoryTrackingMixin, viewsets.ViewSet):
    def create(self, request):
        serializer = AthleteSerializer(data=request.data)
        if serializer.is_valid():
            athlete = self.save_with_history(serializer, request.user)
            return Response(AthleteSerializer(athlete).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
```

### For Direct Model Saves
History is tracked automatically via signals for these models:
- Athlete
- Event
- Category
- Team
- Match
- GradeHistory
- CategoryAthleteScore
- CategoryTeamScore
- TrainingSeminarParticipation
- Visa
- FederationRole

## Viewing History

1. Navigate to any object in the admin interface
2. Click the **History** button/link at the top right
3. You'll now see a complete audit trail of:
   - Who made the change
   - When it was made
   - What fields were changed
   - Whether it was added, modified, or deleted

## Example

**Before:**
```
This object doesn't have a change history. It probably wasn't added via this admin site.
```

**After:**
```
Date/Time | User | Action | Change Message
----------|------|--------|----------------
2025-02-06 10:30 | admin | Added | Added via API
2025-02-06 11:45 | admin | Changed | Changed status from pending to approved
```

## Important Notes

- **Anonymous requests**: History is NOT tracked for unauthenticated/anonymous users
- **Admin interface saves**: Django admin automatically creates LogEntry records (this system doesn't duplicate that)
- **API saves**: All API saves via authenticated users are now tracked
- **Direct database saves**: Only tracked if the model instance has `_current_user` attribute set

## Troubleshooting

If an object still doesn't show history:
1. Check that the object was created by an authenticated user
2. Verify the model is in the `MODELS_TO_LOG` list in `signals.py`
3. Check that migrations were applied: `python manage.py migrate`
4. Confirm user exists: `python manage.py shell` then `from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username='admin').exists()`

## Future Enhancements

- Track field-level changes in more detail
- Custom change messages from API endpoints
- Webhook notifications on important changes
- API endpoint to view change history
- Change history filtering in admin list views
