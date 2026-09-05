from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    TeamMinimalSerializer,
    _get_prefetched_relation,
    _get_team_athletes,
)
from .athletes import AthleteSerializer
from .teams import TeamSerializer
class CategoryAthleteSerializer(serializers.ModelSerializer):
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    athlete_details = AthleteSerializer(source='athlete', read_only=True)

    class Meta:
        model = CategoryAthlete
        fields = ('id', 'athlete', 'category', 'weight', 'disqualified', 'athlete_details')
        read_only_fields = ('id', 'athlete_details')


class FightGroupEnrollmentSerializer(serializers.ModelSerializer):
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    event = serializers.PrimaryKeyRelatedField(queryset=Competition.objects.all())
    athlete_details = AthleteSerializer(source='athlete', read_only=True)

    class Meta:
        model = FightGroupEnrollment
        fields = (
            'id', 'event', 'group', 'athlete',
            'registered_weight_kg', 'notes',
            'created_at', 'updated_at',
            'athlete_details',
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'athlete_details')


class FightAthleteWeightSerializer(serializers.ModelSerializer):
    athlete_details = AthleteSerializer(source='athlete', read_only=True)
    weight_loss_display = serializers.SerializerMethodField()

    class Meta:
        model = FightAthleteWeight
        fields = (
            'id', 'category', 'athlete',
            'pre_weight_kg', 'current_weight_kg',
            'weight_loss_percentage',
            'is_disqualified', 'disqualification_reason',
            'place', 'recorded_at',
            'athlete_details', 'weight_loss_display',
        )
        read_only_fields = ('id', 'weight_loss_percentage', 'recorded_at', 'athlete_details', 'weight_loss_display')

    def get_weight_loss_display(self, obj):
        return obj.get_weight_loss_display()


class CategoryTeamSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all())
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    team_details = TeamMinimalSerializer(source='team', read_only=True)
    category_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CategoryTeam
        fields = ('id', 'category', 'team', 'team_details', 'category_details', 'place', 'disqualified', 'ref1_score', 'ref2_score', 'ref3_score', 'ref4_score', 'ref5_score')
        read_only_fields = ('id', 'team_details', 'category_details')

    def get_category_details(self, obj):
        """Serialize the related Category object"""
        if obj.category:
            return {
                'id': obj.category.id,
                'name': obj.category.name,
                'type': obj.category.type,
            }
        return None

