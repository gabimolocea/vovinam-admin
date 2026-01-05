# api/managers.py
"""
Custom model managers for optimized queries and sync operations
"""
from django.db import models
from django.db.models import Prefetch, Q, F


class SyncAwareManager(models.Manager):
    """Manager that handles soft delete and sync state"""
    
    def get_queryset(self):
        """Exclude soft-deleted records by default"""
        return super().get_queryset().filter(is_deleted=False)
    
    def with_deleted(self):
        """Include soft-deleted records"""
        return super().get_queryset()
    
    def deleted_only(self):
        """Only soft-deleted records"""
        return super().get_queryset().filter(is_deleted=True)
    
    def needs_sync(self):
        """Records that haven't been synced yet"""
        return self.get_queryset().filter(is_synced=False)
    
    def synced_since(self, timestamp):
        """Records synced after a given timestamp"""
        return self.get_queryset().filter(
            last_synced_at__gt=timestamp,
            is_synced=True
        )
    
    def modified_since(self, timestamp):
        """Records modified after a given timestamp"""
        return self.get_queryset().filter(updated_at__gt=timestamp)


class AthleteManager(SyncAwareManager):
    """Optimized queries for Athlete model"""
    
    def with_full_profile(self):
        """Fetch athlete with all related data in one query"""
        return self.select_related(
            'user',
            'club',
            'club__city',
            'city',
            'current_grade',
            'federation_role',
            'title',
            'reviewed_by',
            'approved_by'
        ).prefetch_related(
            'grade_history__grade',
            'grade_history__examiner_1',
            'grade_history__examiner_2',
            'visas',
            'seminar_participations__event',
            'coached_clubs'
        )
    
    def approved(self):
        """Only approved athletes"""
        return self.filter(status='approved')
    
    def pending(self):
        """Athletes pending approval"""
        return self.filter(status='pending')
    
    def by_club(self, club_id):
        """Athletes in a specific club"""
        return self.filter(club_id=club_id)
    
    def coaches(self):
        """Athletes who are coaches"""
        return self.filter(is_coach=True)
    
    def referees(self):
        """Athletes who are referees"""
        return self.filter(is_referee=True)


class CompetitionManager(SyncAwareManager):
    """Optimized queries for Competition model"""
    
    def with_categories(self):
        """Fetch competition with all categories"""
        return self.select_related('event').prefetch_related(
            'categories',
            'categories__athletes',
            'categories__teams'
        )
    
    def upcoming(self):
        """Competitions in the future"""
        from django.utils import timezone
        return self.filter(event__start_date__gte=timezone.now().date())
    
    def past(self):
        """Competitions in the past"""
        from django.utils import timezone
        return self.filter(event__end_date__lt=timezone.now().date())


class CategoryManager(SyncAwareManager):
    """Optimized queries for Category model"""
    
    def with_scores(self):
        """Fetch category with all scores and participants"""
        return self.select_related('competition', 'competition__event').prefetch_related(
            Prefetch('athlete_scores', queryset=models.Model.objects.select_related('athlete', 'submitted_by')),
            'athletes__athlete',
            'teams__team__members__athlete',
            'matches__red_corner',
            'matches__blue_corner',
            'matches__referees'
        )


class GradeHistoryManager(SyncAwareManager):
    """Optimized queries for GradeHistory"""
    
    def approved(self):
        """Only approved grade changes"""
        return self.filter(status='approved')
    
    def pending(self):
        """Pending grade changes"""
        return self.filter(status='pending')
    
    def for_athlete(self, athlete_id):
        """Grade history for specific athlete"""
        return self.filter(athlete_id=athlete_id).select_related(
            'athlete', 'grade', 'examiner_1', 'examiner_2', 'seminar', 'reviewed_by'
        ).order_by('-obtained_date')
