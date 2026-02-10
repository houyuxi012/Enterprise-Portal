
import asyncio
import httpx
import sys

async def verify_api():
    async with httpx.AsyncClient() as client:
        # We need a valid token? 
        # The endpoint requires authentication: Depends(PermissionChecker("portal.ai_audit.read"))
        # Using a direct call might fail with 401.
        # However, I can bypass auth if I modify the code or Mock it, but that's invasive.
        # Alternatively, I can generate a token using the login endpoint.
        
        # 1. Login to get token
        # Default user/pass from seed data? 'admin' / 'admin123' usually.
        # Or I can use a script that imports app and calls the function directly?
        # Calling function directly is easier and bypasses auth if I mock dependencies.
        # But running inside container as a script is harder to mock FastAPI deps.
        
        # Let's try to login first.
        try:
            resp = await client.post("http://localhost:8000/api/auth/token", data={"username": "admin", "password": "admin"}) # default creds?
            if resp.status_code != 200:
                print(f"Login failed: {resp.status_code} {resp.text}")
                # Try creating a token manually if I can import backend modules?
                return
            token = resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # 2. Call API source=loki
            print("Calling /api/logs/ai-audit?source=loki")
            resp = await client.get("http://localhost:8000/api/logs/ai-audit?source=loki&limit=10", headers=headers)
            if resp.status_code == 200:
                logs = resp.json()
                print(f"Returned {len(logs)} Loki logs")
                for log in logs[:5]:
                    print(f"[{log['source']}] {log['event_id']} - {log['ts']}")
            
            # 3. Generate NEW log
            print("Generating new log via Chat...")
            try:
                chat_payload = {
                   "prompt": "Test Audit Log Merge",
                   "provider": "openai", 
                   "model": "gpt-3.5-turbo"
                }
                await client.post("http://localhost:8000/api/ai/chat", json=chat_payload, headers=headers, timeout=5.0)
            except Exception as e:
                 print(f"Chat trigger (expected error): {e}")

            # 4. Check All again
            await asyncio.sleep(2) # Wait for async write
            print("Calling /api/logs/ai-audit?source=all again")
            resp = await client.get("http://localhost:8000/api/logs/ai-audit?source=all&limit=20", headers=headers)
            if resp.status_code == 200:
                logs = resp.json()
                for log in logs[:10]:
                    print(f"[{log['source']}] {log['event_id']}")
                
        except Exception as e:
            print(f"Verification failed: {e}")

if __name__ == "__main__":
    asyncio.run(verify_api())
