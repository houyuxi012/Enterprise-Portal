import os
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure local backend modules are importable from repo root test invocation.
sys.path.append(os.path.join(os.getcwd(), "backend"))

from middleware.license_gate import LicenseGateMiddleware


def _build_app(policy_mode: str = "full"):
    async def _policy_provider(_request):
        if policy_mode == "blocked":
            return {
                "mode": "blocked",
                "code": "LICENSE_REQUIRED",
                "reason": "LICENSE_NOT_INSTALLED",
                "message": "系统未安装授权许可",
            }
        if policy_mode == "read_only":
            return {
                "mode": "read_only",
                "code": "LICENSE_READ_ONLY",
                "reason": "LICENSE_EXPIRED",
                "message": "授权已到期，系统当前为只读模式。",
            }
        return {"mode": "full", "code": "OK", "reason": None, "message": "ok"}

    app = FastAPI()
    app.add_middleware(LicenseGateMiddleware, policy_provider=_policy_provider)

    @app.get("/api/public/config")
    async def public_config():
        return {"ok": True}

    @app.get("/api/admin/demo")
    async def admin_demo_get():
        return {"ok": True}

    @app.post("/api/admin/demo")
    async def admin_demo_post():
        return {"ok": True}

    return app


def test_license_blocked_only_allows_exempt_paths():
    client = TestClient(_build_app(policy_mode="blocked"))

    public_resp = client.get("/api/public/config")
    assert public_resp.status_code == 200

    blocked_resp = client.get("/api/admin/demo")
    assert blocked_resp.status_code == 403
    assert blocked_resp.json()["detail"]["code"] == "LICENSE_REQUIRED"
    assert blocked_resp.json()["detail"]["mode"] == "blocked"


def test_license_expired_allows_read_but_blocks_write():
    client = TestClient(_build_app(policy_mode="read_only"))

    read_resp = client.get("/api/admin/demo")
    assert read_resp.status_code == 200

    write_resp = client.post("/api/admin/demo")
    assert write_resp.status_code == 403
    assert write_resp.json()["detail"]["code"] == "LICENSE_READ_ONLY"
    assert write_resp.json()["detail"]["mode"] == "read_only"
