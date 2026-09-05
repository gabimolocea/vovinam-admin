"""
Domain-organized DRF serializers package.

This replaces the former monolithic api/serializers.py (2474 lines) with
one module per domain, plus a shared _common.py for helper functions and
"Minimal" serializers reused across multiple domains (e.g. AthleteMinimalSerializer,
ClubMinimalSerializer, TeamMinimalSerializer).

Pure code-organization refactor: fields, validation, and public import paths
are unchanged. Every name previously importable from `api.serializers` remains
importable from here via the wildcard re-exports below.
"""
from ._common import *  # noqa: F401,F403
from .core import *  # noqa: F401,F403
from .auth import *  # noqa: F401,F403
from .clubs import *  # noqa: F401,F403
from .athletes import *  # noqa: F401,F403
from .teams import *  # noqa: F401,F403
from .grades import *  # noqa: F401,F403
from .titles_roles import *  # noqa: F401,F403
from .visas import *  # noqa: F401,F403
from .competitions import *  # noqa: F401,F403
from .matches import *  # noqa: F401,F403
from .scoring import *  # noqa: F401,F403
from .referees import *  # noqa: F401,F403
from .fields import *  # noqa: F401,F403
from .notifications import *  # noqa: F401,F403
from .supporters import *  # noqa: F401,F403
from .training import *  # noqa: F401,F403
from .sync import *  # noqa: F401,F403

