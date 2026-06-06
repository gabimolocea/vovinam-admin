from django.core.exceptions import ValidationError
from .schemas import REFEREE_POINT_EVENT_METADATA_SCHEMA

try:
    import jsonschema
    from jsonschema import ValidationError as JSONSchemaValidationError
except Exception:
    jsonschema = None
    JSONSchemaValidationError = Exception


def validate_referee_point_event_metadata(data):
    """Validate the metadata JSON for a RefereePointEvent.

    Raises django.core.exceptions.ValidationError on schema mismatch.
    """
    if data is None:
        return

    # Ensure it's a mapping/object
    if not isinstance(data, dict):
        raise ValidationError('metadata must be a JSON object')

    if jsonschema is None:
        # Fallback lightweight checks when jsonschema isn't installed.
        # Best-effort validation of common keys.
        rd = data.get('round')
        if rd is not None:
            if not isinstance(rd, int) or rd < 1:
                raise ValidationError("'round' must be an integer >= 1")
        central = data.get('central')
        if central is not None and not isinstance(central, bool):
            raise ValidationError("'central' must be a boolean")
        reason = data.get('reason')
        if reason is not None and not isinstance(reason, str):
            raise ValidationError("'reason' must be a string")
        match_event_id = data.get('match_event_id')
        if match_event_id is not None:
            if not isinstance(match_event_id, int) or match_event_id < 1:
                raise ValidationError("'match_event_id' must be an integer >= 1")
        match_referee_score_id = data.get('match_referee_score_id')
        if match_referee_score_id is not None:
            if not isinstance(match_referee_score_id, int) or match_referee_score_id < 1:
                raise ValidationError("'match_referee_score_id' must be an integer >= 1")
        return

    try:
        jsonschema.validate(instance=data, schema=REFEREE_POINT_EVENT_METADATA_SCHEMA)
    except JSONSchemaValidationError as e:
        # Convert jsonschema error into Django ValidationError with a concise message
        raise ValidationError(f"metadata schema error: {e.message}")
