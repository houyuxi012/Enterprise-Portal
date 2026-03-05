from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from core.database import Base
from shared.base_models import role_permissions, user_roles


class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(String(50), index=True, default="portal")
    code = Column(String, index=True)
    description = Column(String)
    created_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("app_id", "code", name="uq_perm_app_code"),
    )


class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(String(50), index=True, default="portal")
    code = Column(String, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    limit_scope = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=True)

    permissions = relationship("Permission", secondary=role_permissions, backref="roles")

    directory_id = Column(Integer, index=True, nullable=True)
    external_id = Column(String(255), index=True, nullable=True)

    __table_args__ = (
        UniqueConstraint("app_id", "code", name="uq_role_app_code"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    account_type = Column(String(20), default="PORTAL", nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    directory_id = Column(Integer, nullable=True, index=True)
    external_id = Column(String(255), nullable=True, index=True)
    pending_delete_at = Column(DateTime(timezone=True), nullable=True)
    password_violates_policy = Column(Boolean, default=False)
    password_change_required = Column(Boolean, default=False)
    password_changed_at = Column(DateTime(timezone=True), nullable=True, default=datetime.utcnow)
    auth_source = Column(String(50), nullable=False, default="local", index=True)
    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    email_mfa_enabled = Column(Boolean, default=False, nullable=False)

    roles = relationship("Role", secondary=user_roles, backref="users")

    @property
    def role(self) -> str:
        if self.roles:
            for role in self.roles:
                if role.code in {"admin", "PortalAdmin", "SuperAdmin", "portal_admin"}:
                    return "admin"
        return "user"


class WebAuthnCredential(Base):
    __tablename__ = "webauthn_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(Text, nullable=False, unique=True, index=True)
    public_key = Column(Text, nullable=False)
    sign_count = Column(Integer, nullable=False, default=0)
    name = Column(String(128), nullable=False, default="Security Key")
    transports = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    user = relationship("User", backref="webauthn_credentials")


class UserPasswordHistory(Base):
    __tablename__ = "user_password_history"
    __table_args__ = (
        CheckConstraint("char_length(trim(hashed_password)) >= 40", name="ck_user_password_history_hash_nonempty"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    changed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)


class DirectoryConfig(Base):
    __tablename__ = "directory_configs"
    __table_args__ = (
        CheckConstraint("char_length(trim(host)) > 0", name="ck_directory_configs_host_nonempty"),
        CheckConstraint("char_length(trim(base_dn)) > 0", name="ck_directory_configs_base_dn_nonempty"),
        CheckConstraint("port BETWEEN 1 AND 65535", name="ck_directory_configs_port_range"),
        CheckConstraint("sync_page_size BETWEEN 1 AND 10000", name="ck_directory_configs_sync_page_size_range"),
        CheckConstraint(
            "delete_grace_days BETWEEN 0 AND 3650",
            name="ck_directory_configs_delete_grace_days_range",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False, unique=True, index=True)
    type = Column(String(20), nullable=False, index=True)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False, default=389)
    use_ssl = Column(Boolean, nullable=False, default=False)
    start_tls = Column(Boolean, nullable=False, default=False)
    bind_dn = Column(String(512), nullable=True)
    remark = Column(String(500), nullable=True)
    bind_password_ciphertext = Column(Text, nullable=True)
    base_dn = Column(String(512), nullable=False)
    user_filter = Column(String(512), nullable=False, default="(&(objectClass=inetOrgPerson)(uid={username}))")
    username_attr = Column(String(128), nullable=False, default="uid")
    email_attr = Column(String(128), nullable=False, default="mail")
    display_name_attr = Column(String(128), nullable=False, default="cn")
    mobile_attr = Column(String(128), nullable=False, default="mobile")
    avatar_attr = Column(String(128), nullable=False, default="jpegPhoto")
    sync_mode = Column(String(20), nullable=False, default="manual")
    sync_interval_minutes = Column(Integer, nullable=True, default=None)
    sync_page_size = Column(Integer, nullable=False, default=1000)
    sync_cursor = Column(String(255), nullable=True)

    org_base_dn = Column(String(512), nullable=True)
    org_filter = Column(
        String(512),
        nullable=True,
        default="(|(objectClass=organizationalUnit)(objectClass=organization))",
    )
    org_name_attr = Column(String(128), nullable=True, default="ou")

    group_base_dn = Column(String(512), nullable=True)
    group_filter = Column(
        String(512),
        nullable=True,
        default="(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))",
    )
    group_name_attr = Column(String(128), nullable=True, default="cn")
    group_desc_attr = Column(String(128), nullable=True, default="description")

    delete_grace_days = Column(Integer, nullable=False, default=7)
    delete_whitelist = Column(Text, nullable=True)

    enabled = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id = Column(Integer, primary_key=True, index=True)
    directory_id = Column(Integer, ForeignKey("directory_configs.id"), nullable=False, index=True)
    job_type = Column(String(20), nullable=False, default="full")
    status = Column(String(20), nullable=False, default="running", index=True)
    stage = Column(String(20), nullable=True)
    checkpoint_data = Column(JSON, nullable=True)
    stats = Column(JSON, nullable=True)
    cursor_start = Column(String(255), nullable=True)
    cursor_end = Column(String(255), nullable=True)
    max_usn_seen = Column(String(255), nullable=True)
    error_detail = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)


class PrivacyConsent(Base):
    __tablename__ = "privacy_consents"

    id = Column(BigInteger, primary_key=True, index=True)
    username = Column(String(255), nullable=True, index=True)
    audience = Column(String(20), nullable=False, index=True)
    policy_version = Column(String(64), nullable=False, index=True)
    policy_hash = Column(String(128), nullable=False, index=True)
    accepted = Column(Boolean, nullable=False, default=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    locale = Column(String(16), nullable=True)
    trace_id = Column(String(128), nullable=True, index=True)
    accepted_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)


class LicenseState(Base):
    __tablename__ = "license_state"

    id = Column(Integer, primary_key=True, index=True, default=1)
    product_id = Column(String(128), nullable=False, index=True)
    installation_id = Column(String(128), nullable=False, index=True)
    grant_type = Column(String(20), nullable=False)
    customer = Column(String(255), nullable=True)
    features = Column(JSON, nullable=False, default=dict)
    limits = Column(JSON, nullable=False, default=dict)
    payload = Column(JSON, nullable=True, default=dict)
    not_before = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    signature = Column(Text, nullable=False)
    fingerprint = Column(String(128), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active", index=True)
    reason = Column(String(255), nullable=True)
    last_seen_time = Column(DateTime(timezone=True), nullable=True, index=True)
    installed_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class LicenseEvent(Base):
    __tablename__ = "license_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    status = Column(String(20), nullable=False, index=True)
    reason = Column(String(128), nullable=True, index=True)
    payload = Column(JSON, nullable=True)
    signature = Column(Text, nullable=True)
    fingerprint = Column(String(128), nullable=True)
    product_id = Column(String(128), nullable=True, index=True)
    installation_id = Column(String(128), nullable=True, index=True)
    grant_type = Column(String(20), nullable=True)
    customer = Column(String(255), nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_username = Column(String(255), nullable=True)
    ip_address = Column(String(64), nullable=True)
    trace_id = Column(String(128), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
