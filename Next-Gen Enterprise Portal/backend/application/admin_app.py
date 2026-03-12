"""Admin application facade.

Routers in admin domain should import platform/domain capabilities from here.
"""

from infrastructure.cache_manager import cache
from infrastructure.storage import storage
from modules.admin.services.ai_provider_security import (
    is_ai_provider_api_key_ciphertext,
    resolve_ai_provider_api_key_for_storage,
)
from modules.admin.services.license_service import LicenseService
from modules.admin.services.license_settings import settings as license_settings
from modules.admin.services.log_forwarder import invalidate_forwarding_cache
from modules.admin.services.log_forwarding_security import (
    has_log_forwarding_secret,
    resolve_log_forwarding_secret_for_storage,
)
from modules.admin.services.log_repository import LogQuery, get_log_repository
from modules.admin.services.log_storage import cleanup_logs, optimize_database
from modules.admin.services.loki_config import update_loki_retention
from modules.admin.services.notification_templates import (
    analyze_notification_template_definition,
    build_notification_sample_context,
    build_sms_test_payload,
    get_notification_email_branding,
    get_localized_notification_template_name,
    get_system_config_map,
    normalize_notification_template_i18n_map,
    normalize_notification_template_locale,
    render_notification_template,
    resolve_notification_template,
)
from modules.admin.services.platform_runtime import (
    PlatformRuntimeApplyError,
    apply_platform_runtime,
    test_ntp_connectivity,
)
from modules.iam.services.audit_service import AuditService
from modules.iam.services.email_service import send_email_message, send_email_otp
from modules.iam.services.password_policy import (
    generate_compliant_password,
    get_password_policy_configs,
    set_user_password,
    validate_password,
)
from modules.iam.services.system_config_security import (
    SYSTEM_CONFIG_MASKED_PLACEHOLDER,
    decrypt_sensitive_system_config_value,
    decrypt_system_config_map,
    encrypt_sensitive_system_config_value,
    is_masked_placeholder,
    is_sensitive_system_config_key,
    sanitize_system_config_map_for_client,
)
from modules.portal.services.ai_engine import AIEngine

__all__ = [
    "AIEngine",
    "AuditService",
    "LicenseService",
    "LogQuery",
    "PlatformRuntimeApplyError",
    "apply_platform_runtime",
    "analyze_notification_template_definition",
    "build_notification_sample_context",
    "build_sms_test_payload",
    "cache",
    "cleanup_logs",
    "decrypt_sensitive_system_config_value",
    "decrypt_system_config_map",
    "generate_compliant_password",
    "get_log_repository",
    "get_localized_notification_template_name",
    "get_notification_email_branding",
    "get_password_policy_configs",
    "get_system_config_map",
    "has_log_forwarding_secret",
    "invalidate_forwarding_cache",
    "is_ai_provider_api_key_ciphertext",
    "is_masked_placeholder",
    "is_sensitive_system_config_key",
    "license_settings",
    "normalize_notification_template_i18n_map",
    "normalize_notification_template_locale",
    "optimize_database",
    "render_notification_template",
    "resolve_ai_provider_api_key_for_storage",
    "resolve_log_forwarding_secret_for_storage",
    "resolve_notification_template",
    "send_email_message",
    "send_email_otp",
    "SYSTEM_CONFIG_MASKED_PLACEHOLDER",
    "sanitize_system_config_map_for_client",
    "set_user_password",
    "storage",
    "test_ntp_connectivity",
    "update_loki_retention",
    "validate_password",
    "encrypt_sensitive_system_config_value",
]
