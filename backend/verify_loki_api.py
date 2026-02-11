import asyncio
import os

import httpx


BASE_URL = os.getenv("VERIFY_BASE_URL", "http://localhost:8000").rstrip("/")
ADMIN_USERNAME = os.getenv("VERIFY_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("VERIFY_ADMIN_PASSWORD", "admin")
PORTAL_USERNAME = os.getenv("VERIFY_PORTAL_USERNAME", "").strip()
PORTAL_PASSWORD = os.getenv("VERIFY_PORTAL_PASSWORD", "").strip()


def _login_form(username: str, password: str) -> dict:
    return {"username": username, "password": password}


async def verify_api():
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            admin_login_resp = await client.post(
                f"{BASE_URL}/api/iam/auth/admin/token",
                data=_login_form(ADMIN_USERNAME, ADMIN_PASSWORD),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if admin_login_resp.status_code != 200:
                print(f"[FAIL] Admin login failed: {admin_login_resp.status_code} {admin_login_resp.text}")
                return
            print("[OK] Admin login success, admin_session cookie acquired")

            print("[STEP] Query /api/admin/logs/ai-audit?source=loki")
            resp = await client.get(f"{BASE_URL}/api/admin/logs/ai-audit", params={"source": "loki", "limit": 10})
            if resp.status_code != 200:
                print(f"[FAIL] Loki source query failed: {resp.status_code} {resp.text}")
            else:
                logs = resp.json()
                print(f"[OK] Loki source returned {len(logs)} logs")
                for item in logs[:5]:
                    log_id = item.get("event_id") or item.get("id")
                    log_source = item.get("source", "unknown")
                    print(f"  - [{log_source}] {log_id}")

            if PORTAL_USERNAME and PORTAL_PASSWORD:
                portal_login_resp = await client.post(
                    f"{BASE_URL}/api/iam/auth/portal/token",
                    data=_login_form(PORTAL_USERNAME, PORTAL_PASSWORD),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if portal_login_resp.status_code == 200:
                    print("[OK] Portal login success, try generating AI audit event")
                    chat_resp = await client.post(
                        f"{BASE_URL}/api/app/ai/chat",
                        json={"prompt": "Loki verification probe message"},
                    )
                    print(f"[INFO] /api/app/ai/chat status={chat_resp.status_code}")
                else:
                    print(
                        "[WARN] Portal login failed, skip AI event generation: "
                        f"{portal_login_resp.status_code} {portal_login_resp.text}"
                    )
            else:
                print("[INFO] VERIFY_PORTAL_USERNAME/VERIFY_PORTAL_PASSWORD not set, skip AI event generation")

            await asyncio.sleep(2)
            print("[STEP] Query /api/admin/logs/ai-audit?source=all")
            resp = await client.get(f"{BASE_URL}/api/admin/logs/ai-audit", params={"source": "all", "limit": 20})
            if resp.status_code != 200:
                print(f"[FAIL] All-source query failed: {resp.status_code} {resp.text}")
                return

            logs = resp.json()
            print(f"[OK] All-source returned {len(logs)} logs")
            for item in logs[:10]:
                log_id = item.get("event_id") or item.get("id")
                log_source = item.get("source", "unknown")
                print(f"  - [{log_source}] {log_id}")
        except Exception as e:
            print(f"Verification failed: {e}")


if __name__ == "__main__":
    asyncio.run(verify_api())
