from rest_framework import serializers
from django.db.models import Q
from ..models import *
from ..permissions import can_edit_object, IsClubCoachOrAdmin
from landing.models import Event


def _get_prefetched_relation(instance, relation_name):
    return getattr(instance, '_prefetched_objects_cache', {}).get(relation_name)


def _safe_file_url(file_field):
    try:
        return file_field.url if file_field else None
    except Exception:
        return None


def _safe_related(instance, attr_name):
    try:
        return getattr(instance, attr_name, None)
    except Exception:
        return None


def _safe_scalar(value):
    if value is None:
        return None
    try:
        return value.isoformat() if hasattr(value, 'isoformat') else value
    except Exception:
        try:
            return str(value)
        except Exception:
            return None


def _person_name(person, *, last_first=False, default=None):
    if person is None:
        return default

    if hasattr(person, 'first_name') or hasattr(person, 'last_name'):
        first_name = str(getattr(person, 'first_name', '') or '').strip()
        last_name = str(getattr(person, 'last_name', '') or '').strip()
        if last_first:
            parts = [last_name, first_name]
        else:
            parts = [first_name, last_name]
        return ' '.join(part for part in parts if part) or default

    name = str(person).strip()
    return name or default


def _get_team_members(team):
    prefetched_members = _get_prefetched_relation(team, 'members')
    if prefetched_members is not None:
        return [member for member in prefetched_members if getattr(member, 'athlete_id', None)]
    return list(team.members.select_related('athlete__club').all())


def _get_team_athletes(team):
    return [member.athlete for member in _get_team_members(team) if getattr(member, 'athlete', None)]


def _get_team_categories(team):
    prefetched_categories = _get_prefetched_relation(team, 'categories')
    if prefetched_categories is not None:
        return list(prefetched_categories)
    return list(team.categories.all())

# ==================== MINIMAL SERIALIZERS ====================
# Used for relationships and list views (lightweight, no recursion)

class UserMinimalSerializer(serializers.ModelSerializer):
    """Minimal user data for relationships"""
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'full_name']
    
    def get_full_name(self, obj):
        return _person_name(obj)


class CityMinimalSerializer(serializers.ModelSerializer):
    """Minimal city data"""
    class Meta:
        model = City
        fields = ['id', 'name']


class ClubMinimalSerializer(serializers.ModelSerializer):
    """Minimal club data (no athletes list to prevent recursion)"""
    city = serializers.SerializerMethodField()
    
    class Meta:
        model = Club
        fields = ['id', 'name', 'slug', 'city', 'logo']

    def get_city(self, obj):
        try:
            return CityMinimalSerializer(obj.city).data if obj.city else None
        except Exception:
            return None


class GradeMinimalSerializer(serializers.ModelSerializer):
    """Minimal grade data"""
    class Meta:
        model = Grade
        fields = ['id', 'name', 'rank_order']


class AthleteMinimalSerializer(serializers.ModelSerializer):
    """Minimal athlete data for lists and relationships"""
    club = serializers.SerializerMethodField()
    current_grade = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Athlete
        fields = [
            'id', 'first_name', 'last_name', 'full_name',
            'date_of_birth',
            'club', 'current_grade', 'is_coach', 'is_referee',
            'status', 'profile_image'
        ]
    
    def get_full_name(self, obj):
        return _person_name(obj)

    def get_club(self, obj):
        try:
            return ClubMinimalSerializer(obj.club).data if obj.club else None
        except Exception:
            return None

    def get_current_grade(self, obj):
        try:
            return GradeMinimalSerializer(obj.current_grade).data if obj.current_grade else None
        except Exception:
            return None

    def to_representation(self, instance):
        try:
            representation = super().to_representation(instance)
        except Exception:
            representation = {
                'id': getattr(instance, 'id', None),
                'first_name': getattr(instance, 'first_name', ''),
                'last_name': getattr(instance, 'last_name', ''),
                'full_name': f"{getattr(instance, 'first_name', '')} {getattr(instance, 'last_name', '')}".strip(),
                'date_of_birth': _safe_scalar(getattr(instance, 'date_of_birth', None)),
                'club': self.get_club(instance),
                'current_grade': self.get_current_grade(instance),
                'is_coach': getattr(instance, 'is_coach', False),
                'is_referee': getattr(instance, 'is_referee', False),
                'status': getattr(instance, 'status', None),
            }
        representation['profile_image'] = _safe_file_url(getattr(instance, 'profile_image', None))
        return representation


