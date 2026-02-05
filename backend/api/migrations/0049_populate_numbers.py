# Generated migration to populate category_number and match_number

from django.db import migrations
from django.contrib.contenttypes.models import ContentType


def populate_category_numbers(apps, schema_editor):
    """Assign unique identifiers to all categories"""
    Category = apps.get_model('api', 'Category')
    
    # Get ContentType models for polymorphic categories
    try:
        SoloCategory = ContentType.objects.get(app_label='api', model='solocategory')
        TeamCategory = ContentType.objects.get(app_label='api', model='teamcategory')
        FightCategory = ContentType.objects.get(app_label='api', model='fightcategory')
    except:
        # ContentTypes might not exist yet
        pass
    
    # Counter for each type
    solo_counter = 1
    team_counter = 1
    fight_counter = 1
    general_counter = 1
    
    for category in Category.objects.all().order_by('id'):
        if category.category_number:
            continue  # Skip if already has a number
        
        # Determine category type by checking which child model exists
        try:
            if hasattr(category, 'solocategory'):
                # Solo category
                prefix = 'S' if category.gender == 'male' else ('SF' if category.gender == 'female' else 'SM')
                category.category_number = f"{prefix}{solo_counter}"
                solo_counter += 1
            elif hasattr(category, 'teamcategory'):
                # Team category
                prefix = 'T' if category.gender == 'male' else ('TF' if category.gender == 'female' else 'TM')
                category.category_number = f"{prefix}{team_counter}"
                team_counter += 1
            elif hasattr(category, 'fightcategory'):
                # Fight category
                prefix = 'F' if category.gender == 'male' else ('FF' if category.gender == 'female' else 'FM')
                category.category_number = f"{prefix}{fight_counter}"
                fight_counter += 1
            else:
                # Generic category
                category.category_number = f"C{general_counter}"
                general_counter += 1
        except:
            # Fallback to generic numbering
            category.category_number = f"C{general_counter}"
            general_counter += 1
        
        category.save(update_fields=['category_number'])


def populate_match_numbers(apps, schema_editor):
    """Assign unique identifiers to all matches"""
    Match = apps.get_model('api', 'Match')
    
    match_counter = 1
    
    for match in Match.objects.all().order_by('category_id', 'match_type', 'id'):
        if match.match_number:
            continue  # Skip if already has a number
        
        # Generate match number based on match type
        type_prefix = {
            'qualifications': 'Q',
            'semi-finals': 'SF',
            'finals': 'F',
        }.get(match.match_type, 'M')
        
        # Include category reference if available
        if match.category and match.category.category_number:
            match.match_number = f"{match.category.category_number}-{type_prefix}{match_counter}"
        else:
            match.match_number = f"M{match_counter}"
        
        match_counter += 1
        match.save(update_fields=['match_number'])


def reverse_populate(apps, schema_editor):
    """Clear all auto-assigned numbers (for rollback)"""
    Category = apps.get_model('api', 'Category')
    Match = apps.get_model('api', 'Match')
    
    Category.objects.all().update(category_number=None)
    Match.objects.all().update(match_number=None)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0048_add_status_and_numbers'),
    ]

    operations = [
        migrations.RunPython(populate_category_numbers, reverse_populate),
        migrations.RunPython(populate_match_numbers, reverse_populate),
    ]
