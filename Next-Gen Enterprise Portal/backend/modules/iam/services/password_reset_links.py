from __future__ import annotations

from urllib.parse import urlencode, urljoin

from fastapi import Request


def build_request_origin(request: Request) -> str:
    forwarded_proto = str(request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    forwarded_host = str(request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    scheme = forwarded_proto or request.url.scheme or "https"
    host = forwarded_host or request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}".rstrip("/")


def normalize_base_url(value: object | None) -> str:
    raw = str(value or "").strip().rstrip("/")
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    return raw.rstrip("/")


def resolve_password_reset_base_url(
    request: Request,
    audience: str,
    config_map: dict[str, object] | None = None,
) -> str:
    normalized_config_map = dict(config_map or {})
    public_base_url = normalize_base_url(
        normalized_config_map.get("platform_public_base_url")
        or normalized_config_map.get("public_base_url"),
    )
    admin_base_url = normalize_base_url(normalized_config_map.get("platform_admin_base_url"))
    request_origin = build_request_origin(request)

    if audience == "admin":
        if admin_base_url:
            return admin_base_url
        if public_base_url:
            return urljoin(f"{public_base_url}/", "admin").rstrip("/")
        return f"{request_origin}/admin"

    return public_base_url or request_origin


def build_password_reset_link(
    request: Request,
    audience: str,
    token: str,
    *,
    config_map: dict[str, object] | None = None,
) -> str:
    base_url = resolve_password_reset_base_url(request, audience, config_map=config_map)
    query = urlencode({"reset_token": token, "audience": audience})
    return f"{base_url}/login?{query}"
