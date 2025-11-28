from rest_framework import permissions


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow admins to edit/delete objects.
    Regular users can only read.
    """

    def has_permission(self, request, view):
        # Read permissions are allowed to any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        
        # Write permissions are only allowed to admin users
        return request.user and request.user.is_authenticated and request.user.is_admin


class IsAdmin(permissions.BasePermission):
    """
    Custom permission to only allow admins.
    """
    
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_admin


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Custom permission to allow owners to edit their own objects, or admins to edit any object.
    """
    
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated
    
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Write permissions are only allowed to the owner of the object or admins
        if hasattr(obj, 'user'):
            return obj.user == request.user or request.user.is_admin
        
        # For objects without a user field, only admins can edit
        return request.user.is_admin


class IsClubCoachOrAdmin(permissions.BasePermission):
    """
    Custom permission to allow club coaches to manage their club and athletes,
    or admins to manage any club.
    """
    
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated
    
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Admins can do anything
        if request.user.is_admin:
            return True
        
        # Check if user is a coach of the club
        try:
            # Get the user's athlete profile
            athlete = request.user.athlete
            if not athlete.is_coach:
                return False
            
            # For Club objects
            if obj.__class__.__name__ == 'Club':
                return obj.coaches.filter(pk=athlete.pk).exists()
            
            # For Athlete objects - coach can manage athletes in their club
            if obj.__class__.__name__ == 'Athlete':
                if athlete.club and obj.club == athlete.club:
                    # Check if the requesting user is a coach of this club
                    return athlete.club.coaches.filter(pk=athlete.pk).exists()
            
            # For results/scores - coach can manage their club's athlete results
            if hasattr(obj, 'athlete') and obj.athlete:
                if athlete.club and obj.athlete.club == athlete.club:
                    return athlete.club.coaches.filter(pk=athlete.pk).exists()
            
            # For team results with team_members
            if hasattr(obj, 'team_members'):
                team_member_clubs = obj.team_members.values_list('club', flat=True)
                if athlete.club and athlete.club.pk in team_member_clubs:
                    return athlete.club.coaches.filter(pk=athlete.pk).exists()
                    
        except Exception:
            pass
        
        return False


class IsAthleteOwnerCoachOrAdmin(permissions.BasePermission):
    """
    Permission for athlete-submitted data (results, grade history, etc).
    Allows: the athlete themselves, their club coaches, or admins.
    """
    
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated
    
    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to any authenticated user
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Admins can do anything
        if request.user.is_admin:
            return True
        
        # Check if user is the athlete who owns this data
        try:
            athlete = request.user.athlete
            
            # If the object has an 'athlete' field
            if hasattr(obj, 'athlete') and obj.athlete:
                # User is the athlete
                if obj.athlete.user == request.user:
                    return True
                
                # User is a coach of the athlete's club
                if athlete.is_coach and athlete.club and obj.athlete.club == athlete.club:
                    return athlete.club.coaches.filter(pk=athlete.pk).exists()
            
            # For team results with team_members
            if hasattr(obj, 'team_members'):
                # Check if user's athlete is in the team
                if obj.team_members.filter(user=request.user).exists():
                    return True
                
                # Check if user is a coach of any team member's club
                if athlete.is_coach and athlete.club:
                    team_member_clubs = obj.team_members.values_list('club', flat=True)
                    if athlete.club.pk in team_member_clubs:
                        return athlete.club.coaches.filter(pk=athlete.pk).exists()
                        
        except Exception:
            pass
        
        return False
