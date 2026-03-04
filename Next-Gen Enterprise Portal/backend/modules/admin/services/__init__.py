"""Admin domain service package."""

from modules.admin.services.license_service import LicenseService, LicenseValidationError
from modules.admin.services.log_storage import cleanup_logs, optimize_database, run_log_cleanup_scheduler
from modules.admin.services.platform_runtime import (
    apply_platform_runtime,
    test_ntp_connectivity,
)

__all__ = [
    "LicenseService",
    "LicenseValidationError",
    "cleanup_logs",
    "optimize_database",
    "run_log_cleanup_scheduler",
    "apply_platform_runtime",
    "test_ntp_connectivity",
]
