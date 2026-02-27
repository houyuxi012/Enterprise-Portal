import asyncio
import os
import sys
import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

# Extend path to include current dir
sys.path.append(os.getcwd())

try:
    from backend.database import SessionLocal
    from backend import models, utils
    print("Running in Host Context (backend package found)")
except ImportError:
    # Fallback for Docker container where /app is root
    try:
        from database import SessionLocal
        import models, utils
        print("Running in Docker Context (root modules found)")
    except ImportError as e:
        print(f"Failed to import backend modules: {e}")
        sys.exit(1)

BASE_URL = os.getenv("VERIFY_BASE_URL", "http://localhost:8000")


async def _setup_users():
    async with SessionLocal() as db:
        role_result = await db.execute(select(models.Role))
        roles = {r.code: r for r in role_result.scalars().all()}

        user_role = roles.get("user")
        portal_admin_role = roles.get("PortalAdmin")
        super_admin_role = roles.get("SuperAdmin") or roles.get("admin")
        if not user_role or not portal_admin_role or not super_admin_role:
            raise RuntimeError("Required roles are missing. Run RBAC init first.")

        async def upsert_user(
            username: str,
            password: str,
            account_type: str,
            role_objects: list,
            email: str,
            name: str,
            is_active: bool = True,
        ):
            result = await db.execute(
                select(models.User)
                .options(selectinload(models.User.roles))
                .filter(models.User.username == username)
            )
            user = result.scalars().first()
            if not user:
                user = models.User(
                    username=username,
                    email=email,
                    hashed_password=await utils.get_password_hash(password),
                    is_active=is_active,
                    name=name,
                )
                db.add(user)
                await db.flush()

            user.email = email
            user.name = name
            user.is_active = is_active
            user.account_type = account_type
            user.hashed_password = await utils.get_password_hash(password)
            db.add(user)
            await db.flush()
            
            # Wipe and insert roles directly using user_roles table to avoid lazy load issues
            from sqlalchemy import delete, insert
            await db.execute(delete(models.user_roles).where(models.user_roles.c.user_id == user.id))
            for role in role_objects:
                await db.execute(insert(models.user_roles).values(user_id=user.id, role_id=role.id))

        await upsert_user(
            username="test_portal_plain",
            password="password123",
            account_type="PORTAL",
            role_objects=[user_role],
            email="test_portal_plain@example.com",
            name="Test Portal Plain",
        )
        await upsert_user(
            username="test_portal_admin",
            password="password123",
            account_type="PORTAL",
            role_objects=[user_role, portal_admin_role],
            email="test_portal_admin@example.com",
            name="Test Portal Admin",
        )
        await upsert_user(
            username="admin",
            password="admin",
            account_type="SYSTEM",
            role_objects=[super_admin_role],
            email="admin@example.com",
            name="System Administrator",
        )
        await upsert_user(
            username="test_portal_disabled",
            password="password123",
            account_type="PORTAL",
            role_objects=[user_role],
            email="disabled@example.com",
            name="Disabled User",
            is_active=False,
        )

        await db.commit()


def _assert_status(resp: httpx.Response, expected: list[int], hint: str):
    assert resp.status_code in expected, f"{hint}: {resp.status_code} {resp.text}"


def _login(client: httpx.Client, path: str, username: str, password: str) -> httpx.Response:
    return client.post(
        path,
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )


def test_dual_auth_flow():
    print("🚀 Starting Dual Auth & Isolation Verification (Live API)...")
    asyncio.run(_setup_users())
    print("✅ Test users prepared.")

    # 1) PORTAL plain can login portal/token
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as portal_plain_client:
        res = _login(portal_plain_client, "/api/iam/auth/portal/token", "test_portal_plain", "password123")
        _assert_status(res, [200], "portal plain login to /portal/token must succeed")
        assert "portal_session" in portal_plain_client.cookies, "portal_session cookie missing"
        token = res.json().get("access_token")
        portal_plain_client.headers["Authorization"] = f"Bearer {token}"
        print("✅ portal plain login portal/token success")

        # /api/app/* should pass
        res = portal_plain_client.get("/api/app/news/")
        _assert_status(res, [200], "portal plain access /api/app/news/ must succeed")
        print("✅ portal plain access /api/app/news/ success")

        # /api/admin/* should fail
        res = portal_plain_client.get("/api/admin/news/")
        _assert_status(res, [401, 403], "portal plain access /api/admin/news/ must fail")
        print("✅ portal plain blocked from /api/admin/news/")

        # portal plain cannot login admin/token
        res = _login(portal_plain_client, "/api/iam/auth/admin/token", "test_portal_plain", "password123")
        _assert_status(res, [403], "portal plain login to /admin/token must fail")
        print("✅ portal plain login admin/token blocked")
        
    # 1.5) PORTAL disabled account cannot login portal/token
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as disabled_client:
        res = _login(disabled_client, "/api/iam/auth/portal/token", "test_portal_disabled", "password123")
        _assert_status(res, [401], "disabled portal login must fail with 401")
        print("✅ disabled portal login portal/token blocked")

    # 2) PORTAL with PortalAdmin can login admin/token and access /api/admin
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as portal_admin_client:
        res = _login(portal_admin_client, "/api/iam/auth/admin/token", "test_portal_admin", "password123")
        _assert_status(res, [200], "portal admin login /admin/token must succeed")
        assert "admin_session" in portal_admin_client.cookies, "admin_session cookie missing"
        token = res.json().get("access_token")
        portal_admin_client.headers["Authorization"] = f"Bearer {token}"
        print("✅ portal admin login admin/token success")

        res = portal_admin_client.get("/api/admin/news/")
        _assert_status(res, [200], "portal admin access /api/admin/news/ must succeed")
        print("✅ portal admin access /api/admin/news/ success")

        # admin_session should not pass /api/app
        res = portal_admin_client.get("/api/app/news/")
        _assert_status(res, [401, 403], "admin session access /api/app/news/ must fail")
        print("✅ admin session blocked from /api/app/news/")

    # 3) SYSTEM admin can login admin/token and must fail portal/token (policy)
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as system_client:
        res = _login(system_client, "/api/iam/auth/admin/token", "admin", "admin")
        _assert_status(res, [200], "system login /admin/token must succeed")
        assert "admin_session" in system_client.cookies, "admin_session cookie missing for system"
        token = res.json().get("access_token")
        system_client.headers["Authorization"] = f"Bearer {token}"
        print("✅ system login admin/token success")

        res = _login(system_client, "/api/iam/auth/portal/token", "admin", "admin")
        _assert_status(res, [403], "system login /portal/token must fail by policy")
        print("✅ system blocked from portal/token")

        res = system_client.get("/api/app/news/")
        _assert_status(res, [401, 403], "system admin session must not access /api/app/news/")
        print("✅ system blocked from /api/app/news/")

    print("🎉 ALL CHECKS PASSED")


if __name__ == "__main__":
    try:
        test_dual_auth_flow()
    except AssertionError as e:
        print(f"\n❌ VERIFICATION FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)
