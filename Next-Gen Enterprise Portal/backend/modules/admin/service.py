"""Admin module service facade."""

from modules.admin.services.log_storage import cleanup_logs, run_log_cleanup_scheduler
from modules.admin.services.platform_runtime import apply_platform_runtime, test_ntp_connectivity

__all__ = [
    "cleanup_logs",
    "run_log_cleanup_scheduler",
    "apply_platform_runtime",
    "test_ntp_connectivity",
]
