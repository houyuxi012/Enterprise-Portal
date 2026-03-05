"""Admin application facade.

Routers in admin domain should import platform/domain capabilities from here.
"""

from infrastructure.cache_manager import cache
from infrastructure.crypto_service import CryptoService
from infrastructure.storage import storage
from modules.admin.services.license_service import LicenseService
from modules.admin.services.license_settings import settings as license_settings
from modules.admin.services.log_forwarder import invalidate_forwarding_cache
from modules.admin.services.log_repository import LogQuery, get_log_repository
from modules.admin.services.log_storage import cleanup_logs, optimize_database
from modules.admin.services.loki_config import update_loki_retention
from modules.admin.services.platform_runtime import (
    PlatformRuntimeApplyError,
    apply_platform_runtime,
    test_ntp_connectivity,
)
from modules.iam.services.audit_service import AuditService
from modules.iam.services.email_service import send_email_otp
from modules.iam.services.password_policy import (
    generate_compliant_password,
    get_password_policy_configs,
    set_user_password,
    validate_password,
)
from modules.portal.services.ai_engine import AIEngine

__all__ = [
    "AIEngine",
    "AuditService",
    "CryptoService",
    "LicenseService",
    "LogQuery",
    "PlatformRuntimeApplyError",
    "apply_platform_runtime",
    "cache",
    "cleanup_logs",
    "generate_compliant_password",
    "get_log_repository",
    "get_password_policy_configs",
    "invalidate_forwarding_cache",
    "license_settings",
    "optimize_database",
    "send_email_otp",
    "set_user_password",
    "storage",
    "test_ntp_connectivity",
    "update_loki_retention",
    "validate_password",
]