class PublicAthleteSerializer(serializers.ModelSerializer):
    """Public athlete profile without private contact, identity, or workflow data."""
    club = ClubMinimalSerializer(read_only=True)
    city = CityMinimalSerializer(read_only=True)
    current_grade = GradeMinimalSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    medals = serializers.SerializerMethodField()
    international_medals = serializers.SerializerMethodField()

    class Meta:
        model = Athlete
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'gender',
            'club', 'city', 'current_grade', 'is_coach', 'is_instructor', 'is_referee',
            'referee_level', 'referee_category',
            'profile_image', 'medals', 'international_medals',
        ]

    def get_full_name(self, obj):
        return _person_name(obj)

    def get_medals(self, obj):
        try:
            return medal_counts_for_athlete(obj)
        except Exception:
            return {'gold': 0, 'silver': 0, 'bronze': 0}

    def get_international_medals(self, obj):
        """Medals from competitions the federation doesn't organize/score
        in-app (European and World championships) - entered manually by an
        admin on the Athlete record, unlike `medals` above."""
        return {
            'european': {
                'gold': obj.european_medals_gold,
                'silver': obj.european_medals_silver,
                'bronze': obj.european_medals_bronze,
            },
            'world': {
                'gold': obj.world_medals_gold,
                'silver': obj.world_medals_silver,
                'bronze': obj.world_medals_bronze,
            },
        }


class PublicAthleteDetailSerializer(PublicAthleteSerializer):
    """Full public athlete detail page - adds the tab data (results, grade
    history, seminars, visas) on top of PublicAthleteSerializer's basic
    fields, plus (reviewer-only, see _can_review) the private/administrative
    fields a coach or admin managing this athlete needs (CNP, address,
    emergency contact, etc.) - a public/anonymous viewer never sees these."""
    date_of_birth = serializers.DateField(read_only=True)
    status = serializers.SerializerMethodField()
    grade_history = serializers.SerializerMethodField()
    results = serializers.SerializerMethodField()
    seminars = serializers.SerializerMethodField()
    annual_visas = serializers.SerializerMethodField()
    medical_visas = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    pending_profile_image = serializers.SerializerMethodField()
    cnp = serializers.SerializerMethodField()
    license_series = serializers.SerializerMethodField()
    license_number = serializers.SerializerMethodField()
    license_image = serializers.SerializerMethodField()
    mobile_number = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()
    emergency_contact_name = serializers.SerializerMethodField()
    emergency_contact_phone = serializers.SerializerMethodField()
    previous_experience = serializers.SerializerMethodField()
    registered_date = serializers.SerializerMethodField()
    expiration_date = serializers.SerializerMethodField()
    nationality = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta(PublicAthleteSerializer.Meta):
        fields = PublicAthleteSerializer.Meta.fields + [
            'date_of_birth', 'status', 'grade_history', 'results', 'seminars', 'annual_visas', 'medical_visas', 'can_edit',
            'profile_image_status', 'pending_profile_image', 'profile_image_admin_notes',
            'cnp', 'license_series', 'license_number', 'license_image', 'mobile_number', 'address', 'emergency_contact_name', 'emergency_contact_phone',
            'previous_experience', 'registered_date', 'expiration_date', 'nationality', 'email',
        ]

    def get_can_edit(self, obj):
        return can_edit_object(self.context.get('request'), obj, IsClubCoachOrAdmin)

    def _reviewer_only(self, obj, value):
        return value if self._can_review(obj) else None

    def get_email(self, obj):
        return self._reviewer_only(obj, obj.user.email if obj.user_id else None)

    def get_cnp(self, obj):
        return self._reviewer_only(obj, obj.cnp)

    def get_license_series(self, obj):
        return self._reviewer_only(obj, obj.license_series)

    def get_license_number(self, obj):
        return self._reviewer_only(obj, obj.license_number)

    def get_license_image(self, obj):
        return self._reviewer_only(obj, _safe_file_url(obj.license_image))

    def get_mobile_number(self, obj):
        return self._reviewer_only(obj, obj.mobile_number)

    def get_address(self, obj):
        return self._reviewer_only(obj, obj.address)

    def get_emergency_contact_name(self, obj):
        return self._reviewer_only(obj, obj.emergency_contact_name)

    def get_emergency_contact_phone(self, obj):
        return self._reviewer_only(obj, obj.emergency_contact_phone)

    def get_nationality(self, obj):
        return self._reviewer_only(obj, obj.nationality)

    def get_previous_experience(self, obj):
        return self._reviewer_only(obj, obj.previous_experience)

    def get_registered_date(self, obj):
        return self._reviewer_only(obj, _safe_scalar(obj.registered_date))

    def get_expiration_date(self, obj):
        return self._reviewer_only(obj, _safe_scalar(obj.expiration_date))

    def _can_review(self, obj):
        # Approval-workflow data (status/admin_notes/certificate images,
        # non-approved entries) is hidden from the public, but visible to
        # whoever is authorized to review this athlete's profile: the
        # athlete themself, their club coach, or an admin - the same set
        # `can_edit` already uses, since reviewing and editing share the
        # same authorization.
        request = self.context.get('request')
        is_own_profile = bool(request and request.user and request.user.is_authenticated and obj.user_id == request.user.id)
        return is_own_profile or self.get_can_edit(obj)

    def get_status(self, obj):
        # Approval status is workflow-only data, not public - only someone
        # authorized to review this profile sees it (used by the "this is a
        # preview of your public profile" banner on /cont/profil, and by the
        # reviewer-only approve/reject controls on /sportivi/:id).
        return obj.status if self._can_review(obj) else None

    def get_pending_profile_image(self, obj):
        return _safe_file_url(getattr(obj, 'pending_profile_image', None))

    def get_grade_history(self, obj):
        can_review = self._can_review(obj)
        status_filter = {} if can_review else {'status': 'approved'}
        entries = obj.grade_history.filter(**status_filter).select_related('grade', 'event', 'examiner_1', 'examiner_2').order_by('-obtained_date')
        return [
            {
                'id': entry.id,
                'grade': GradeMinimalSerializer(entry.grade).data if entry.grade else None,
                'obtained_date': _safe_scalar(entry.obtained_date),
                'event': entry.event.title if entry.event else None,
                'status': entry.status if can_review else None,
                'admin_notes': entry.admin_notes if can_review else None,
                'certificate_image': _safe_file_url(entry.certificate_image) if can_review else None,
                'examiner_1_name': _person_name(entry.examiner_1) if can_review and entry.examiner_1 else None,
                'examiner_2_name': _person_name(entry.examiner_2) if can_review and entry.examiner_2 else None,
            }
            for entry in entries
        ]

    def get_results(self, obj):
        can_review = self._can_review(obj)
        status_filter = {} if can_review else {'status': 'approved'}
        scores = CategoryAthleteScore.objects.filter(
            Q(athlete=obj) | Q(team_members=obj), **status_filter,
        ).distinct().select_related('category', 'category__event', 'group').prefetch_related('team_members').order_by('-submitted_date')
        return [
            {
                'id': score.id,
                'category': score.category.name if score.category else None,
                'competition': score.category.event.title if score.category and score.category.event else None,
                'competition_date': _safe_scalar(score.category.event.start_date) if score.category and score.category.event else None,
                'group_name': score.group.name if score.group else None,
                'type': score.type,
                'placement_claimed': score.placement_claimed,
                'score': score.score,
                'team_name': score.team_name,
                'team_members': [_person_name(m) for m in score.team_members.all()] if can_review else [],
                'status': score.status,
                'admin_notes': score.admin_notes if can_review else None,
                'certificate_image': _safe_file_url(score.certificate_image) if can_review else None,
            }
            for score in scores
        ]

    def get_seminars(self, obj):
        can_review = self._can_review(obj)
        status_filter = {} if can_review else {'status': 'approved'}
        entries = obj.seminar_participations.filter(**status_filter).select_related('event').order_by('-event__start_date')
        return [
            {
                'id': entry.id,
                'event': entry.event.title if entry.event else None,
                'start_date': _safe_scalar(entry.event.start_date) if entry.event else None,
                'end_date': _safe_scalar(entry.event.end_date) if entry.event else None,
                'place': entry.event.address if entry.event else None,
                'status': entry.status if can_review else None,
                'admin_notes': entry.admin_notes if can_review else None,
                'certificate_image': _safe_file_url(entry.participation_certificate) if can_review else None,
            }
            for entry in entries
        ]

    def _visas(self, obj, visa_type):
        can_review = self._can_review(obj)
        status_filter = {} if can_review else {'status': 'approved'}
        entries = obj.visas.filter(visa_type=visa_type, **status_filter).order_by('-issued_date')
        return [
            {
                'id': entry.id,
                'issued_date': _safe_scalar(entry.issued_date),
                'status': entry.status if can_review else None,
                'admin_notes': entry.admin_notes if can_review else None,
                'certificate_image': _safe_file_url(entry.image) if can_review else None,
            }
            for entry in entries
        ]

    def get_annual_visas(self, obj):
        return self._visas(obj, 'annual')

    def get_medical_visas(self, obj):
        return self._visas(obj, 'medical')


