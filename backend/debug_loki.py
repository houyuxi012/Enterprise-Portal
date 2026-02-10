
import asyncio
import os
import httpx
import json

LOKI_URL = os.getenv("LOKI_PUSH_URL", "http://loki:3100")

async def check_loki():
    print(f"Checking Loki at: {LOKI_URL}")
    query = '{job="enterprise-portal",source="ai_audit"}'
    
    try:
        async with httpx.AsyncClient() as client:
            # 1. Check readiness
            try:
                resp = await client.get(f"{LOKI_URL}/ready", timeout=2.0)
                print(f"Loki Ready Status: {resp.status_code} - {resp.text}")
            except Exception as e:
                print(f"Loki Readiness Check Failed: {e}")

            # 2. Query Logs
            print(f"Querying: {query}")
            resp = await client.get(
                f"{LOKI_URL}/loki/api/v1/query_range",
                params={"query": query, "limit": 10},
                timeout=5.0
            )
            print(f"Query Status: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("data", {}).get("result", [])
                print(f"Found {len(results)} streams.")
                for stream in results:
                    print(f"Labels: {stream.get('metric')}")
                    values = stream.get("values", [])
                    print(f"Log count in stream: {len(values)}")
                    if values:
                        print(f"Sample: {values[0][1]}")
            else:
                print(f"Error: {resp.text}")

    except Exception as e:
        print(f"Loki Connection Failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_loki())
