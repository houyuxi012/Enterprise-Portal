"""Application layer facades.

Routers should depend on this layer instead of importing domain services directly.
"""

from .router_registry import build_api_router
from .router_registry import register_api_routes
from .admin_routes import build_admin_router, register_admin_routes
from .iam_routes import build_iam_router, register_iam_routes
from .portal_routes import build_portal_router, register_portal_routes

__all__ = [
    "build_api_router",
    "register_api_routes",
    "build_admin_router",
    "register_admin_routes",
    "build_iam_router",
    "register_iam_routes",
    "build_portal_router",
    "register_portal_routes",
]
