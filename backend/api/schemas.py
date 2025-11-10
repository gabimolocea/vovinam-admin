REFEREE_POINT_EVENT_METADATA_SCHEMA = {
    "$schema": "http://json-schema.org/draft/2020-12/schema#",
    "type": "object",
    "properties": {
        "round": {"type": "integer", "minimum": 1},
        "central": {"type": "boolean"},
        "reason": {"type": "string"},
        "origin": {"type": "string"}
    },
    "additionalProperties": False
}