class TeamMinimalSerializer(serializers.ModelSerializer):
    """Minimal team data"""
    club = serializers.SerializerMethodField()
    club_name = serializers.SerializerMethodField()
    members = serializers.SerializerMethodField()
    
    class Meta:
        model = Team
        fields = ['id', 'name', 'club', 'club_name', 'members']

    def get_club(self, obj):
        athletes = _get_team_athletes(obj)
        first_athlete = athletes[0] if athletes else None
        if first_athlete and first_athlete.club:
            return ClubMinimalSerializer(first_athlete.club).data
        return None

    def get_club_name(self, obj):
        athletes = _get_team_athletes(obj)
        first_athlete = athletes[0] if athletes else None
        if first_athlete and first_athlete.club:
            return first_athlete.club.name
        return ''

    def get_members(self, obj):
        members = _get_team_members(obj)
        return [
            {
                'id': member.athlete.id,
                'name': f"{member.athlete.first_name} {member.athlete.last_name}".strip(),
                'first_name': member.athlete.first_name,
                'last_name': member.athlete.last_name,
                'club': {
                    'id': member.athlete.club.id,
                    'name': member.athlete.club.name,
                } if member.athlete.club else None,
            }
            for member in members if member.athlete_id
        ]


# ==================== FULL SERIALIZERS ====================
# Used for detail views
