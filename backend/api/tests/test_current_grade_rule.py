"""Regression tests for the canonical current_grade rule.

Athlete.current_grade must always equal the highest-ranked *approved*
GradeHistory entry for that athlete. Two previously-conflicting mechanisms
(a post_save signal that set current_grade to whatever GradeHistory row was
just saved, and an admin-only helper that picked the highest rank_order
across ALL statuses) neither of which checked status='approved'. This meant
a still-pending or rejected grade could silently overwrite an athlete's
current grade. Both now delegate to Athlete.update_current_grade(), which
only considers approved entries.
"""
from django.test import TestCase

from api.models import Athlete, Grade, GradeHistory


class CurrentGradeCanonicalRuleTests(TestCase):
    def setUp(self):
        self.athlete = Athlete.objects.create(first_name='Grade', last_name='Test')
        self.low_grade = Grade.objects.create(name='Yellow Belt', rank_order=1)
        self.high_grade = Grade.objects.create(name='Black Belt', rank_order=10)

    def test_pending_grade_history_does_not_overwrite_current_grade(self):
        """Creating a pending (self-submitted) GradeHistory must not change current_grade."""
        GradeHistory.objects.create(
            athlete=self.athlete,
            grade=self.high_grade,
            submitted_by_athlete=True,  # forces status='pending' on create
        )
        self.athlete.refresh_from_db()
        self.assertIsNone(self.athlete.current_grade)

    def test_rejected_grade_history_does_not_overwrite_current_grade(self):
        """Rejecting a GradeHistory entry must not make it the current_grade."""
        gh = GradeHistory.objects.create(
            athlete=self.athlete,
            grade=self.high_grade,
            submitted_by_athlete=True,
        )
        gh.reject(None, notes='not valid')
        self.athlete.refresh_from_db()
        self.assertIsNone(self.athlete.current_grade)

    def test_approved_grade_history_sets_current_grade(self):
        """An approved GradeHistory entry becomes current_grade."""
        GradeHistory.objects.create(athlete=self.athlete, grade=self.low_grade)  # defaults to approved
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.current_grade, self.low_grade)

    def test_current_grade_is_highest_ranked_approved_entry(self):
        """When multiple approved entries exist, the highest rank_order wins,
        even if it wasn't the most recently saved row."""
        GradeHistory.objects.create(athlete=self.athlete, grade=self.high_grade)
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.current_grade, self.high_grade)

        # Saving an older/lower-rank approved entry afterwards must not
        # downgrade current_grade (this was the original signal bug).
        GradeHistory.objects.create(athlete=self.athlete, grade=self.low_grade)
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.current_grade, self.high_grade)

    def test_deleting_highest_approved_grade_recalculates_current_grade(self):
        """Deleting the top-ranked approved GradeHistory must fall back to the
        next highest approved entry, not leave a stale current_grade."""
        low = GradeHistory.objects.create(athlete=self.athlete, grade=self.low_grade)
        GradeHistory.objects.create(athlete=self.athlete, grade=self.high_grade)
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.current_grade, self.high_grade)

        GradeHistory.objects.get(athlete=self.athlete, grade=self.high_grade).delete()
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.current_grade, self.low_grade)
