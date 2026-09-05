"""
Domain-organized Django admin package.

This replaces the former monolithic api/admin.py (5300+ lines) with one
module per domain, plus a shared _common.py holding inline/form classes and
helper functions reused across multiple @admin.register(...) classes.

Pure code-organization refactor: registrations, behavior, and public import
paths are unchanged. Django auto-discovers this package the same way it
discovered the old api/admin.py module, and every name that used to be
importable from `api.admin` remains importable from here via the wildcard
re-exports below.
"""
from ._common import *  # noqa: F401,F403
from .core import *  # noqa: F401,F403
from .clubs import *  # noqa: F401,F403
from .grades import *  # noqa: F401,F403
from .titles_roles import *  # noqa: F401,F403
from .competitions import *  # noqa: F401,F403
from .teams import *  # noqa: F401,F403
from .matches import *  # noqa: F401,F403
from .auth import *  # noqa: F401,F403
from .athletes import *  # noqa: F401,F403
from .supporters import *  # noqa: F401,F403
from .videos import *  # noqa: F401,F403

