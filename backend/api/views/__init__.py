"""
api.views package.

This used to be a single 5900+ line api/views.py file. It has been split into
one module per functional domain to make the codebase easier to navigate and
review, without changing any behavior, URLs, or import paths.

Everything that used to be importable from `api.views` (e.g. `from .views
import AthleteViewSet`, `from api.views import health`, `from .views import
*`, or `from . import views` then `views.SomeViewSet`) still works exactly
the same, because every public name is re-exported here. `api/urls.py` and
`api/admin.py` do not need any changes.

Module layout (grouped by domain, mirrors the 19 functional domains
documented for this backend):
    _common.py       Shared private helpers used across many domains
                      (operational locks, referee-assignment checks, live
                      scoring/recording-session helpers, etc.)
    auth.py          Registration/login/logout/session endpoints
    core.py          Health check, CSRF, API root, City, simple list endpoints
    athletes.py      Athlete profile CRUD, coaches, pending approvals
    clubs.py         Club CRUD
    teams.py         Team / TeamMember / CategoryTeam
    grades.py        Grade, GradeHistory (+ athlete self-submission)
    titles_roles.py  Title, FederationRole
    visas.py         Annual/medical visa endpoints (unified Visa model)
    competitions.py  Competition/Event, Category, Group, DiplomaTemplate
    enrollments.py   CategoryAthlete, FightGroupEnrollment, FightAthleteWeight,
                      EventEnrollment
    matches.py       Match, MatchRound, MatchEvent, MatchRefereeScore,
                      MatchFieldAssignment, MatchRefereeAssignment, bracket
                      generation, legacy point-event sync helpers
    scoring.py       CategoryRefereeScore(Event), FieldRecordingSession,
                      CategoryAthleteScore (result submission/approval)
    referees.py      Referee assignment/presence views and viewsets
    fields.py        CompetitionField, FieldBreak, CategoryFieldAssignment,
                      DisplayMonitorSession, QRCodeAssignment
    notifications.py Notification, NotificationSettings
    supporters.py    SupporterAthleteRelation
    training.py      TrainingSeminarParticipation
    sync.py          OfflineSyncViewSet (offline-first sync endpoint)
"""

from ._common import *  # noqa: F401,F403
from .auth import *  # noqa: F401,F403
from .core import *  # noqa: F401,F403
from .athletes import *  # noqa: F401,F403
from .clubs import *  # noqa: F401,F403
from .teams import *  # noqa: F401,F403
from .grades import *  # noqa: F401,F403
from .titles_roles import *  # noqa: F401,F403
from .visas import *  # noqa: F401,F403
from .competitions import *  # noqa: F401,F403
from .enrollments import *  # noqa: F401,F403
from .matches import *  # noqa: F401,F403
from .scoring import *  # noqa: F401,F403
from .referees import *  # noqa: F401,F403
from .fields import *  # noqa: F401,F403
from .notifications import *  # noqa: F401,F403
from .supporters import *  # noqa: F401,F403
from .training import *  # noqa: F401,F403
from .sync import *  # noqa: F401,F403

# `import *` only pulls in names that don't start with an underscore, but
# api/admin.py imports a couple of the legacy-sync private helpers directly
# (`from .views import _sync_match_referee_score_to_legacy`, etc.), so they
# need to be re-exported explicitly here too.
from .matches import (  # noqa: F401
    _sync_match_referee_score_to_legacy,
    _delete_legacy_point_events,
    _legacy_metadata_matches,
    _sync_match_event_to_legacy,
)
from ._common import _auto_validate_real_time_point_event  # noqa: F401
