"""
Utility functions for tracking change history in Django admin.
"""
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.contenttypes.models import ContentType
import json


def create_log_entry(obj, action_type, user=None, change_message=""):
    """
    Create a LogEntry record for an object change.
    
    Args:
        obj: The model instance
        action_type: ADDITION, CHANGE, or DELETION
        user: The User object making the change (optional)
        change_message: Description of the change
    
    Returns:
        The created LogEntry instance
    """
    if not user or user.is_anonymous:
        # Don't create log entries for anonymous users
        return None
    
    content_type = ContentType.objects.get_for_model(obj)
    
    try:
        log_entry = LogEntry.objects.create(
            content_type=content_type,
            object_id=str(obj.pk),
            object_repr=str(obj),
            action_flag=action_type,
            change_message=change_message,
            user=user
        )
        return log_entry
    except Exception as e:
        # Silently fail if we can't create the log entry
        print(f"Error creating log entry: {e}")
        return None


def log_addition(obj, user=None, message="Added via API"):
    """Log that an object was added."""
    return create_log_entry(obj, ADDITION, user, message)


def log_change(obj, user=None, changes=None):
    """
    Log that an object was changed.
    
    Args:
        obj: The model instance
        user: The User object making the change
        changes: Dict of changed fields like {"field_name": ["old_value", "new_value"]}
    """
    if changes:
        change_message = json.dumps([{"changed": {"fields": list(changes.keys())}}])
    else:
        change_message = "Changed via API"
    
    return create_log_entry(obj, CHANGE, user, change_message)


def log_deletion(obj, user=None, message="Deleted via API"):
    """Log that an object was deleted."""
    return create_log_entry(obj, DELETION, user, message)


def create_log_entry_for_field_change(obj, user, field_name, old_value, new_value):
    """
    Create a log entry for a specific field change.
    
    Args:
        obj: The model instance
        user: The User object making the change
        field_name: Name of the field that changed
        old_value: The old value
        new_value: The new value
    """
    if old_value == new_value:
        return None
    
    change_message = f"Changed {field_name} from {old_value} to {new_value}"
    return log_change(obj, user, {field_name: [str(old_value), str(new_value)]})


class HistoryTrackingMixin:
    """
    Mixin for ViewSets to automatically track user changes in admin history.
    
    When saving model instances in create() or update() methods, attach the
    current user to the instance so signals can log the change.
    
    Usage:
        class MyViewSet(HistoryTrackingMixin, viewsets.ViewSet):
            def create(self, request):
                serializer = MySerializer(data=request.data)
                if serializer.is_valid():
                    instance = self.save_with_history(serializer, request.user)
                    return Response(MySerializer(instance).data, status=status.HTTP_201_CREATED)
    """
    
    def save_with_history(self, serializer, user):
        """
        Save serializer and attach the current user for history tracking.
        
        Args:
            serializer: The DRF serializer instance
            user: The User object making the change
            
        Returns:
            The saved instance
        """
        instance = serializer.save()
        instance._current_user = user
        instance.save()
        return instance
