# api/mixins.py
"""
Model mixins for sync, versioning, and soft delete functionality
"""
from django.db import models
from django.utils import timezone
import hashlib
import json


class TimestampMixin(models.Model):
    """Add created and modified timestamps to all models"""
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    
    class Meta:
        abstract = True


class SyncMixin(models.Model):
    """
    Enable offline sync with conflict detection
    Tracks version numbers and sync state
    """
    # Version tracking for optimistic locking
    version = models.IntegerField(default=1, help_text='Incremented on each update for conflict detection')
    
    # Sync metadata
    sync_hash = models.CharField(max_length=64, blank=True, editable=False, db_index=True,
                                 help_text='Hash of critical fields for quick change detection')
    last_synced_at = models.DateTimeField(null=True, blank=True, 
                                          help_text='Last time this record was synced to offline clients')
    is_synced = models.BooleanField(default=False, db_index=True,
                                    help_text='Whether this record has been synced to all clients')
    
    # Offline creation tracking
    created_offline = models.BooleanField(default=False,
                                         help_text='Whether this record was created offline')
    temp_id = models.CharField(max_length=100, blank=True, null=True, db_index=True,
                               help_text='Temporary ID from offline client before server assignment')
    
    class Meta:
        abstract = True
    
    def generate_sync_hash(self):
        """Generate hash of sync-critical fields for quick change detection"""
        # Override in subclass to include specific fields
        sync_fields = self.get_sync_fields()
        sync_data = json.dumps(sync_fields, sort_keys=True, default=str)
        return hashlib.sha256(sync_data.encode()).hexdigest()
    
    def get_sync_fields(self):
        """
        Return dict of fields to include in sync hash.
        Override in subclass to specify which fields matter for sync.
        """
        # Default: include all non-meta fields
        data = {}
        for field in self._meta.fields:
            if field.name not in ['id', 'version', 'sync_hash', 'last_synced_at', 'is_synced', 
                                   'created_at', 'updated_at', 'created_offline', 'temp_id']:
                value = getattr(self, field.name, None)
                if isinstance(value, models.Model):
                    data[field.name] = value.pk if value else None
                else:
                    data[field.name] = value
        return data
    
    def save(self, *args, **kwargs):
        # Increment version on update (not on create)
        if self.pk:
            self.version = models.F('version') + 1
        
        # Generate sync hash before save
        self.sync_hash = self.generate_sync_hash()
        
        super().save(*args, **kwargs)
        
        # Refresh from DB to get the new version value
        if self.pk:
            self.refresh_from_db(fields=['version'])
    
    def mark_synced(self):
        """Mark record as synced to all clients"""
        self.is_synced = True
        self.last_synced_at = timezone.now()
        self.save(update_fields=['is_synced', 'last_synced_at'])


class SoftDeleteMixin(models.Model):
    """
    Enable soft delete (mark as deleted instead of removing from database)
    Useful for sync and audit trails
    """
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        'User', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='%(class)s_deletions'
    )
    
    class Meta:
        abstract = True
    
    def delete(self, hard=False, user=None, *args, **kwargs):
        """
        Soft delete by default. Pass hard=True for permanent deletion.
        """
        if hard:
            super().delete(*args, **kwargs)
        else:
            self.is_deleted = True
            self.deleted_at = timezone.now()
            if user:
                self.deleted_by = user
            self.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])
    
    def restore(self):
        """Restore a soft-deleted record"""
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])


class ExcelSyncMixin(models.Model):
    """
    Track Excel import/export metadata
    """
    excel_row_number = models.IntegerField(null=True, blank=True, db_index=True,
                                          help_text='Row number in Excel file (for error reporting)')
    excel_imported_at = models.DateTimeField(null=True, blank=True,
                                            help_text='When this record was imported from Excel')
    excel_imported_by = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_excel_imports'
    )
    excel_export_hash = models.CharField(max_length=64, blank=True,
                                        help_text='Hash of last exported data to detect Excel modifications')
    
    class Meta:
        abstract = True
    
    def mark_excel_import(self, row_number, user=None):
        """Mark record as imported from Excel"""
        self.excel_row_number = row_number
        self.excel_imported_at = timezone.now()
        if user:
            self.excel_imported_by = user
        self.save(update_fields=['excel_row_number', 'excel_imported_at', 'excel_imported_by'])


class AuditMixin(models.Model):
    """
    Track who created and last modified a record
    """
    created_by = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_created',
        help_text='User who created this record'
    )
    modified_by = models.ForeignKey(
        'User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='%(class)s_modified',
        help_text='User who last modified this record'
    )
    
    class Meta:
        abstract = True
