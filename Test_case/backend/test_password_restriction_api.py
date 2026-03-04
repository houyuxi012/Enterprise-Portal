import requests

BASE_URL = "http://localhost:8000/api"
TIMEOUT = 15

def login_admin(session: requests.Session, username: str, password: str) -> bool:
    url = f"{BASE_URL}/iam/auth/admin/token"
    data = {"username": username, "password": password}
    response = session.post(url, data=data, timeout=TIMEOUT)
    return response.status_code == 200

def change_my_password(session: requests.Session, old_password: str, new_password: str):
    url = f"{BASE_URL}/iam/users/me/password?audience=admin"
    data = {
        "old_password": old_password,
        "new_password": new_password
    }
    response = session.put(url, json=data, timeout=TIMEOUT)
    return response.status_code, response.json()

def reset_password(session: requests.Session, username: str, new_password: str | None = None):
    url = f"{BASE_URL}/iam/admin/users/reset-password"
    data = {
        "username": username,
        "new_password": new_password
    }
    response = session.post(url, json=data, timeout=TIMEOUT)
    return response.status_code, response.json()


def list_system_users(session: requests.Session):
    url = f"{BASE_URL}/iam/admin/users"
    response = session.get(url, timeout=TIMEOUT)
    if response.status_code != 200:
        return []
    return response.json()

def main():
    print("----- 测试本地普通用户 -----")
    session = requests.Session()
    if not login_admin(session, "admin", "admin"):
        print("Admin login failed")
        return
    
    # Try change password for admin (local)
    status, result = change_my_password(session, "admin", "admin")
    print(f"管理员修改自身密码结果: {status} - {result}")

    print("\n----- 测试外部身份源用户拦截 -----")
    users = list_system_users(session)
    ldap_user = next((u for u in users if u.get("auth_source") in ["ldap", "ad", "oidc"]), None)
        
    if ldap_user:
        print(f"找到外部源用户: {ldap_user['username']} ({ldap_user['auth_source']})")
        status, result = reset_password(session, ldap_user["username"], "NewPass123!")
        print(f"尝试管理员重置外部源用户密码结果: {status} - {result}")
    else:
        print("未找到测试用外部源用户，无法进行后台重置受限拦截测试。")

if __name__ == "__main__":
    main()
