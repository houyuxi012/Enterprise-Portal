from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from core.database import Base
from core.time_utils import utc_now


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), index=True)
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    manager = Column(String(128), nullable=True)
    description = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0)

    directory_id = Column(Integer, index=True, nullable=True)
    external_id = Column(String(255), index=True, nullable=True)

    children = relationship("Department", back_populates="parent")
    parent = relationship("Department", remote_side=[id], back_populates="children")

    __table_args__ = (
        UniqueConstraint("name", "parent_id", name="uq_department_name_parent"),
    )


class SystemLog(Base):
    """系统日志 — 高容量表，建议按 timestamp 做 PostgreSQL 原生分区并定期归档。"""
    __tablename__ = "system_logs"

    id = Column(BigInteger, primary_key=True, index=True)
    level = Column(String(20), index=True)
    module = Column(String(100), index=True)
    message = Column(Text)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    ip_address = Column(String(45), nullable=True)
    request_path = Column(String(2048), nullable=True)
    method = Column(String(16), nullable=True)
    status_code = Column(Integer, nullable=True)
    response_time = Column(Float, nullable=True)
    request_size = Column(Integer, nullable=True)
    user_agent = Column(String(512), nullable=True)


class BusinessLog(Base):
    """业务审计日志 — 高容量表，建议按 timestamp 做 PostgreSQL 原生分区并定期归档。"""
    __tablename__ = "business_logs"

    id = Column(BigInteger, primary_key=True, index=True)
    operator = Column(String(255), index=True)
    action = Column(String(128), index=True)
    target = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    status = Column(String(20))
    detail = Column(Text, nullable=True)
    trace_id = Column(String(128), index=True, nullable=True)
    source = Column(String(32), default="WEB", nullable=True)
    domain = Column(String(32), default="BUSINESS", index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)


class LogForwardingConfig(Base):
    __tablename__ = "log_forwarding_config"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(32))
    endpoint = Column(String(1024))
    port = Column(Integer, nullable=True)
    secret_token = Column(Text, nullable=True)
    enabled = Column(Boolean, default=False)
    log_types = Column(Text, nullable=True, default='["BUSINESS","SYSTEM","ACCESS"]')


class AdminMeeting(Base):
    __tablename__ = "admin_meetings"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(255), nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    duration_minutes = Column(Integer, nullable=False)
    meeting_type = Column(String(20), nullable=False, index=True)
    meeting_room = Column(String(255), nullable=True)
    meeting_software = Column(String(128), nullable=True)
    meeting_id = Column(String(128), nullable=False, unique=True, index=True)
    organizer = Column(String(255), nullable=False)
    organizer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    attendees = Column(JSON, nullable=False, default=list)
    source = Column(String(20), nullable=False, default="local", index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    organizer_user = relationship("User", foreign_keys=[organizer_user_id])
    attendee_links = relationship(
        "AdminMeetingAttendee",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="AdminMeetingAttendee.id",
    )


class AdminMeetingAttendee(Base):
    __tablename__ = "admin_meeting_attendees"
    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_admin_meeting_attendees_meeting_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("admin_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    meeting = relationship("AdminMeeting", back_populates="attendee_links")
    user = relationship("User")


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(128), nullable=False, index=True)
    default_locale = Column(String(16), nullable=False, default="zh-CN")
    name_i18n = Column(JSON, nullable=False, default=dict)
    description = Column(String(255), nullable=True)
    description_i18n = Column(JSON, nullable=False, default=dict)
    category = Column(String(16), nullable=False, index=True)
    subject = Column(String(255), nullable=True)
    subject_i18n = Column(JSON, nullable=False, default=dict)
    content = Column(Text, nullable=False)
    content_i18n = Column(JSON, nullable=False, default=dict)
    variables = Column(JSON, nullable=False, default=list)
    is_enabled = Column(Boolean, nullable=False, default=True, index=True)
    is_builtin = Column(Boolean, nullable=False, default=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True, index=True)
    type = Column(String(32))
    model_kind = Column(String(32), default="text")
    base_url = Column(String(1024), nullable=True)
    api_key = Column(Text)
    model = Column(String(128))
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=True)


class AISecurityPolicy(Base):
    __tablename__ = "ai_security_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True, index=True)
    type = Column(String(32))
    content = Column(Text)
    action = Column(String(32))
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=True)


class AIAuditLog(Base):
    """AI 审计日志 — 高容量表，建议按 ts 做 PostgreSQL 原生分区并定期归档。"""
    __tablename__ = "ai_audit_log"

    id = Column(BigInteger, primary_key=True, index=True)
    event_id = Column(String(64), unique=True, index=True)
    ts = Column(DateTime(timezone=True), index=True)
    env = Column(String(20), default="production")
    service = Column(String(50), default="enterprise-portal")
    request_id = Column(String(64), nullable=True)
    trace_id = Column(String(64), index=True, nullable=True)
    actor_type = Column(String(20))
    actor_id = Column(Integer, nullable=True, index=True)
    actor_ip = Column(String(45), nullable=True)
    session_id = Column(String(128), nullable=True)
    resource_type = Column(String(50), default="ai_chat")
    resource_id = Column(String(128), nullable=True)
    action = Column(String(50))
    provider = Column(String(50), index=True, nullable=True)
    model = Column(String(100), nullable=True)
    api_key_fingerprint = Column(String(16), nullable=True)
    input_policy_result = Column(String(20), nullable=True)
    output_policy_result = Column(String(20), nullable=True)
    policy_hits = Column(Text, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    status = Column(String(20), index=True)
    error_code = Column(String(50), nullable=True)
    error_reason = Column(Text, nullable=True)
    prompt_hash = Column(String(64), nullable=True)
    output_hash = Column(String(64), nullable=True)
    meta_info = Column(JSON, nullable=True)
    prompt_preview = Column(String(200), nullable=True)
    source = Column(String(20), default="ai_audit")


class AIModelQuota(Base):
    __tablename__ = "ai_model_quotas"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(128), unique=True, index=True)
    daily_token_limit = Column(Integer, default=0)
    daily_request_limit = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=True)
