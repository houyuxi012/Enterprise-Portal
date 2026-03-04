import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "")
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    cors_origins_raw: str = os.getenv("CORS_ORIGINS", "")
    product_id: str = os.getenv("PRODUCT_ID", "enterprise-portal")

    @property
    def cors_origins(self) -> list[str]:
        if not self.cors_origins_raw.strip():
            return []
        return [item.strip() for item in self.cors_origins_raw.split(",") if item.strip()]


settings = Settings()

