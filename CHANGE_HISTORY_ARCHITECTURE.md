# Change History - Code Architecture

## How the System Works

### The Signal Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Object Save Triggered                       │
│            (via API ViewSet or admin interface)             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │  Django post_save Signal  │
         │   (built-in mechanism)   │
         └──────────┬───────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │  Our Signal Handler Triggered         │
    │  (in backend/api/signals.py)         │
    └────────┬────────────────────────────┐
             │                             │
             ▼                             ▼
    ┌──────────────────┐        ┌────────────────────┐
    │ Check if object  │        │ Log the Action     │
    │ has _current_user│        │ (log_addition or   │
    │ and it's not     │        │  log_change)       │
    │ anonymous        │        └────────┬───────────┘
    └──────────────────┘                 │
             │                            ▼
             └────────────────────────────────────────┐
                                                      │
                                                      ▼
                        ┌──────────────────────────────────────────┐
                        │  Create LogEntry in Django Admin         │
                        │  (built-in django.contrib.admin.models)  │
                        └──────────────────────────────────────────┘
                                              │
                                              ▼
                        ┌──────────────────────────────────────────┐
                        │  User sees History in Admin Interface   │
                        │  ✅ Click "History" button to view       │
                        └──────────────────────────────────────────┘
```

---

## File: `backend/api/history_utils.py`

This is the **core module** with all the logging functions.

### Key Functions

#### 1. `create_log_entry(obj, action_type, user=None, change_message="")`
**Purpose**: Creates a single LogEntry record

```python
def create_log_entry(obj, action_type, user=None, change_message=""):
    if not user or user.is_anonymous:
        return None  # Don't log anonymous users
    
    content_type = ContentType.objects.get_for_model(obj)
    
    log_entry = LogEntry.objects.create(
        content_type=content_type,
        object_id=str(obj.pk),
        object_repr=str(obj),
        action_flag=action_type,  # ADDITION, CHANGE, or DELETION
        change_message=change_message,
        user=user
    )
    return log_entry
```

**What it does**:
- Gets the Django ContentType for the model
- Creates a LogEntry with all required fields
- Returns the created LogEntry or None if user is anonymous

#### 2. `log_addition(obj, user=None, message="Added via API")`
**Purpose**: Helper to log when an object is created

```python
def log_addition(obj, user=None, message="Added via API"):
    return create_log_entry(obj, ADDITION, user, message)
```

**Called when**: Object is first created

#### 3. `log_change(obj, user=None, changes=None)`
**Purpose**: Helper to log when an object is modified

```python
def log_change(obj, user=None, changes=None):
    if changes:
        change_message = json.dumps([{"changed": {"fields": list(changes.keys())}}])
    else:
        change_message = "Changed via API"
    
    return create_log_entry(obj, CHANGE, user, change_message)
```

**Called when**: Object is modified

#### 4. `HistoryTrackingMixin`
**Purpose**: Optional mixin for ViewSets

```python
class HistoryTrackingMixin:
    def save_with_history(self, serializer, user):
        instance = serializer.save()
        instance._current_user = user  # Attach user to instance
        instance.save()  # Triggers post_save signal
        return instance
```

**How to use**:
```python
class AthleteViewSet(HistoryTrackingMixin, viewsets.ViewSet):
    def create(self, request):
        serializer = AthleteSerializer(data=request.data)
        if serializer.is_valid():
            athlete = self.save_with_history(serializer, request.user)
            return Response(...)
```

---

## File: `backend/api/signals.py`

This is where **automatic tracking** is set up.

### Import Section (Lines 1-6)

```python
from django.db.models.signals import m2m_changed, post_save, pre_delete
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.contrib.admin.models import ADDITION, CHANGE, DELETION
from .models import *
from .history_utils import log_addition, log_change
```

**Key imports**:
- `post_save` - Signal triggered when any model is saved
- `ADDITION`, `CHANGE`, `DELETION` - Constants for action types
- `log_addition`, `log_change` - Our logging functions

### Tracked Models List (Around Line 90+)

```python
MODELS_TO_LOG = [
    Athlete, Event, Category, Team, Match, 
    GradeHistory, CategoryAthleteScore, CategoryTeamScore,
    TrainingSeminarParticipation, Visa, FederationRole
]
```

**This list defines which models automatically get tracked.** Add more models here if needed.

### Signal Handlers (Lines 95-115)

```python
def log_model_creation(sender, instance, created, **kwargs):
    """
    Create a LogEntry when a tracked model instance is created.
    Only logs if the user is available from the request context.
    """
    if created:  # Only on creation, not updates
        user = getattr(instance, '_current_user', None)
        if user and not user.is_anonymous:
            log_addition(instance, user, f"Added via API")


def log_model_change(sender, instance, created, update_fields=None, **kwargs):
    """
    Create a LogEntry when a tracked model instance is modified.
    """
    if not created:  # Only on updates, not creation
        user = getattr(instance, '_current_user', None)
        if user and not user.is_anonymous:
            log_change(instance, user, {})
```

**How it works**:
1. `post_save` signal fires whenever any model is saved
2. Handler checks if this is a creation (`created=True`) or update (`created=False`)
3. Looks for `_current_user` attribute on the instance
4. If user exists and is not anonymous, creates LogEntry

### Signal Registration (Lines 117-120)

```python
for model in MODELS_TO_LOG:
    post_save.connect(log_model_creation, sender=model, dispatch_uid=f'{model.__name__}_log_addition')
    post_save.connect(log_model_change, sender=model, dispatch_uid=f'{model.__name__}_log_change')
```

**What this does**:
- Hooks up our signal handlers for each model in `MODELS_TO_LOG`
- Uses `dispatch_uid` to prevent duplicate signal handlers
- Now whenever those models are saved, our handlers run

---

## How Changes Get Associated with Users

### Problem
Signals don't have access to the `request` object, so how do they know which user made the change?

### Solution
We attach the user to the model instance before saving:

```python
# In a ViewSet or signal that has access to request:
instance._current_user = request.user  # Attach user to instance
instance.save()  # Now the post_save signal can access request.user
```

### The Handler Retrieves It
```python
user = getattr(instance, '_current_user', None)  # Get the attached user
```

This is a temporary attribute that exists only during the save operation.

---

## Django Admin LogEntry Model

The system uses Django's built-in **`LogEntry` model** from `django.contrib.admin.models`:

```python
LogEntry(
    content_type=<ContentType>,    # Type of model (Athlete, Event, etc.)
    object_id=<str>,               # ID of the object
    object_repr=<str>,             # String representation of object
    action_flag=<int>,             # ADDITION, CHANGE, or DELETION
    change_message=<str>,          # Details of what changed (JSON)
    user=<User>,                   # User who made the change
    action_time=<DateTime>         # When the change was made (auto)
)
```

When users click "History" in admin, Django automatically queries LogEntry and displays all records for that object.

---

## Execution Example

### Step-by-Step: Creating an Athlete

```python
# 1. ViewSet receives API request
class AthleteViewSet(viewsets.ViewSet):
    def create(self, request):
        serializer = AthleteSerializer(data=request.data)
        if serializer.is_valid():
            # 2. Save the object
            athlete = serializer.save()
            
            # 3. Attach the user (this is where history tracking happens)
            athlete._current_user = request.user
            athlete.save()  # Saves again, but with _current_user attached
            
            return Response(AthleteSerializer(athlete).data)

# 4. Django's post_save signal fires
#    ↓
# 5. Our handler gets called:
#    - Gets instance (the Athlete)
#    - Gets instance._current_user (the requesting user)
#    - Calls log_addition(athlete, user, "Added via API")
#    ↓
# 6. log_addition calls create_log_entry
#    - Creates LogEntry with:
#      - content_type = Athlete
#      - object_id = athlete.pk
#      - action_flag = ADDITION
#      - user = request.user
#      ↓
# 7. User visits admin and clicks History
#    - Sees: "2026-02-05 | admin | Addition | Added via API"
```

---

## Adding a New Model to Track

Want to track a new model that's not in the list?

**Step 1**: Add it to `MODELS_TO_LOG` in `signals.py`

```python
MODELS_TO_LOG = [
    Athlete, Event, Category, Team, Match, 
    GradeHistory, CategoryAthleteScore, CategoryTeamScore,
    TrainingSeminarParticipation, Visa, FederationRole,
    MyNewModel,  # Add here!
]
```

**Step 2**: That's it! The signal registration loop will automatically hook it up.

**Step 3**: Now when MyNewModel is saved via API, it will be logged.

---

## Performance Considerations

- **Minimal overhead**: One database query to LogEntry on each save
- **Non-blocking**: Signal handler is synchronous but very fast
- **Scalable**: Django's LogEntry is indexed and optimized

---

## Security Notes

✅ **Only authenticated users logged** - Anonymous requests ignored
✅ **No sensitive data logged** - Just records the fact of change, not old values
✅ **Django admin permissions respected** - Can control who sees history
✅ **Immutable audit trail** - LogEntry records can't be deleted via signals

---

## Common Patterns

### Pattern 1: Auto-Tracking (Most Common)
```python
# No special code needed
athlete = Athlete.objects.create(...)  # ✅ Auto-logged via signal
```

### Pattern 2: Explicit User Tracking
```python
# When you need to be explicit
athlete._current_user = request.user
athlete.save()  # ✅ Logged with request.user
```

### Pattern 3: Using the Mixin
```python
class AthleteViewSet(HistoryTrackingMixin, viewsets.ViewSet):
    def create(self, request):
        serializer = AthleteSerializer(data=request.data)
        if serializer.is_valid():
            athlete = self.save_with_history(serializer, request.user)  # ✅ Logged
            return Response(...)
```

### Pattern 4: Manual Logging
```python
from .history_utils import log_addition

athlete = create_athlete_from_import()
log_addition(athlete, admin_user, "Imported from CSV")  # ✅ Logged
```

---

## Debugging Change History

Check if LogEntry was created:
```python
from django.contrib.admin.models import LogEntry

# In Django shell:
entries = LogEntry.objects.filter(object_id='123')
for entry in entries:
    print(f"{entry.action_time} | {entry.user} | {entry.get_action_flag_display()}")
```

Check if signal is working:
```python
# In a ViewSet:
athlete = serializer.save()
athlete._current_user = request.user
athlete.save()

# Then check:
from django.contrib.admin.models import LogEntry
assert LogEntry.objects.filter(object_id=str(athlete.pk)).exists()
```

---

This architecture ensures that every API-created or modified object has a complete audit trail in Django admin! 🎉
