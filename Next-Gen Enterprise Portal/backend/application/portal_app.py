"""Portal application facade.

Router layer should import from this module rather than service modules directly.
"""

from infrastructure.cache_manager import cache
from infrastructure.storage import resolve_file_token, storage
from modules.admin.services.license_service import LicenseService
from modules.admin.services.notification_templates import resolve_notification_template
from modules.iam.services.audit_service import AuditService
from modules.portal.services.ai_audit_writer import AIAuditEntry, log_ai_audit
from modules.portal.services.ai_engine import AIEngine
from modules.portal.services.kb.embedder import get_embedding
from modules.portal.services.kb.ingest import ingest_document, reindex_document, update_document
from modules.portal.services.kb.retriever import classify_hit as kb_classify_hit
from modules.portal.services.kb.retriever import search as kb_search
from modules.portal.services.notifications import build_recipient_notifications

__all__ = [
    "AIAuditEntry",
    "AIEngine",
    "AuditService",
    "LicenseService",
    "build_recipient_notifications",
    "get_embedding",
    "ingest_document",
    "kb_classify_hit",
    "kb_search",
    "log_ai_audit",
    "reindex_document",
    "cache",
    "resolve_file_token",
    "resolve_notification_template",
    "storage",
    "update_document",
]
