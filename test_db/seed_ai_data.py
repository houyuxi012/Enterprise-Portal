import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from database import DATABASE_URL
from models import AIAuditLog, User

# Setup Async DB Connection (same as main app)
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

MODELS = [
    {"name": "gemini-2.0-flash", "provider": "google", "weight": 70},
    {"name": "gemini-1.5-pro", "provider": "google", "weight": 15},
    {"name": "gpt-4o", "provider": "openai", "weight": 10},
    {"name": "deepseek-chat", "provider": "deepseek", "weight": 5}
]

TRACE_PREFIX = "seed-ai-"


def _pick_status() -> str:
    roll = random.random()
    if roll < 0.88:
        return "SUCCESS"
    if roll < 0.95:
        return "BLOCKED"
    return "ERROR"


async def seed_data():
    print("Beginning AI Data Seeding...")
    async with AsyncSessionLocal() as session:
        # Remove previous seeded logs to keep import idempotent.
        await session.execute(delete(AIAuditLog).where(AIAuditLog.trace_id.like(f"{TRACE_PREFIX}%")))
        await session.commit()

        user_res = await session.execute(
            select(User.id).where(User.is_active == True).order_by(User.id.asc())
        )
        user_ids = [int(row[0]) for row in user_res.all()]

        logs = []
        today = datetime.now(timezone.utc)

        # Seed rolling 15-day window.
        for day_offset in range(14, -1, -1):
            current_day = today - timedelta(days=day_offset)
            is_weekend = current_day.weekday() >= 5

            # Base volume: weekdays are busier than weekends.
            base_volume = random.randint(30, 50) if is_weekend else random.randint(80, 150)
            volume = int(base_volume * (1 + random.uniform(-0.2, 0.5)))

            print(f"Generating {volume} logs for {current_day.date()}...")

            for _ in range(volume):
                model_choice = random.choices(
                    MODELS,
                    weights=[m["weight"] for m in MODELS],
                    k=1
                )[0]

                log_time = current_day.replace(
                    hour=random.randint(0, 23),
                    minute=random.randint(0, 59),
                    second=random.randint(0, 59)
                )

                status = _pick_status()
                tokens_in = random.randint(100, 2000) if status != "BLOCKED" else random.randint(20, 300)
                tokens_out = random.randint(50, 4000) if status == "SUCCESS" else random.randint(0, 120)
                hit_level = random.choices(["strong", "weak", "miss"], weights=[55, 30, 15], k=1)[0]
                citations = [random.randint(1, 8) for _ in range(random.randint(0, 3))]

                log = AIAuditLog(
                    event_id=str(uuid.uuid4()),
                    ts=log_time,
                    env="production",
                    service="enterprise-portal",
                    request_id=str(uuid.uuid4()),
                    trace_id=f"{TRACE_PREFIX}{uuid.uuid4()}",
                    actor_type="user",
                    actor_id=random.choice(user_ids) if user_ids else None,
                    resource_type="ai_chat",
                    action="CHAT",
                    provider=model_choice["provider"],
                    model=model_choice["name"],
                    input_policy_result="BLOCK" if status == "BLOCKED" else "ALLOW",
                    output_policy_result="ALLOW" if status == "SUCCESS" else None,
                    latency_ms=random.randint(200, 3000),
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    status=status,
                    error_code=None if status == "SUCCESS" else ("INPUT_BLOCKED" if status == "BLOCKED" else "PROVIDER_ERROR"),
                    error_reason=None if status == "SUCCESS" else ("Blocked by seed policy" if status == "BLOCKED" else "Upstream timeout in seed sample"),
                    meta_info={
                        "hit_level": hit_level,
                        "citations": citations,
                        "seed": True,
                    },
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
