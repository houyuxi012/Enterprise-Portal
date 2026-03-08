from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel


class PermissionBase(BaseModel):
    code: str
    description: str
    app_id: Optional[str] = "portal"


class PermissionCreate(PermissionBase):
    pass


class Permission(PermissionBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoleBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    app_id: Optional[str] = "portal"


class RoleCreate(RoleBase):
    permission_ids: list[int] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[list[int]] = None


class Role(RoleBase):
    id: int
    permissions: list[Permission] = []
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoleOut(BaseModel):
    id: int
    code: str
    name: str
    app_id: str = "portal"

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    username: str
    email: str
    account_type: Optional[str] = "PORTAL"
    name: Optional[str] = None
    avatar: Optional[str] = None
    is_active: Optional[bool] = True
    role: Optional[str] = "user"
    auth_source: Optional[str] = "local"
    password_violates_policy: Optional[bool] = False
    password_change_required: Optional[bool] = False


class UserCreate(UserBase):
    password: str
    role_ids: Optional[list[int]] = []


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    role_ids: Optional[list[int]] = None
    is_active: Optional[bool] = None


class User(UserBase):
    id: int
    roles: list[Role] = []

    class Config:
        from_attributes = True


class UserOption(BaseModel):
    id: int
    username: str
    name: Optional[str] = None

    class Config:
        from_attributes = True


class UserMeResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar: Optional[str] = None
    auth_source: Optional[str] = "local"
    is_active: bool = True
    roles: list[RoleOut] = []
    permissions: list[str] = []
    perm_version: int = 1
    password_violates_policy: bool = False
    password_change_required: bool = False

    class Config:
        from_attributes = True


class PasswordResetRequest(BaseModel):
    username: str
    new_password: Optional[str] = None


class UserChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class DirectoryConfigBase(BaseModel):
    name: str
    type: Literal["ldap", "ad"] = "ldap"
    host: str
    port: int = 389
    use_ssl: bool = False
    start_tls: bool = False
    bind_dn: Optional[str] = None
    remark: Optional[str] = None
    base_dn: str
    user_filter: str = "(&(objectClass=inetOrgPerson)(uid={username}))"
    username_attr: str = "uid"
    email_attr: str = "mail"
    display_name_attr: str = "cn"
    mobile_attr: str = "mobile"
    avatar_attr: str = "jpegPhoto"
    sync_mode: Literal["manual", "auto"] = "manual"
    sync_interval_minutes: Optional[int] = None
    sync_page_size: int = 1000
    sync_cursor: Optional[str] = None
    org_base_dn: Optional[str] = None
    org_filter: Optional[str] = "(|(objectClass=organizationalUnit)(objectClass=organization))"
    org_name_attr: Optional[str] = "ou"
    group_base_dn: Optional[str] = None
    group_filter: Optional[str] = "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))"
    group_name_attr: Optional[str] = "cn"
    group_desc_attr: Optional[str] = "description"
    delete_grace_days: int = 7
    delete_whitelist: Optional[str] = None
    enabled: bool = False


class DirectoryConfigCreate(DirectoryConfigBase):
    bind_password: Optional[str] = None


class DirectoryConfigUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[Literal["ldap", "ad"]] = None
    host: Optional[str] = None
    port: Optional[int] = None
    use_ssl: Optional[bool] = None
    start_tls: Optional[bool] = None
    bind_dn: Optional[str] = None
    remark: Optional[str] = None
    bind_password: Optional[str] = None
    base_dn: Optional[str] = None
    user_filter: Optional[str] = None
    username_attr: Optional[str] = None
    email_attr: Optional[str] = None
    display_name_attr: Optional[str] = None
    mobile_attr: Optional[str] = None
    avatar_attr: Optional[str] = None
    sync_mode: Optional[Literal["manual", "auto"]] = None
    sync_interval_minutes: Optional[int] = None
    sync_page_size: Optional[int] = None
    sync_cursor: Optional[str] = None
    org_base_dn: Optional[str] = None
    org_filter: Optional[str] = None
    org_name_attr: Optional[str] = None
    group_base_dn: Optional[str] = None
    group_filter: Optional[str] = None
    group_name_attr: Optional[str] = None
    group_desc_attr: Optional[str] = None
    delete_grace_days: Optional[int] = None
    delete_whitelist: Optional[str] = None
    enabled: Optional[bool] = None


class DirectoryConfigOut(DirectoryConfigBase):
    id: int
    has_bind_password: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DirectoryConfigListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    items: list[DirectoryConfigOut]


class DirectoryConnectionTestRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    portal_url: Optional[str] = None


class DirectoryConnectionDraftTestRequest(BaseModel):
    type: Literal["ldap", "ad"] = "ldap"
    host: str
    port: int = 389
    use_ssl: bool = False
    start_tls: bool = False
    bind_dn: Optional[str] = None
    bind_password: Optional[str] = None
    base_dn: str
    user_filter: str = "(&(objectClass=inetOrgPerson)(uid={username}))"
    username_attr: str = "uid"
    email_attr: str = "mail"
    display_name_attr: str = "cn"
    mobile_attr: str = "mobile"
    avatar_attr: str = "jpegPhoto"
    org_base_dn: Optional[str] = None
    org_filter: Optional[str] = "(|(objectClass=organizationalUnit)(objectClass=organization))"
    org_name_attr: Optional[str] = "ou"
    group_base_dn: Optional[str] = None
    group_filter: Optional[str] = "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))"
    group_name_attr: Optional[str] = "cn"
    group_desc_attr: Optional[str] = "description"
    username: Optional[str] = None
    password: Optional[str] = None


class DirectoryConnectionTestResponse(BaseModel):
    success: bool
    message: str
    matched_dn: Optional[str] = None
    attributes: Dict[str, Any] = {}


class PortalAuthTokenRequest(BaseModel):
    username: str
    password: str
    provider: Literal["ldap", "ad", "local"] = "ldap"


class PortalAuthTokenResponse(BaseModel):
    message: str = "Login successful"
    token_type: str = "bearer"
    access_token: Optional[str] = None
    provider: str = "ldap"
    mfa_required: bool = False
    mfa_token: Optional[str] = None
    mfa_methods: list[str] = []
    mfa_setup_required: bool = False


class MfaSetupResponse(BaseModel):
    secret: str
    qr_code: str
    otpauth_uri: str


class MfaVerifySetupRequest(BaseModel):
    code: str


class MfaChallengeVerifyRequest(BaseModel):
    mfa_token: str
    totp_code: Optional[str] = None
    email_code: Optional[str] = None
    webauthn_response: Optional[Dict[str, Any]] = None


class MfaDisableRequest(BaseModel):
    password: str
    totp_code: str


class MfaStatusResponse(BaseModel):
    totp_enabled: bool
    email_mfa_enabled: bool = False
    webauthn_enabled: bool = False


class WebAuthnCredentialOut(BaseModel):
    id: int
    name: str
    created_at: Optional[datetime] = None
    transports: Optional[list[str]] = None

    class Config:
        from_attributes = True


class WebAuthnDeleteRequest(BaseModel):
    password: str
