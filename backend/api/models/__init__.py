"""
Domain-organized Django models package.

This replaces the former monolithic api/models.py (3787 lines) with one
module per domain. _common.py holds the tightly-coupled foundational
models (User, UserProxy, ApprovalWorkflowMixin, Athlete, Grade,
GradeHistory, Visa, TrainingSeminarParticipation, EventParticipation)
that have real bidirectional runtime references to each other and could
not be cleanly separated without introducing circular imports.

Pure code-organization refactor: fields, Meta options, migrations state,
and public import paths are unchanged (Django resolves models by
app_label + class name, not by module path). Verified there are no
circular imports between the resulting modules before splitting.
"""
from ._common import *  # noqa: F401,F403
from .core import *  # noqa: F401,F403
from .clubs import *  # noqa: F401,F403
from .titles_roles import *  # noqa: F401,F403
from .competitions import *  # noqa: F401,F403
from .teams import *  # noqa: F401,F403
from .matches import *  # noqa: F401,F403
from .referees import *  # noqa: F401,F403
from .scoring import *  # noqa: F401,F403
from .supporters import *  # noqa: F401,F403
from .notifications import *  # noqa: F401,F403
from .videos import *  # noqa: F401,F403
from .fields import *  # noqa: F401,F403

