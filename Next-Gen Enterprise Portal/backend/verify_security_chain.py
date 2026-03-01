import asyncio
import os
import sys

import httpx


BASE_URL = os.getenv("VERIFY_BASE_URL", "https://frontend")
VERIFY_SSL = os.getenv("VERIFY_SSL", "false").lower() == "true"
ADMIN_USERNAME = os.getenv("VERIFY_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("VERIFY_ADMIN_PASS", "admin")

TEST_PORTAL_PLAIN = {
    "username": "test_portal_plain",
    "password": "Password#123",
    "email": "test_portal_plain@example.com",
    "name": "Portal Plain",
}
TEST_PORTAL_ADMIN = {
    "username": "test_portal_admin",
    "password": "Password#123",
    "email": "test_portal_admin@example.com",
    "name": "Portal Admin",
}


def _assert(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


async def _admin_login(client: httpx.AsyncClient):
    resp = await client.post(
        "/api/iam/auth/admin/token",
        data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    _assert(resp.status_code == 200, f"admin login failed: {resp.status_code} {resp.text}")


async def _get_roles(client: httpx.AsyncClient) -> dict[str, int]:
    resp = await client.get("/api/iam/admin/roles")
    _assert(resp.status_code == 200, f"list roles failed: {resp.status_code} {resp.text}")
    return {item["code"]: item["id"] for item in resp.json()}


async def _list_users(client: httpx.AsyncClient) -> list[dict]:
    resp = await client.get("/api/iam/admin/users")
    _assert(resp.status_code == 200, f"list users failed: {resp.status_code} {resp.text}")
    return resp.json()


async def _ensure_portal_user(
    client: httpx.AsyncClient,
    username: str,
    password: str,
    role_ids: list[int],
    email: str,
    name: str,
) -> int:
    users = await _list_users(client)
    found = next((u for u in users if u.get("username") == username), None)

    if not found:
        create_resp = await client.post(
            "/api/iam/admin/users",
            json={
                "username": username,
                "email": email,
                "password": password,
                "is_active": True,
                "role_ids": role_ids,
                "name": name,
            },
        )
        _assert(
            create_resp.status_code == 201,
            f"create user {username} failed: {create_resp.status_code} {create_resp.text}",
        )
        users = await _list_users(client)
        found = next((u for u in users if u.get("username") == username), None)
        _assert(found is not None, f"user {username} not found after creation")

    user_id = int(found["id"])
    update_resp = await client.put(
        f"/api/iam/admin/users/{user_id}",
        json={
            "password": password,
            "is_active": True,
            "role_ids": role_ids,
            "name": name,
            "email": email,
        },
    )
    _assert(
        update_resp.status_code == 200,
        f"update user {username} failed: {update_resp.status_code} {update_resp.text}",
    )
    return user_id


async def _run():
    results: list[tuple[str, object]] = []

    async with httpx.AsyncClient(
        base_url=BASE_URL,
        verify=VERIFY_SSL,
        timeout=20.0,
        follow_redirects=False,
    ) as admin_client:
        await _admin_login(admin_client)
        role_map = await _get_roles(admin_client)
        _assert("user" in role_map, "role 'user' is missing")
        _assert("PortalAdmin" in role_map, "role 'PortalAdmin' is missing")

        await _ensure_portal_user(
            admin_client,
            username=TEST_PORTAL_PLAIN["username"],
            password=TEST_PORTAL_PLAIN["password"],
            role_ids=[role_map["user"]],
            email=TEST_PORTAL_PLAIN["email"],
            name=TEST_PORTAL_PLAIN["name"],
        )
        portal_admin_user_id = await _ensure_portal_user(
            admin_client,
            username=TEST_PORTAL_ADMIN["username"],
            password=TEST_PORTAL_ADMIN["password"],
            role_ids=[role_map["user"], role_map["PortalAdmin"]],
            email=TEST_PORTAL_ADMIN["email"],
            name=TEST_PORTAL_ADMIN["name"],
        )

        async with httpx.AsyncClient(base_url=BASE_URL, verify=VERIFY_SSL, timeout=20.0) as plain_client:
            plain_admin_login = await plain_client.post(
                "/api/iam/auth/admin/token",
                data={
                    "username": TEST_PORTAL_PLAIN["username"],
                    "password": TEST_PORTAL_PLAIN["password"],
                },
            )
            results.append(("portal_plain_login_admin", plain_admin_login.status_code))
            _assert(plain_admin_login.status_code == 403, "portal plain should not login admin/token")

        async with httpx.AsyncClient(base_url=BASE_URL, verify=VERIFY_SSL, timeout=20.0) as portal_admin_client:
            portal_admin_login = await portal_admin_client.post(
                "/api/iam/auth/admin/token",
                data={
                    "username": TEST_PORTAL_ADMIN["username"],
                    "password": TEST_PORTAL_ADMIN["password"],
                },
            )
            results.append(("portal_admin_login_admin", portal_admin_login.status_code))
            _assert(portal_admin_login.status_code == 200, "portal admin should login admin/token")

            forbidden_call = await portal_admin_client.delete("/api/admin/employees/999999")
            results.append(("portal_admin_delete_employee", forbidden_call.status_code))
            _assert(forbidden_call.status_code == 403, "portal admin should not edit employees")

        authz_logs = await admin_client.get(
            "/api/admin/logs/business",
            params={"domain": "IAM", "action": "AUTHZ_DENIED", "source": "db", "limit": 20},
        )
        results.append(("query_authz_denied_logs", authz_logs.status_code))
        _assert(authz_logs.status_code == 200, "query AUTHZ_DENIED logs failed")
        authz_hits = [x for x in authz_logs.json() if x.get("operator") == TEST_PORTAL_ADMIN["username"]]
        results.append(("authz_denied_hit_count", len(authz_hits)))
        _assert(len(authz_hits) > 0, "AUTHZ_DENIED log for portal admin was not recorded")

        async with httpx.AsyncClient(
            base_url=BASE_URL,
            verify=VERIFY_SSL,
            timeout=20.0,
            follow_redirects=False,
        ) as portal_admin_revoke_client:
            relogin = await portal_admin_revoke_client.post(
                "/api/iam/auth/admin/token",
                data={
                    "username": TEST_PORTAL_ADMIN["username"],
                    "password": TEST_PORTAL_ADMIN["password"],
                },
            )
            results.append(("portal_admin_relogin_before_revoke", relogin.status_code))
            _assert(relogin.status_code == 200, "portal admin relogin failed")

            before_revoke = await portal_admin_revoke_client.get("/api/admin/news/")
            results.append(("portal_admin_access_before_revoke", before_revoke.status_code))
            _assert(before_revoke.status_code == 200, "portal admin should access admin/news before revoke")

            revoke_resp = await admin_client.post(
                f"/api/iam/admin/users/{portal_admin_user_id}/portal-admin/revoke"
            )
            results.append(("revoke_portal_admin", revoke_resp.status_code))
            _assert(revoke_resp.status_code == 200, "revoke portal admin failed")

            after_revoke = await portal_admin_revoke_client.get("/api/admin/news/")
            results.append(("portal_admin_access_after_revoke", after_revoke.status_code))
            _assert(after_revoke.status_code == 403, "revoked portal admin should be blocked immediately")

            grant_resp = await admin_client.post(
                f"/api/iam/admin/users/{portal_admin_user_id}/portal-admin/grant"
            )
            results.append(("restore_portal_admin", grant_resp.status_code))
            _assert(grant_resp.status_code == 200, "restore portal admin failed")

        async with httpx.AsyncClient(base_url=BASE_URL, verify=VERIFY_SSL, timeout=20.0) as sys_client:
            sys_login = await sys_client.post(
                "/api/iam/auth/admin/token",
                data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
            )
            results.append(("system_admin_login", sys_login.status_code))
            _assert(sys_login.status_code == 200, "system admin login failed")

            old_admin_token = sys_client.cookies.get("admin_session")
            _assert(bool(old_admin_token), "admin_session cookie missing after login")

            before_logout = await sys_client.get("/api/admin/news/")
            results.append(("system_admin_access_before_logout", before_logout.status_code))
            _assert(before_logout.status_code == 200, "system admin should access admin/news before logout")

            logout_resp = await sys_client.post("/api/iam/auth/logout")
            results.append(("system_admin_logout", logout_resp.status_code))
            _assert(logout_resp.status_code == 200, "logout failed")

            sys_client.cookies.set("admin_session", old_admin_token)
            replay_resp = await sys_client.get("/api/admin/news/")
            results.append(("system_admin_replay_old_token", replay_resp.status_code))
            _assert(replay_resp.status_code == 401, "replayed old admin token should be rejected")

        async with httpx.AsyncClient(base_url=BASE_URL, verify=VERIFY_SSL, timeout=20.0) as portal_client:
            portal_login = await portal_client.post(
                "/api/iam/auth/portal/token",
                data={
                    "username": TEST_PORTAL_PLAIN["username"],
                    "password": TEST_PORTAL_PLAIN["password"],
                },
            )
            results.append(("portal_plain_login_portal", portal_login.status_code))
            _assert(portal_login.status_code == 200, "portal login failed")

            invalid_action_resp = await portal_client.post(
                "/api/app/logs/business",
                json={"action": "DROP TABLE;", "target": "x", "detail": "hack"},
            )
            results.append(("portal_invalid_action", invalid_action_resp.status_code))
            _assert(invalid_action_resp.status_code == 400, "invalid business log action should be rejected")

            valid_action_resp = await portal_client.post(
                "/api/app/logs/business",
                json={
                    "action": "search.query",
                    "target": "kb:handbook",
                    "detail": "   hello   world   ",
                    "status": "FAIL",
                },
            )
            results.append(("portal_valid_action", valid_action_resp.status_code))
            _assert(valid_action_resp.status_code == 200, "valid business log action should succeed")
            valid_body = valid_action_resp.json()
            results.append(("portal_valid_action_name", valid_body.get("action")))
            results.append(("portal_valid_action_status", valid_body.get("status")))
            _assert(
                valid_body.get("action") == "PORTAL_CLIENT_SEARCH_QUERY",
                "client action should be namespaced and normalized",
            )
            _assert(valid_body.get("status") == "SUCCESS", "client-provided status should not override persisted status")

    print("=== Security Chain Verification ===")
    for key, value in results:
        print(f"{key}: {value}")
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    try:
        asyncio.run(_run())
    except AssertionError as e:
        print(f"FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
