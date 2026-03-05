import os
import sys

from fastapi import APIRouter


_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
for _candidate in (
    os.path.join(_repo_root, "Next-Gen Enterprise Portal", "backend"),
    os.path.join(_repo_root, "code", "backend"),
    os.path.join(_repo_root, "backend"),
    _repo_root,
):
    if os.path.isdir(_candidate) and _candidate not in sys.path:
        sys.path.append(_candidate)

from application.admin_routes import build_admin_router, register_admin_routes
from application.iam_routes import build_iam_router, register_iam_routes
from application.portal_routes import build_portal_router, register_portal_routes
from application.router_registry import build_api_router, register_api_routes


def _paths(router: APIRouter) -> set[str]:
    return {getattr(route, "path", "") for route in router.routes}


def test_build_api_router_has_expected_prefix_domains():
    api_router = build_api_router()
    assert api_router.prefix == "/api"
    paths = _paths(api_router)
    assert any(path.startswith("/api/iam/") for path in paths)
    assert any(path.startswith("/api/app/") for path in paths)
    assert any(path.startswith("/api/admin/") for path in paths)


def test_register_api_routes_supports_existing_root_prefix():
    root = APIRouter(prefix="/v2")
    register_api_routes(root)
    paths = _paths(root)
    assert any(path.startswith("/v2/iam/") for path in paths)
    assert any(path.startswith("/v2/app/") for path in paths)
    assert any(path.startswith("/v2/admin/") for path in paths)


def test_domain_builders_and_registerers_keep_expected_paths():
    assert build_portal_router().prefix == "/app"
    assert build_admin_router().prefix == "/admin"
    assert build_iam_router().prefix == ""

    parent = APIRouter(prefix="/x")
    register_iam_routes(parent)
    register_portal_routes(parent)
    register_admin_routes(parent)
    paths = _paths(parent)
    assert any(path.startswith("/x/iam/") for path in paths)
    assert any(path.startswith("/x/app/") for path in paths)
    assert any(path.startswith("/x/admin/") for path in paths)


def test_license_routes_available_on_admin_and_alias_paths():
    api_router = build_api_router()
    paths = _paths(api_router)

    admin_required = {
        "/api/admin/system/license/install/",
        "/api/admin/system/license/revocations/install/",
        "/api/admin/system/license/status/",
        "/api/admin/system/license/claims/",
        "/api/admin/system/license/events/",
    }
    alias_required = {
        "/api/system/license/install/",
        "/api/system/license/revocations/install/",
        "/api/system/license/status/",
        "/api/system/license/claims/",
        "/api/system/license/events/",
    }

    assert admin_required.issubset(paths)
    assert alias_required.issubset(paths)
