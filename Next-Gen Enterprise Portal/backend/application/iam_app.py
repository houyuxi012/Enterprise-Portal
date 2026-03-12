"""IAM application facade.

Keep routers decoupled from concrete service module paths.
"""

from iam.audit.service import IAMAuditService
from iam.identity.service import IdentityService, SessionStateStoreError
from infrastructure.cache_manager import cache
from infrastructure.storage import generate_file_token, resolve_file_token, storage
from modules.admin.services.license_service import LicenseService
from modules.iam.services.auth_helpers import create_mfa_token, get_system_mfa_config, verify_captcha
from modules.iam.services.audit_service import AuditService
from modules.iam.services.crypto_keyring import BindPasswordKeyring, KeyringConfigError
from modules.iam.services.email_service import send_email_otp, verify_email_otp
from modules.iam.services.identity import sync_errors as identity_sync_errors
from modules.iam.services.identity.identity_service import ProviderIdentityService
from modules.iam.services.identity.providers import IdentityProviderError, LdapIdentityProvider
from modules.iam.services.privacy_consent import (
    consume_mfa_privacy_claims,
    load_privacy_policy_snapshot,
    load_public_privacy_config,
)

__all__ = [
    "AuditService",
    "BindPasswordKeyring",
    "consume_mfa_privacy_claims",
    "IAMAuditService",
    "IdentityProviderError",
    "IdentityService",
    "KeyringConfigError",
    "LdapIdentityProvider",
    "LicenseService",
    "load_privacy_policy_snapshot",
    "load_public_privacy_config",
    "ProviderIdentityService",
    "cache",
    "create_mfa_token",
    "get_system_mfa_config",
    "identity_sync_errors",
    "send_email_otp",
    "generate_file_token",
    "verify_captcha",
    "verify_email_otp",
    "resolve_file_token",
    "SessionStateStoreError",
    "storage",
]
