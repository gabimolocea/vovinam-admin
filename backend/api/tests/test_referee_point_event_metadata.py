from django.test import TestCase
from django.core.exceptions import ValidationError
from api.validators import validate_referee_point_event_metadata

class MetadataValidatorTests(TestCase):
    def test_valid_metadata_passes(self):
        valid = {'round': 2, 'central': True, 'reason': 'excessive contact'}
        # should not raise
        validate_referee_point_event_metadata(valid)

    def test_synced_metadata_ids_pass(self):
        valid = {
            'origin': 'match_event_sync',
            'match_event_id': 12,
            'match_referee_score_id': 34,
            'round': 1,
        }
        validate_referee_point_event_metadata(valid)

    def test_invalid_round_fails(self):
        invalid = {'round': 0, 'central': True}
        with self.assertRaises(ValidationError):
            validate_referee_point_event_metadata(invalid)

    def test_invalid_types_fail(self):
        invalid = {'round': 'two', 'central': 'yes'}
        with self.assertRaises(ValidationError):
            validate_referee_point_event_metadata(invalid)
