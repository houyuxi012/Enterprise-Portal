import asyncio
import httpx
import json
import time

BASE_URL = "http://localhost:8000"

async def main():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        print("1. Login as admin")
        r = await client.post("/system/config/setup", json={
            "admin_username": "admin",
            "admin_password": "password",
            "admin_email": "admin@example.com"
        })
        # If already setup, just login
        r = await client.post("/auth/login/password", data={
            "username": "admin",
            "password": "password"
        })
        token = r.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}

        print("2. Create LDAP Directory")
        dir_data = {
            "name": "Test LDAP",
            "type": "ldap",
            "host": "localhost",
            "port": 389,
            "use_ssl": False,
            "start_tls": False,
            "bind_dn": "cn=admin,dc=example,dc=org",
            "bind_password": "admin",
            "base_dn": "dc=example,dc=org",
            "user_filter": "(&(objectClass=inetOrgPerson)(uid={username}))",
            "username_attr": "uid",
            "email_attr": "mail",
            "display_name_attr": "cn",
            "enabled": True,
            "sync_mode": "manual",
        }
        r = await client.post("/iam/admin/directories", json=dir_data, headers=headers)
        if r.status_code != 200:
            print("Failed to create dir:", r.text)
            return
        dir_id = r.json()["id"]
        print(f"Created Directory ID: {dir_id}")

        print("3. Full Sync (First Time)")
        r = await client.post(f"/iam/admin/directories/{dir_id}/sync", params={"incremental": "false"}, headers=headers)
        if r.status_code != 200:
            print("Failed sync:", r.text)
            return
        print("Wait for sync to finish...")
        while True:
            r = await client.get(f"/iam/admin/directories/{dir_id}/sync-jobs", headers=headers)
            jobs = r.json()["items"]
            if jobs and jobs[0]["status"] in ["success", "failed", "error"]:
                print("Sync Job Finished:", jobs[0]["status"], "Cursor:", jobs[0].get("cursor_end"))
                break
            await asyncio.sleep(1)

        print("4. Configure Delete Protection (Grace 1 day, user1 in whitelist)")
        dp_data = {
            "delete_grace_days": 1,
            "delete_whitelist": json.dumps([{"type": "username", "pattern": "user1"}])
        }
        r = await client.put("/iam/admin/directories/delete-protection", json=dp_data, headers=headers)
        print("Delete Protection Configured:", r.status_code)

        print("5. Delete user from OpenLDAP directly via docker exec")
        import subprocess
        # We assume openldap container is running and has user 'user2'
        subprocess.run(["docker-compose", "-f", "Test_case/openldap/docker-compose.yml", "exec", "-T", "openldap", "ldapdelete", "-x", "-D", "cn=admin,dc=example,dc=org", "-w", "admin", "uid=user2,ou=users,dc=example,dc=org"])
        print("Deleted user2 from LDAP")
        # And delete user1 (whitelisted)
        subprocess.run(["docker-compose", "-f", "Test_case/openldap/docker-compose.yml", "exec", "-T", "openldap", "ldapdelete", "-x", "-D", "cn=admin,dc=example,dc=org", "-w", "admin", "uid=user1,ou=users,dc=example,dc=org"])
        print("Deleted user1 from LDAP (whitelisted)")

        print("6. Full Sync (Second Time - Trigger Delete Protection)")
        r = await client.post(f"/iam/admin/directories/{dir_id}/sync", params={"incremental": "false"}, headers=headers)
        print("Wait for sync to finish...")
        while True:
            r = await client.get(f"/iam/admin/directories/{dir_id}/sync-jobs", headers=headers)
            jobs = r.json()["items"]
            if jobs and jobs[0]["status"] in ["success", "failed", "error"]:
                print("Second Sync Job Finished:", jobs[0]["status"])
                break
            await asyncio.sleep(1)

        print("7. Check Local Users Status in DB")
        subprocess.run(["docker-compose", "-f", "docker-compose.yml", "exec", "-T", "db", "psql", "-U", "user", "-d", "portal_db", "-c", "SELECT username, status, pending_delete_at FROM users;"])

if __name__ == "__main__":
    asyncio.run(main())
