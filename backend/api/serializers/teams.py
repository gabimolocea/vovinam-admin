from rest_framework import serializers
from django.db.models import Q
from ..models import *
from landing.models import Event


from ._common import (
    _get_team_athletes,
    _get_team_categories,
    _get_team_members,
)
class TeamSerializer(serializers.ModelSerializer):
    categories = serializers.PrimaryKeyRelatedField(many=True, queryset=Category.objects.all(), allow_null=True, required=False)  # Accept category IDs only
    members = serializers.PrimaryKeyRelatedField(many=True, queryset=TeamMember.objects.all(), allow_null=True, required=False)  # Accept member IDs only
    score = serializers.SerializerMethodField()
    club_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Team
        fields = ['id', 'name', 'categories', 'members', 'score', 'club_name']
    
    def get_score(self, obj):
        """Calculate total score from all referee scores for this team in the current category"""
        # Get category from context if available
        category_id = self.context.get('category_id')
        if category_id:
            from ..models import CategoryTeamScore
            scores = CategoryTeamScore.objects.filter(team=obj, category_id=category_id)
            if scores.exists():
                return sum(score.score for score in scores) / scores.count()  # Average score
        return None
    
    def get_club_name(self, obj):
        """Get club name from first team member"""
        athletes = _get_team_athletes(obj)
        first_athlete = athletes[0] if athletes else None
        if first_athlete and first_athlete.club:
            return first_athlete.club.name
        return "N/A"
    
    def to_representation(self, instance):
        """Customize the output to include full category and member details."""
        representation = super().to_representation(instance)
        representation['categories'] = [
            {
                'id': category.id,
                'name': category.name
            }
            for category in _get_team_categories(instance)
        ]
        representation['members'] = [
            {
                'id': member.id,
                'athlete': {
                    'id': member.athlete.id,
                    'first_name': member.athlete.first_name,
                    'last_name': member.athlete.last_name,
                    'club': {
                        'id': member.athlete.club.id,
                        'name': member.athlete.club.name
                    } if member.athlete.club else None
                }
            }
            for member in _get_team_members(instance)
        ]
        return representation
class TeamMemberSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all())  # Accept team ID only
    athlete = serializers.PrimaryKeyRelatedField(queryset=Athlete.objects.all())  # Accept athlete ID only

    class Meta:
        model = TeamMember

        fields = ['id', 'team', 'athlete']

    def to_representation(self, instance):
        """Customize the output to include full athlete details."""
        representation = super().to_representation(instance)
        representation['athlete'] = {
            'id': instance.athlete.id,
            'first_name': instance.athlete.first_name,
            'last_name': instance.athlete.last_name
        }
        return representation

