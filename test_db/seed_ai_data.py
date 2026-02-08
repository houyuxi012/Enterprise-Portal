import asyncio
import random
from datetime import datetime, timedelta
import uuid

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from database import DATABASE_URL
from models import AIAuditLog, Base

# Setup Async DB Connection (same as main app)
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

MODELS = [
    {"name": "gemini-2.0-flash", "provider": "google", "weight": 70},
    {"name": "gemini-1.5-pro", "provider": "google", "weight": 15},
    {"name": "gpt-4o", "provider": "openai", "weight": 10},
    {"name": "deepseek-chat", "provider": "deepseek", "weight": 5}
]

async def seed_data():
    print("Beginning AI Data Seeding...")
    async with AsyncSessionLocal() as session:
        logs = []
        today = datetime.now()
        
        # Determine trends: 1.2k -> 1.5k -> 0.8k (weekend) -> 2.0k
        # Let's verify 14 days of data
        for day_offset in range(14, -1, -1):
            current_day = today - timedelta(days=day_offset)
            is_weekend = current_day.weekday() >= 5
            
            # Base volume: Weekdays higher, weekends lower
            base_volume = random.randint(30, 50) if is_weekend else random.randint(80, 150)
            
            # Add a "growth trend" multiplier (older days have less traffic)
            # trend_factor = 0.5 + (1.0 - (day_offset / 14)) * 0.5  # 0.5 to 1.0
            # Let's make it fluctuating but generally growing
            volume = int(base_volume * (1 + random.uniform(-0.2, 0.5)))
            
            print(f"Generating {volume} logs for {current_day.date()}...")

            for _ in range(volume):
                # Pick model
                model_choice = random.choices(
                    MODELS, 
                    weights=[m["weight"] for m in MODELS],
                    k=1
                )[0]
                
                # Random time in that day
                log_time = current_day.replace(
                    hour=random.randint(0, 23),
                    minute=random.randint(0, 59),
                    second=random.randint(0, 59)
                )

                # Random Tokens
                tokens_in = random.randint(100, 2000)
                tokens_out = random.randint(50, 4000)
                
                log = AIAuditLog(
                    event_id=str(uuid.uuid4()),
                    ts=log_time,
                    env="production",
                    service="enterprise-portal",
                    actor_type="user",
                    actor_id=random.randint(1, 10),
                    resource_type="ai_chat",
                    action="CHAT",
                    provider=model_choice["provider"],
                    model=model_choice["name"],
                    input_policy_result="ALLOW",
                    output_policy_result="ALLOW",
                    latency_ms=random.randint(200, 3000),
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    status="SUCCESS"
                )
                logs.append(log)
        
        print(f"Total logs to insert: {len(logs)}")
        
        # Batch insert
        batch_size = 100
        for i in range(0, len(logs), batch_size):
            session.add_all(logs[i:i+batch_size])
            await session.commit()
            print(f"Inserted batch {i} - {i+batch_size}")

    print("Seeding Complete!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed_data())
