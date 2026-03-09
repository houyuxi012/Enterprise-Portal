from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class DepartmentBase(BaseModel):
    name: str
    parent_id: Optional[int] = None
    manager: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(DepartmentBase):
    pass


class Department(DepartmentBase):
    id: int
    children: list["Department"] = []

    class Config:
        from_attributes = True


class SystemLogBase(BaseModel):
    level: str
    module: str
    message: str
    timestamp: datetime


class SystemLog(SystemLogBase):
    id: int

    class Config:
        from_attributes = True


class BusinessLogBase(BaseModel):
    operator: str
    action: str
    target: Optional[str] = None
    ip_address: Optional[str] = None
    status: str
    detail: Optional[str] = None
    timestamp: datetime
    source: Optional[str] = None


class BusinessLogCreate(BusinessLogBase):
    pass


class BusinessLog(BusinessLogBase):
    id: int

    class Config:
        from_attributes = True


class LogForwardingConfigBase(BaseModel):
    type: str
    endpoint: str
    port: Optional[int] = None
    enabled: bool = False
    log_types: Optional[list[str]] = ["BUSINESS", "SYSTEM", "ACCESS"]


class LogForwardingConfigCreate(LogForwardingConfigBase):
    secret_token: Optional[str] = None


class LogForwardingConfig(LogForwardingConfigBase):
    id: int
    has_secret_token: bool = False

    class Config:
        from_attributes = True


MeetingType = Literal["online", "offline"]
MeetingSource = Literal["local", "third_party"]
AdminMeetingStatus = Literal["upcoming", "inProgress", "finished"]
NotificationTemplateCategory = Literal["email", "sms", "im"]


class AdminMeetingBase(BaseModel):
    subject: str
    start_time: datetime
    duration_minutes: int
    meeting_type: MeetingType
    meeting_room: str
    organizer_user_id: int
    attendee_user_ids: list[int] = []


class AdminMeetingCreate(AdminMeetingBase):
    meeting_id: Optional[str] = None


class AdminMeetingUpdate(AdminMeetingBase):
    meeting_id: Optional[str] = None


class AdminMeetingUserRef(BaseModel):
    id: int
    username: str
    name: Optional[str] = None

    class Config:
        from_attributes = True


class AdminMeeting(BaseModel):
    id: int
    subject: str
    start_time: datetime
    duration_minutes: int
    meeting_type: MeetingType
    meeting_room: str
    meeting_id: str
    organizer: str
    organizer_user_id: Optional[int] = None
    organizer_user: Optional[AdminMeetingUserRef] = None
    attendees: list[str] = []
    attendee_user_ids: list[int] = []
    attendee_users: list[AdminMeetingUserRef] = []
    source: MeetingSource = "local"
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdminMeetingListSummary(BaseModel):
    total: int
    upcoming: int
    online: int
    offline: int


class AdminMeetingListResponse(BaseModel):
    total: int
    limit: int = 20
    offset: int = 0
    items: list[AdminMeeting]
    summary: AdminMeetingListSummary


class NotificationTemplateBase(BaseModel):
    code: str
    name: str
    name_i18n: dict[str, str] = Field(default_factory=dict)
    description: Optional[str] = None
    description_i18n: dict[str, str] = Field(default_factory=dict)
    category: NotificationTemplateCategory
    subject: Optional[str] = None
    subject_i18n: dict[str, str] = Field(default_factory=dict)
    content: str
    content_i18n: dict[str, str] = Field(default_factory=dict)
    variables: list[str] = Field(default_factory=list)
    is_enabled: bool = True


class NotificationTemplateCreate(NotificationTemplateBase):
    pass


class NotificationTemplateUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    name_i18n: Optional[dict[str, str]] = None
    description: Optional[str] = None
    description_i18n: Optional[dict[str, str]] = None
    category: Optional[NotificationTemplateCategory] = None
    subject: Optional[str] = None
    subject_i18n: Optional[dict[str, str]] = None
    content: Optional[str] = None
    content_i18n: Optional[dict[str, str]] = None
    variables: Optional[list[str]] = None
    is_enabled: Optional[bool] = None


class NotificationTemplateStatusUpdate(BaseModel):
    is_enabled: bool


class NotificationTemplateValidation(BaseModel):
    declared_variables: list[str] = Field(default_factory=list)
    placeholder_variables: list[str] = Field(default_factory=list)
    invalid_declared_variables: list[str] = Field(default_factory=list)
    missing_declared_variables: list[str] = Field(default_factory=list)
    unused_declared_variables: list[str] = Field(default_factory=list)


class NotificationTemplatePreviewRequest(NotificationTemplateBase):
    preview_variables: dict[str, str] = Field(default_factory=dict)
    preview_locale: Optional[str] = None


class NotificationTemplatePreview(BaseModel):
    subject: Optional[str] = None
    content: str
    variables: dict[str, str] = Field(default_factory=dict)


class NotificationTemplatePreviewResponse(BaseModel):
    validation: NotificationTemplateValidation
    preview: NotificationTemplatePreview


class NotificationTemplate(NotificationTemplateBase):
    id: int
    is_builtin: bool = False
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CarouselItemBase(BaseModel):
    title: str
    image: str
    url: str
    badge: str
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True


