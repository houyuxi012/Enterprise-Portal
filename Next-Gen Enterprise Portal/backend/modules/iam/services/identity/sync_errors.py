"""Centralised error / status codes for LDAP / AD directory synchronisation."""

from __future__ import annotations


# ── Checkpoint & Job ──────────────────────────────────────────────────────
SYNC_JOB_ALREADY_RUNNING = "SYNC_JOB_ALREADY_RUNNING"
SYNC_JOB_RESUME = "SYNC_JOB_RESUME"
SYNC_JOB_CHECKPOINT_SAVED = "SYNC_JOB_CHECKPOINT_SAVED"

# ── Cursor safety ─────────────────────────────────────────────────────────
SYNC_CURSOR_REGRESSION = "SYNC_CURSOR_REGRESSION"
SYNC_CURSOR_JUMP_ALERT = "SYNC_CURSOR_JUMP_ALERT"
SYNC_CURSOR_COMMITTED = "SYNC_CURSOR_COMMITTED"

# ── Reconciliation ────────────────────────────────────────────────────────
SYNC_RECONCILE_DEPT_MISSING = "SYNC_RECONCILE_DEPT_MISSING"
SYNC_RECONCILE_ROLE_MISSING = "SYNC_RECONCILE_ROLE_MISSING"
SYNC_RECONCILE_UPDATED = "SYNC_RECONCILE_UPDATED"

# ── Avatar ────────────────────────────────────────────────────────────────
SYNC_AVATAR_SIZE_EXCEEDED = "SYNC_AVATAR_SIZE_EXCEEDED"
SYNC_AVATAR_INVALID_FORMAT = "SYNC_AVATAR_INVALID_FORMAT"
SYNC_AVATAR_DEDUP_HIT = "SYNC_AVATAR_DEDUP_HIT"
SYNC_AVATAR_UPLOAD_FAILED = "SYNC_AVATAR_UPLOAD_FAILED"

# ── Delete protection ────────────────────────────────────────────────────
SYNC_DELETE_GRACE_MARKED = "SYNC_DELETE_GRACE_MARKED"
SYNC_DELETE_GRACE_EXPIRED = "SYNC_DELETE_GRACE_EXPIRED"
SYNC_DELETE_WHITELIST_SKIP = "SYNC_DELETE_WHITELIST_SKIP"
SYNC_DELETE_EXECUTED = "SYNC_DELETE_EXECUTED"

# ── Misc ──────────────────────────────────────────────────────────────────
SYNC_STAGE_ORGS = "orgs"
SYNC_STAGE_GROUPS = "groups"
SYNC_STAGE_USERS = "users"
SYNC_STAGE_RECONCILE = "reconcile"
SYNC_STAGE_DELETE = "delete"

# Cursor jump threshold (AD uSNChanged only) – configurable per directory later.
DEFAULT_CURSOR_JUMP_THRESHOLD = 100_000

# Avatar constraints
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB
ALLOWED_AVATAR_MIMES = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})
