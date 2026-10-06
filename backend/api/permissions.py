from rest_framework import permissions


class IsAdminOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow admins to edit/delete objects.
    Read-only access is allowed to anyone (including unauthenticated users)
    so that public-facing apps (e.g. public-display) can fetch data.
    """

    def has_permission(self, request, view):
        # Read permissions are allowed to anyone
        if request.method in permissions.SAFE_METHODS:
            return True
        
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


def can_edit_object(request, obj, permission_class):
    """Evaluate a DRF permission class's write-permission logic for `obj`
    against `request`, without needing an actual write request. Used by
    public read-only serializers to expose a `can_edit` flag so the
    frontend knows whether to show edit affordances for the current user."""
    if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
        return False

    class _WriteRequest:
        method = 'PATCH'
        user = request.user

    perm = permission_class()
    fake_request = _WriteRequest()
    if not perm.has_permission(fake_request, None):
        return False
    return perm.has_object_permission(fake_request, None, obj)


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

        # For Athlete objects: the athlete themselves, or a supporter explicitly
        # granted can_edit=True on their SupporterAthleteRelation, may edit the
        # profile even if they are not a club coach.
        if obj.__class__.__name__ == 'Athlete':
            if obj.user_id and obj.user_id == request.user.id:
                return True
            from .models import SupporterAthleteRelation
            if SupporterAthleteRelation.objects.filter(
                supporter=request.user, athlete=obj, can_edit=True, status='approved'
            ).exists():
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


class IsResultReviewerOrAdmin(permissions.BasePermission):
    """
    Permission for reviewing (approve/reject/request_revision) athlete-submitted
    results. Unlike IsAthleteOwnerCoachOrAdmin, this deliberately excludes the
    submitting athlete themselves — only their club coach or an admin may
    review/approve a result, never the athlete who submitted it.
    """

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.user.is_admin:
            return True

        try:
            reviewer_athlete = request.user.athlete
        except Exception:
            return False

        # Nimeni nu-și avizează propriul rezultat. La federație antrenorii
        # sunt ei înșiși sportivi legitimați, deci un antrenor care a
        # concurat trecea toate condițiile de mai jos - e antrenor, e al
        # clubului, iar rezultatul aparține unui sportiv din clubul lui,
        # adică lui. Adminul a ieșit deja din funcție mai sus și rămâne
        # ultima instanță pentru cazul ăsta.
        if getattr(obj, 'athlete_id', None) == reviewer_athlete.id:
            return False
        if hasattr(obj, 'team_members') and obj.team_members.filter(pk=reviewer_athlete.pk).exists():
            return False

        if not reviewer_athlete.is_coach or not reviewer_athlete.club:
            return False

        if not reviewer_athlete.club.coaches.filter(pk=reviewer_athlete.pk).exists():
            return False

        # The result belongs to an athlete in the coach's club
        if getattr(obj, 'athlete_id', None) and obj.athlete.club_id == reviewer_athlete.club_id:
            return True

        # Team result: any team member belongs to the coach's club
        if hasattr(obj, 'team_members') and obj.team_members.filter(club=reviewer_athlete.club).exists():
            return True

        return False


# ═══════════════════════════════════════════════════════════════════
# MASA CENTRALĂ A UNUI TEREN
# ═══════════════════════════════════════════════════════════════════
#
# Cine stă la masa centrală se schimbă în timpul zilei, iar același arbitru
# poate fi dimineața la colț și după-amiaza la masă. De aceea dreptul nu stă
# pe persoană, ci pe teren: adresa pe care s-a deschis pagina spune terenul,
# PIN-ul spune omul. Terenul ajunge în token (vezi masa_centrala_login), deci
# sesiunea poartă singură limita cu ea.
#
# Limita e verificată în DOUĂ locuri, pentru că niciunul singur nu ajunge:
# clasa de mai jos lasă cererea să intre în view, iar `poate_scrie_pe_teren`
# verifică acolo că lucrul atins chiar e de pe terenul acela - abia în view se
# știe despre ce probă e vorba.

CHEIE_MASA_TEREN = 'masa_teren'
CHEIE_MASA_ARBITRU = 'masa_arbitru'


def terenul_mesei(request):
    """Terenul pe care sesiunea are drept de masă centrală, sau None."""
    try:
        return int(request.auth[CHEIE_MASA_TEREN])
    except (TypeError, KeyError, ValueError, AttributeError):
        return None


def arbitrul_mesei(request):
    """Arbitrul care stă acum la masă, pentru istoric."""
    try:
        return int(request.auth[CHEIE_MASA_ARBITRU])
    except (TypeError, KeyError, ValueError, AttributeError):
        return None


def este_admin(user):
    return bool(user and user.is_authenticated and getattr(user, 'is_admin', False))


def poate_scrie_pe_teren(request, field_id):
    """Adevărat dacă cererea are voie să schimbe ceva de pe terenul dat.

    Se cheamă din view, unde se știe al cui e lucrul atins. Fără asta,
    operatorul de la Terenul 1 ar putea opri proba de la Terenul 3 - are un
    token valid, doar că pentru alt teren.
    """
    if este_admin(request.user):
        return True
    teren = terenul_mesei(request)
    if teren is None or field_id is None:
        return False
    try:
        return int(field_id) == teren
    except (TypeError, ValueError):
        return False


def scrie_pentru_altii(request, field_id):
    """Adevarat daca cererea poate scrie nota ALTUI arbitru pe terenul dat.

    Masa centrala face asta tot timpul: introduce manual nota unui arbitru care
    n-a apucat s-o trimita. Pana acum o putea face doar un admin, iar la lupte
    cel de la masa nici nu e printre cei cinci care dau note - deci regula "doar
    arbitrii alocati probei" l-ar fi oprit tocmai pe el.
    """
    return poate_scrie_pe_teren(request, field_id)


class IsAdminOrFieldTable(permissions.BasePermission):
    """Citire pentru oricine; scriere pentru admin sau pentru masa unui teren.

    Nu spune PE CARE teren - asta se verifică în view cu
    `poate_scrie_pe_teren`, unde se cunoaște ținta.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        if este_admin(request.user):
            return True
        return terenul_mesei(request) is not None
