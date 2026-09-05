from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ['id', 'name', 'rank_order', 'grade_type', 'image']


class GradeHistorySerializer(serializers.ModelSerializer):
    athlete_name = serializers.CharField(source='athlete.first_name', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    # technical_director removed; use examiner_1/examiner_2 instead
    examiner_1 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_1_name = serializers.CharField(source='examiner_1.__str__', read_only=True)
    examiner_2 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_2_name = serializers.CharField(source='examiner_2.__str__', read_only=True)

    # Event linked to the grade exam (optional)
    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), allow_null=True, required=False)
    event_name = serializers.CharField(source='event.__str__', read_only=True)

    class Meta:
        model = GradeHistory
        fields = [
            'id', 'athlete', 'athlete_name', 'grade', 'grade_name', 'obtained_date',
            'level', 'event', 'event_name', 'examiner_1', 'examiner_1_name', 'examiner_2', 'examiner_2_name',
        ]
        extra_kwargs = {
            'obtained_date': {'required': False},
        }

    # get_technical_director removed


# Enhanced GradeHistory serializer with approval workflow
class GradeHistorySubmissionSerializer(serializers.ModelSerializer):
    """Serializer for athlete grade history submissions with approval workflow"""
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all(), required=False)
    athlete_name = serializers.CharField(source='athlete.__str__', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    
    # legacy technical_director removed; frontend should post examiner_1/examiner_2

    examiner_1 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_1_name = serializers.SerializerMethodField()
    examiner_2 = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.filter(is_coach=True), allow_null=True, required=False)
    examiner_2_name = serializers.SerializerMethodField()

    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), allow_null=True, required=False)
    event_name = serializers.SerializerMethodField()

    class Meta:
        model = GradeHistory
        fields = [
            'id', 'athlete', 'athlete_name', 'grade', 'grade_name', 'obtained_date',
            'level', 'event', 'event_name', 'examiner_1', 'examiner_1_name', 'examiner_2', 'examiner_2_name', 'submitted_by_athlete', 'certificate_image', 'result_document', 'notes',
            'status', 'submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name', 'admin_notes'
        ]
        read_only_fields = ['submitted_date', 'reviewed_date', 'reviewed_by', 'reviewed_by_name']

    def get_reviewed_by_name(self, obj):
        return str(obj.reviewed_by) if obj.reviewed_by else None

    def get_examiner_1_name(self, obj):
        return str(obj.examiner_1) if obj.examiner_1 else None

    def get_examiner_2_name(self, obj):
        return str(obj.examiner_2) if obj.examiner_2 else None

    def get_event_name(self, obj):
        return str(obj.event) if obj.event else None

    def validate(self, attrs):
        request = self.context.get('request')
        actor_athlete = getattr(request.user, 'athlete', None) if request else None
        target_athlete = attrs.get('athlete') or getattr(self.instance, 'athlete', None)
        event = attrs.get('event') or getattr(self.instance, 'event', None)

        if event and getattr(event, 'event_type', None) != 'examination':
            raise serializers.ValidationError({'event': 'Grade history poate fi completat doar pentru evenimente de tip examen.'})

        if request and request.user and getattr(request.user, 'is_admin', False):
            if not target_athlete:
                raise serializers.ValidationError({'athlete': 'Acest câmp este obligatoriu.'})
            return attrs

        if not actor_athlete:
            raise serializers.ValidationError('Utilizatorul trebuie să aibă profil de sportiv sau antrenor.')

        if actor_athlete.is_coach:
            if not target_athlete:
                raise serializers.ValidationError({'athlete': 'Selectează sportivul pentru fișa de examen.'})
            if actor_athlete.club_id != target_athlete.club_id:
                raise serializers.ValidationError({'athlete': 'Poți completa fișa doar pentru sportivi din clubul tău.'})
        else:
            attrs['athlete'] = actor_athlete

        return attrs
    
    def create(self, validated_data):
        """Allow athlete self-submission and coach submission for same-club athletes."""
        request = self.context.get('request')
        if not request:
            raise serializers.ValidationError('Cerere invalidă.')

        if request.user and getattr(request.user, 'is_admin', False):
            validated_data.setdefault('status', 'approved')
            validated_data.setdefault('submitted_by_athlete', False)
            return super().create(validated_data)

        actor_athlete = getattr(request.user, 'athlete', None)
        if actor_athlete and not getattr(request.user, 'is_admin', False):
            validated_data['status'] = 'pending'
            validated_data['submitted_by_athlete'] = not actor_athlete.is_coach

        existing = GradeHistory.objects.filter(athlete=validated_data['athlete'], grade=validated_data.get('grade'))
        if existing.exists():
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError({'grade': ['An entry for this athlete and grade already exists.']})

        grade_history = super().create(validated_data)

        try:
            from django.apps import apps
            GradeHistoryActivity = apps.get_model('api', 'GradeHistoryActivity')
            if GradeHistoryActivity is not None:
                GradeHistoryActivity.objects.create(
                    grade_history=grade_history,
                    action='submitted',
                    performed_by=request.user,
                    notes=f'Grade submission for {grade_history.grade.name}'
                )
        except Exception:
            pass

        from ..notification_utils import create_grade_submitted_notification
        try:
            create_grade_submitted_notification(grade_history)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.exception('Failed to create grade submitted notification: %s', e)

        return grade_history


class GradeHistoryApprovalSerializer(serializers.Serializer):
    """Serializer for admin approval/rejection actions on grade history"""
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)

