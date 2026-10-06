"""
Utility functions for tracking change history in Django admin.
"""
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
import json

# Cat incape in LogEntry.object_repr. Django o declara varchar(200).
LUNGIME_REPR = 200


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
        # `atomic` nu e de prisos, e tocmai miezul.
        #
        # `except` de mai jos prinde exceptia Python, dar nu si starea bazei:
        # in PostgreSQL, o comanda cazuta ABANDONEAZA tranzacția, iar tot ce s-a
        # facut in ea se pierde la iesire. Iar stergerea unui obiect ruleaza
        # intr-un bloc atomic, impreuna cu semnalele ei - deci un jurnal care nu
        # intra anula tocmai stergerea, in tacere: endpointul raspundea 204 pe
        # ceva ce nu se intamplase. Punctul de salvare de aici tine caderea
        # inchisa inauntru.
        with transaction.atomic():
            return LogEntry.objects.create(
                content_type=content_type,
                object_id=str(obj.pk),
                # Taiat, nu lasat sa cada: numele unui meci include categoria,
                # grupa SI titlul competitiei, si trece de 200 de caractere la
                # orice competitie cu nume lung.
                object_repr=str(obj)[:LUNGIME_REPR],
                action_flag=action_type,
                change_message=change_message,
                user=user,
            )
    except Exception as e:
        # Jurnalul e util, dar nu e motiv sa pice actiunea pe care o descrie.
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
