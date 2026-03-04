from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from core.database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    manager = Column(String, nullable=True)
    description = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)

    directory_id = Column(Integer, index=True, nullable=True)
    external_id = Column(String(255), index=True, nullable=True)

    children = relationship("Department", back_populates="parent")
    parent = relationship("Department", remote_side=[id], back_populates="children")


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, index=True)
    module = Column(String, index=True)
    message = Column(Text)
    timestamp = Column(String)
    ip_address = Column(String, nullable=True)
    request_path = Column(String, nullable=True)
    method = Column(String, nullable=True)
    status_code = Column(Integer, nullable=True)
    response_time = Column(Float, nullable=True)
    request_size = Column(Integer, nullable=True)
    user_agent = Column(String, nullable=True)


class BusinessLog(Base):
    __tablename__ = "business_logs"

    id = Column(Integer, primary_key=True, index=True)
    operator = Column(String, index=True)
    action = Column(String, index=True)
    target = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    status = Column(String)
    detail = Column(Text, nullable=True)
    trace_id = Column(String, index=True, nullable=True)
    source = Column(String, default="WEB", nullable=True)
    domain = Column(String, default="BUSINESS", index=True)
    timestamp = Column(String)


class LogForwardingConfig(Base):
    __tablename__ = "log_forwarding_config"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String)
    endpoint = Column(String)
    port = Column(Integer, nullable=True)
    secret_token = Column(String, nullable=True)
    enabled = Column(Boolean, default=False)
    log_types = Column(String, nullable=True, default='["BUSINESS","SYSTEM","ACCESS"]')


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)
    model_kind = Column(String, default="text")
    base_url = Column(String, nullable=True)
    api_key = Column(String)
    model = Column(String)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=True)


class AISecurityPolicy(Base):
    __tablename__ = "ai_security_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)
    content = Column(Text)
    action = Column(String)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=True)


class AIAuditLog(Base):
    __tablename__ = "ai_audit_log"

    id = Column(Integer, primary_key=True, index=True)
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
    model_name = Column(String, unique=True, index=True)
    daily_token_limit = Column(Integer, default=0)
    daily_request_limit = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=True)

