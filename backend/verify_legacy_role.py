import requests
import time
import sys

# When running inside docker-compose network, use service name.
# If running on host, use localhost. Pydantic/Docker env var handling would be better but hardcoded for now.
BASE_URL = "http://backend:8000/api"

def test_legacy_role():
    print("\n--- Verifying Legacy Role Retirement ---")
    
    # 1. Login as Admin
    print("1. Logging in as Admin...")
    try:
        resp = requests.post(f"{BASE_URL}/auth/token", data={
            "username": "admin",
            "password": "admin"
        })
        if resp.status_code != 200:
            print(f"❌ Login failed: {resp.text}")
            sys.exit(1)
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Login successful.")
    except Exception as e:
         print(f"❌ Login Error: {e}")
         sys.exit(1)

    # 2. Verify /me returns 'role' field
    print("\n2. Checking /users/me for 'role' field (Compatibility Property)...")
    resp = requests.get(f"{BASE_URL}/users/me", headers=headers)
    if resp.status_code != 200:
        print(f"❌ /me failed: {resp.text}")
    else:
        user_data = resp.json()
        role_val = user_data.get("role")
        print(f"   User: {user_data.get('username')}, Role field: {role_val}")
        if role_val == 'admin':
             print("✅ 'role' field returned correct value (admin).")
        else:
             print(f"⚠️ 'role' field mismatch. Expected 'admin', got '{role_val}'")

    # 3. Create User with Legacy 'role' param
    print("\n3. Creating user with legacy 'role'='admin' param...")
    new_user = {
        "username": f"legacy_admin_{int(time.time())}",
        "email": f"legacy_{int(time.time())}@example.com",
        "password": "password123",
        "role": "admin",  # LEGACY PARAM
        "is_active": True
    }
    resp = requests.post(f"{BASE_URL}/users/", json=new_user, headers=headers)
    if resp.status_code == 201:
        created_user = resp.json()
        print(f"✅ User created: {created_user.get('username')}")
        
        # Verify it actually got the role ID
        # Check by listing users or checking its details if returned (detail usually has stripped fields)
        # Let's query it back
        uid = created_user['id']
        # We need to check if roles populated. The API might return roles list.
        if 'roles' in created_user and any(r['code'] == 'admin' for r in created_user['roles']):
             print("✅ User automatically assigned 'admin' role via legacy param.")
        else:
             print("⚠️ User created but 'admin' role NOT assigned (check logic).")
    else:
        print(f"❌ Create User failed: {resp.text}")

    # 4. Create User with New 'role_ids' param
    print("\n4. Creating user with new 'role_ids' param...")
    # First get admin role ID
    resp_roles = requests.get(f"{BASE_URL}/iam/admin/roles", headers=headers)
    roles = resp_roles.json()
    admin_role_id = next((r['id'] for r in roles if r['code'] == 'admin'), 1)
    
    new_user_v2 = {
        "username": f"rbac_user_{int(time.time())}",
        "email": f"rbac_{int(time.time())}@example.com",
        "password": "password123",
        "role_ids": [admin_role_id],  # NEW PARAM
        "is_active": True
    }
    resp = requests.post(f"{BASE_URL}/users/", json=new_user_v2, headers=headers)
    if resp.status_code == 201:
        created_user_v2 = resp.json()
        if 'roles' in created_user_v2 and any(r['id'] == admin_role_id for r in created_user_v2['roles']):
             print("✅ User assigned role via 'role_ids' successfully.")
        else:
             print("⚠️ User created but role ID not assigned.")
    else:
        print(f"❌ Create User V2 failed: {resp.text}")
        
    print("\n--- Legacy Role Retirement Verification Complete ---")

if __name__ == "__main__":
    test_legacy_role()
