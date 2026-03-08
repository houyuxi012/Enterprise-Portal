import os
from dataclasses import dataclass

from core.runtime_secrets import get_env

@dataclass(frozen=True)
class Settings:
    @property
    def database_url(self) -> str:
        return get_env("DATABASE_URL")

    @property
    def debug(self) -> bool:
        return os.getenv("DEBUG", "false").lower() == "true"

    @property
    def redis_url(self) -> str:
        return get_env("REDIS_URL")

    @property
    def cors_origins_raw(self) -> str:
        return os.getenv("CORS_ORIGINS", "")

    @property
    def product_id(self) -> str:
        return os.getenv("PRODUCT_ID", "enterprise-portal")

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_origins_raw
        if not raw.strip():
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

settings = Settings()
