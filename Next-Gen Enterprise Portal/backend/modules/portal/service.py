"""Portal module service facade."""

from modules.portal.services.ai_engine import AIEngine
from modules.portal.services.kb.retriever import classify_hit, search

__all__ = ["AIEngine", "search", "classify_hit"]