class CategorySerializer(serializers.ModelSerializer):
    # Prefer event when available; keep event_name for compatibility
    competition_name = serializers.SerializerMethodField()
    event_name = serializers.CharField(source='event.title', read_only=True)
    enrolled_athletes = CategoryAthleteSerializer(many=True, read_only=True)  # Include enrolled athletes
    enrolled_teams = serializers.SerializerMethodField()  # Include enrolled teams
    enrolled_athletes_count = serializers.SerializerMethodField()  # Count of enrolled athletes
    enrolled_teams_count = serializers.SerializerMethodField()  # Count of enrolled teams
    teams = serializers.SerializerMethodField()  # Use method to pass context
    first_place_name = serializers.CharField(source='first_place.first_name', read_only=True, allow_null=True)
    second_place_name = serializers.CharField(source='second_place.first_name', read_only=True, allow_null=True)
    third_place_name = serializers.CharField(source='third_place.first_name', read_only=True, allow_null=True)
    first_place_team = serializers.SerializerMethodField()  # Use method to pass context
    second_place_team = serializers.SerializerMethodField()  # Use method to pass context
    third_place_team = serializers.SerializerMethodField()  # Use method to pass context
    first_place = AthleteSerializer(read_only=True)  # Include full athlete details for first place
    second_place = AthleteSerializer(read_only=True)  # Include full athlete details for second place
    third_place = AthleteSerializer(read_only=True)  # Include full athlete details for third place
    group_name = serializers.CharField(source='group.name', read_only=True, allow_null=True)  # Include group name

    class Meta:
        model = Category
        fields = [
            'id', 'category_number', 'name', 'competition_name', 'event', 'event_name', 'group', 'group_name', 'type', 'gender',
            'display_order', 'birth_year_start', 'birth_year_end',
            'enrolled_athletes', 'enrolled_athletes_count', 'enrolled_teams', 'enrolled_teams_count', 'teams', 'first_place', 'second_place', 'third_place',
            'first_place_name', 'second_place_name', 'third_place_name',
            'first_place_team', 'second_place_team', 'third_place_team',
        ]
    
    def get_enrolled_teams(self, obj):
        """Return list of enrolled teams with enrollment and member details."""
        enrolled = _get_prefetched_relation(obj, 'enrolled_teams')
        if enrolled is None:
            enrolled = obj.enrolled_teams.select_related('team').prefetch_related('team__members__athlete__club').all()
        payload = []
        for ct in enrolled:
            members = _get_team_athletes(ct.team)
            club_names = []
            for athlete in members:
                club = getattr(athlete, 'club', None)
                club_name = getattr(club, 'name', None)
                if club_name and club_name not in club_names:
                    club_names.append(club_name)

            payload.append({
                'id': ct.id,
                'team': ct.team.id,
                'team_name': ct.team.name,
                'club_name': ' / '.join(club_names),
                'disqualified': ct.disqualified,
                'place': ct.place,
                'members': [
                    {
                        'id': athlete.id,
                        'name': f"{athlete.first_name} {athlete.last_name}".strip(),
                        'first_name': athlete.first_name,
                        'last_name': athlete.last_name,
                        'club': {
                            'id': athlete.club.id,
                            'name': athlete.club.name,
                        } if athlete.club else None,
                    }
                    for athlete in members
                ],
            })
        return payload

    def get_enrolled_athletes_count(self, obj):
        """Return count of enrolled athletes"""
        prefetched = _get_prefetched_relation(obj, 'enrolled_athletes')
        if prefetched is not None:
            return len(prefetched)
        return obj.enrolled_athletes.count()

    def get_enrolled_teams_count(self, obj):
        """Return count of enrolled teams"""
        prefetched = _get_prefetched_relation(obj, 'enrolled_teams')
        if prefetched is not None:
            return len(prefetched)
        return obj.enrolled_teams.count()

    def get_teams(self, obj):
        """Serialize teams with category context for score calculation"""
        teams = _get_prefetched_relation(obj, 'teams')
        if teams is None:
            teams = obj.teams.all()
        return TeamSerializer(teams, many=True, context={'category_id': obj.id}).data
    
    def get_first_place_team(self, obj):
        """Serialize first place team with category context"""
        team = getattr(obj, 'first_place_team', None)
        if team:
            return TeamSerializer(team, context={'category_id': obj.id}).data
        return None
    
    def get_second_place_team(self, obj):
        """Serialize second place team with category context"""
        team = getattr(obj, 'second_place_team', None)
        if team:
            return TeamSerializer(team, context={'category_id': obj.id}).data
        return None
    
    def get_third_place_team(self, obj):
        """Serialize third place team with category context"""
        team = getattr(obj, 'third_place_team', None)
        if team:
            return TeamSerializer(team, context={'category_id': obj.id}).data
        return None

    def get_competition_name(self, obj):
        """Return the associated Event title or legacy Competition name for compatibility."""
        ent = getattr(obj, 'event_or_competition', None) or getattr(obj, 'competition', None)
        if not ent:
            return None
        return getattr(ent, 'title', None) or getattr(ent, 'name', None)

# Basic GradeHistory serializer for admin use
class DiplomaTemplateSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    event_name = serializers.CharField(source='event.title', read_only=True)

    class Meta:
        model = DiplomaTemplate
        fields = [
            'id', 'event', 'event_name', 'title', 'template_kind', 'category_scope', 'pdf_file', 'pdf_url',
            'preview_orientation', 'placements', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_pdf_url(self, obj):
        if not obj.pdf_file:
            return None
        request = self.context.get('request')
        url = obj.pdf_file.url
        return request.build_absolute_uri(url) if request else url

    def validate_placements(self, value):
        if value in [None, '']:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('placements must be a list.')

        allowed_align = {'left', 'center', 'right'}
        allowed_field_keys = {
            'athlete_name',
            'athlete_with_club',
            'club_name',
            'team_name',
            'team_with_club',
            'group_name',
            'group_with_gender',
            'category_name',
            'gender',
            'event_name',
            'place_label',
        }
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError('Each placement must be an object.')
            if not item.get('field_key'):
                raise serializers.ValidationError('Each placement must include field_key.')
            if item.get('field_key') not in allowed_field_keys:
                raise serializers.ValidationError('Placement field_key is not supported.')
            if 'x' not in item or 'y' not in item:
                raise serializers.ValidationError('Each placement must include x and y coordinates.')
            try:
                x = float(item.get('x'))
                y = float(item.get('y'))
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError('Placement coordinates must be numeric.') from exc
            if x < 0 or x > 100 or y < 0 or y > 100:
                raise serializers.ValidationError('Placement coordinates must be between 0 and 100.')
            max_length = item.get('max_length', 0)
            try:
                max_length = int(max_length or 0)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError('Placement max_length must be numeric.') from exc
            if max_length < 0 or max_length > 500:
                raise serializers.ValidationError('Placement max_length must be between 0 and 500.')
            align = item.get('align', 'center')
            if align not in allowed_align:
                raise serializers.ValidationError('Placement align must be left, center, or right.')
        return value

