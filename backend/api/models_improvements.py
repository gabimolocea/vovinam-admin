# Model improvements to be applied to api/models.py

# 1. Add this mixin at the top of the file (after imports, before User model)

class ApprovalWorkflowMixin(models.Model):
    """Mixin for approval workflow functionality - reduces code duplication"""
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_%(class)s')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')
    
    class Meta:
        abstract = True
    
    def approve(self, admin_user, notes=''):
        """Approve the submission"""
        from django.utils import timezone
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()
        
    def reject(self, admin_user, notes=''):
        """Reject the submission"""
        from django.utils import timezone
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the submission"""
        from django.utils import timezone
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        if notes:
            self.admin_notes = notes
        self.save()


# 2. Add Meta class to Athlete model (after __str__ method)

    class Meta:
        indexes = [
            models.Index(fields=['status', '-submitted_date']),
            models.Index(fields=['club', 'status']),
            models.Index(fields=['current_grade']),
            models.Index(fields=['is_coach']),
            models.Index(fields=['is_referee']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(expiration_date__gt=models.F('registered_date')) | models.Q(expiration_date__isnull=True),
                name='athlete_expiration_after_registration'
            ),
        ]


# 3. Fix GradeHistory.obtained_date field - Change from:
    obtained_date = models.DateField(auto_now_add=True)
# To:
    obtained_date = models.DateField(default=date.today)


# 4. Remove buggy seminar code from GradeHistory.save() - Delete this block:
        # Ensure the seminar M2M stays in sync
        try:
            if self.seminar and self.athlete:
                self.seminar.athletes.add(self.athlete)
        except Exception:
            pass


# 5. Add Meta class to GradeHistory (after __str__ method)

    class Meta:
        indexes = [
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['status', '-submitted_date']),
            models.Index(fields=['athlete', '-obtained_date']),
        ]


# 6. Update Category.competition and Category.event cascade behavior - Change from:
    competition = models.ForeignKey('Competition', on_delete=models.CASCADE, ...)
    event = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, ...)
# To:
    competition = models.ForeignKey('Competition', on_delete=models.PROTECT, ...)
    event = models.ForeignKey('landing.Event', on_delete=models.PROTECT, ...)


# 7. Add validation to Category.clean() - Add at the beginning:

    def clean(self):
        super().clean()
        
        # Validate competition/event exclusivity
        if self.competition and self.event:
            raise ValidationError(
                "Category cannot have both competition and event. Use event for new records."
            )
        if not self.competition and not self.event:
            raise ValidationError(
                "Category must have either competition or event."
            )
        
        # ... rest of existing validation


# 8. Add Meta class to CategoryAthleteScore (in class Meta, after unique_together)

    class Meta:
        unique_together = ('category', 'athlete', 'referee')
        indexes = [
            models.Index(fields=['category', 'status']),
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['status', '-submitted_date']),
            models.Index(fields=['type', 'status']),
        ]


# 9. Remove team member auto-add from CategoryAthleteScore.save() - Delete this block:
        # For team results, ensure the submitting athlete is included in team members
        if self.type == 'teams' and self.athlete and not self.team_members.filter(pk=self.athlete.pk).exists():
            self.team_members.add(self.athlete)


# 10. Add signal to ensure team member - Add this at the end of the file:

@receiver(post_save, sender=CategoryAthleteScore)
def ensure_team_submitter_included(sender, instance, created, **kwargs):
    """Ensure the submitting athlete is included in team members"""
    if instance.type == 'teams' and instance.athlete:
        if not instance.team_members.filter(pk=instance.athlete.pk).exists():
            instance.team_members.add(instance.athlete)


# 11. Add Meta constraints to Competition

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_date__gte=models.F('start_date')) | models.Q(end_date__isnull=True),
                name='competition_end_after_start'
            ),
        ]


# 12. Update Visa Meta class

    class Meta:
        verbose_name = _('Visa')
        verbose_name_plural = _('Visas')
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(visa_type='medical') |
                    models.Q(visa_type='annual')
                ),
                name='visa_valid_type'
            ),
        ]
