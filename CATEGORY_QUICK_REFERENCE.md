# Multi-Table Inheritance Quick Reference

## Working with Categories Now

### Querying

```python
# Get all categories (any type)
Category.objects.all()

# Get specific type
SoloCategory.objects.all()
TeamCategory.objects.all()
FightCategory.objects.all()

# Filter by event (returns mix of types)
event.categories.all()

# Check instance type
if isinstance(category, SoloCategory):
    # Handle solo logic
elif isinstance(category, TeamCategory):
    # Handle team logic
elif isinstance(category, FightCategory):
    # Handle fight logic
```

### Creating Categories

```python
# Create a solo category
solo = SoloCategory.objects.create(
    name="Men's Solo",
    event=event,
    gender='male'
)

# Create a team category
team = TeamCategory.objects.create(
    name="Women's Teams",
    event=event,
    gender='female'
)

# Create a fight category
fight = FightCategory.objects.create(
    name="Mixed Fights",
    event=event,
    gender='mixt'
)
```

### Accessing Type-Specific Fields

```python
# Solo category
solo.first_place = athlete1
solo.save()

# Team category
team.first_place_team = team_obj
team.save()

# Fight category
fight.first_place = winning_athlete
fight.save()
```

### Adding Athletes/Teams

```python
# Add athlete to any category type
category.athletes.add(athlete, through_defaults={'weight': 75.5})

# Add team to team category only
team_category.teams.add(team)
```

## Admin Usage

- Navigate to Django admin
- Select from "Solo Categories", "Team Categories", or "Fight Categories"
- Each has appropriate fields and inlines only for that type
- No more type-specific conditional logic in forms

## ViewSet Usage (No Changes!)

```python
class CategoryViewSet(viewsets.ViewSet):
    # Works with all category types transparently
    
    def list(self, request):
        categories = Category.objects.all()  # Gets all types
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)
```

## Serializer Usage (No Changes!)

```python
class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category  # Works with all types
        fields = '__all__'
```

## Validation

```python
# Each model has type-specific validation
solo_cat = SoloCategory(...)
solo_cat.clean()  # Checks solo-specific rules

team_cat = TeamCategory(...)
team_cat.clean()  # Checks team-specific rules
```

## Migration Info

- **0043:** Schema changes (removed type field, created child models)
- **0044:** Data migration (automatically converted existing categories)

Both applied automatically during `python manage.py migrate`

## Backward Compatibility

✅ All existing code continues to work
✅ QuerySets for `Category.objects.all()` still work
✅ REST API endpoints unchanged
✅ Serializers unchanged

## Common Patterns

### Get solo categories from an event
```python
solo_categories = SoloCategory.objects.filter(event=event)
```

### Get all athletes from a solo category
```python
athletes = solo_cat.athletes.all()
```

### Get all teams from a team category
```python
teams = team_cat.teams.all()
```

### Get all matches from a fight category
```python
matches = fight_cat.match_set.all()
```

### Award a winner
```python
solo_cat.first_place = athlete
solo_cat.save()
```