class CarouselItemCreate(CarouselItemBase):
    pass


class CarouselItemUpdate(BaseModel):
    title: Optional[str] = None
    image: Optional[str] = None
    url: Optional[str] = None
    badge: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CarouselItem(CarouselItemBase):
    id: int

    class Config:
        from_attributes = True


class SystemResources(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used: str
    memory_total: str
    disk_percent: float
    network_sent_speed: float
    network_recv_speed: float


class DashboardStats(BaseModel):
    system_visits: int
    active_users: int
    tool_clicks: int
    new_content: int
    activity_trend: str
    active_users_trend: str
    tool_clicks_trend: str
    new_content_trend: str
    peak_time_data: list[int]


class LicenseInstallRequest(BaseModel):
    payload: Dict[str, Any]
    signature: str


class LicenseRevocationInstallRequest(BaseModel):
    payload: Dict[str, Any]


class LicenseRevocationInstallResponse(BaseModel):
    installed: bool
    path: str
    product_id: Optional[str] = None
    rev: int
    revoked_count: int
    updated_at: Optional[str] = None


class LicenseStatusResponse(BaseModel):
    installed: bool
    status: str
    reason: Optional[str] = None
    license_id: Optional[str] = None
    product_id: Optional[str] = None
    product_model: Optional[str] = None
    installation_id: Optional[str] = None
    grant_type: Optional[str] = None
    customer: Optional[str] = None
    installed_at: Optional[datetime] = None
    not_before: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    features_count: int = 0
    limits: Dict[str, Any] = {}


class LicenseClaimsResponse(BaseModel):
    installed: bool
    status: Optional[LicenseStatusResponse] = None
    claims: Optional[Dict[str, Any]] = None


class LicenseEventItem(BaseModel):
    id: int
    event_type: str
    status: str
    reason: Optional[str] = None
    license_id: Optional[str] = None
    product_id: Optional[str] = None
    installation_id: Optional[str] = None
    grant_type: Optional[str] = None
    customer: Optional[str] = None
    actor_username: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime


class LicenseEventListResponse(BaseModel):
    total: int
    limit: int = 20
    offset: int = 0
    items: list[LicenseEventItem]


class AIProviderBase(BaseModel):
    name: str
    type: str
    model_kind: str = "text"
    base_url: Optional[str] = None
    api_key: str
    model: str
    is_active: bool = False


class AIProviderTestRequest(BaseModel):
    name: str
    type: str
    model_kind: Optional[str] = "text"
    base_url: Optional[str] = None
    api_key: str
    model: str


class AIProviderCreate(AIProviderBase):
    pass


class AIProviderUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    model_kind: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None


class AIProvider(AIProviderBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AIProviderRead(BaseModel):
    id: int
    name: str
    type: str
    model_kind: str = "text"
    base_url: Optional[str] = None
    model: str
    is_active: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AISecurityPolicyBase(BaseModel):
    name: str
    type: str
    content: str
    action: str
    is_enabled: bool = True


class AISecurityPolicyCreate(AISecurityPolicyBase):
    pass


class AISecurityPolicyUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None
    action: Optional[str] = None
    is_enabled: Optional[bool] = None


class AISecurityPolicy(AISecurityPolicyBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AIAuditLogBase(BaseModel):
    event_id: str
    ts: datetime
    env: Optional[str] = "production"
    service: Optional[str] = "enterprise-portal"
    request_id: Optional[str] = None
    trace_id: Optional[str] = None
    actor_type: str
    actor_id: Optional[int] = None
    actor_ip: Optional[str] = None
    session_id: Optional[str] = None
    resource_type: Optional[str] = "ai_chat"
    resource_id: Optional[str] = None
    action: str
    provider: Optional[str] = None
    model: Optional[str] = None
    api_key_fingerprint: Optional[str] = None
    input_policy_result: Optional[str] = None
    output_policy_result: Optional[str] = None
    policy_hits: Optional[str] = None
    latency_ms: Optional[int] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    status: str
    error_code: Optional[str] = None
    error_reason: Optional[str] = None
    prompt_hash: Optional[str] = None
    output_hash: Optional[str] = None
    prompt_preview: Optional[str] = None
    source: str = "ai_audit"


class AIAuditLog(AIAuditLogBase):
    id: int

    class Config:
        from_attributes = True


class AIAuditLogQuery(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    actor_id: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    source: str = "db"
    limit: int = 100
    offset: int = 0


class AIModelQuotaBase(BaseModel):
    model_name: str
    daily_token_limit: int = 0
    daily_request_limit: int = 0


class AIModelQuotaCreate(AIModelQuotaBase):
    pass


class AIModelQuotaUpdate(BaseModel):
    daily_token_limit: Optional[int] = None
    daily_request_limit: Optional[int] = None


class AIModelQuota(AIModelQuotaBase):
    id: int
    updated_at: Optional[datetime] = None
    peak_daily_tokens: Optional[int] = 0
    current_daily_tokens: Optional[int] = 0
    period_tokens: Optional[int] = 0
    is_active: bool = False

    class Config:
        from_attributes = True
