from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from enum import Enum

# Department Schemas
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
    children: List['Department'] = []

    class Config:
        from_attributes = True

# Employee Schemas
class EmployeeBase(BaseModel):
    account: str
    job_number: Optional[str] = None
    name: str
    gender: str
    department: str
    role: Optional[str] = None
    email: str
    phone: str
    location: Optional[str] = None
    avatar: Optional[str] = None
    status: Optional[str] = "Active" # Active / Inactive

class EmployeeCreate(EmployeeBase):
    pass

class Employee(EmployeeBase):
    id: int
    class Config:
        from_attributes = True


class EmployeeCreateResult(Employee):
    portal_initial_password: Optional[str] = None
    portal_account_auto_created: bool = False

# News Schemas
class NewsItemBase(BaseModel):
    title: str
    summary: str
    category: str
    date: date
    author: str
    image: str
    is_top: bool = False

class NewsItemCreate(NewsItemBase):
    pass

class NewsItem(NewsItemBase):
    id: int
    class Config:
        from_attributes = True

# Tool Schemas
class QuickToolBase(BaseModel):
    name: str
    icon_name: str
    url: str
    color: str
    category: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = 0
    visible_to_departments: Optional[str] = None # JSON string of allowed departments

class QuickToolCreate(QuickToolBase):
    pass

class QuickTool(QuickToolBase):
    id: int
    class Config:
        from_attributes = True

# Announcement Schemas
class AnnouncementBase(BaseModel):
    tag: str
    title: str
    content: str
    time: str
    color: str
    is_urgent: bool = False

class AnnouncementCreate(AnnouncementBase):
    pass

class Announcement(AnnouncementBase):
    id: int
    class Config:
        from_attributes = True

# Role/Permission Schemas
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
    permission_ids: List[int] = []

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None

class Role(RoleBase):
    id: int
    permissions: List[Permission] = []
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Simplified Role for /me response
class RoleOut(BaseModel):
    id: int
    code: str
    name: str
    app_id: str = "portal"
    
    class Config:
        from_attributes = True

# User Schemas
class UserBase(BaseModel):
    username: str
    email: str
    account_type: Optional[str] = "PORTAL"
    name: Optional[str] = None
    avatar: Optional[str] = None
    is_active: Optional[bool] = True
    role: Optional[str] = "user"  # Deprecated, kept for compatibility


class UserCreate(UserBase):
    password: str
    role_ids: Optional[List[int]] = []

class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None # Deprecated
    role_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None

class User(UserBase):
    id: int
    roles: List[Role] = []
    class Config:
        from_attributes = True


class UserOption(BaseModel):
    id: int
    username: str
    name: Optional[str] = None

    class Config:
        from_attributes = True

# IAM /me Response (flattened permissions + version)
class UserMeResponse(BaseModel):
    id: int
    username: str
    email: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    is_active: bool = True
    roles: List[RoleOut] = []
    permissions: List[str] = []  # Flattened permission codes
    perm_version: int = 1
    
    class Config:
        from_attributes = True

# AI Schemas
class AIChatRequest(BaseModel):
    prompt: str = Field("", max_length=4000)
    history: Optional[List[dict]] = None
    model_id: Optional[int] = None
    image_url: Optional[str] = Field(None, max_length=2048)

class AIModelOption(BaseModel):
    id: int
    name: str
    model: str
    type: str
    model_kind: str = "text"

class AIChatResponse(BaseModel):
    response: str

class PasswordResetRequest(BaseModel):
    username: str
    new_password: Optional[str] = None

# Log Management Schemas
class SystemLogBase(BaseModel):
    level: str
    module: str
    message: str
    timestamp: str

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
    timestamp: str
    source: Optional[str] = None  # DB, LOKI, or DB,LOKI

class BusinessLogCreate(BusinessLogBase):
    pass

class BusinessLog(BusinessLogBase):
    id: int
    class Config:
        from_attributes = True

class LogForwardingConfigBase(BaseModel):
    type: str # SYSLOG, WEBHOOK
    endpoint: str
    port: Optional[int] = None
    secret_token: Optional[str] = None
    enabled: bool = False
    log_types: Optional[List[str]] = ["BUSINESS", "SYSTEM", "ACCESS"]  # 要外发的日志类型

class LogForwardingConfigCreate(LogForwardingConfigBase):
    pass

class LogForwardingConfig(LogForwardingConfigBase):
    id: int
    class Config:
        from_attributes = True

# Carousel Schemas
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

# Dashboard & System Monitor Schemas
class SystemResources(BaseModel):
    cpu_percent: float
    memory_percent: float
    memory_used: str  # e.g. "4.2GB"
    memory_total: str # e.g. "16GB"
    disk_percent: float
    network_sent_speed: float # MB/s
    network_recv_speed: float # MB/s

class DashboardStats(BaseModel):
    system_visits: int
    active_users: int
    tool_clicks: int # Calculated from BusinessLog
    new_content: int # News count
    activity_trend: str # e.g. "+15.5%"
    active_users_trend: str
    tool_clicks_trend: str
    new_content_trend: str
    peak_time_data: List[int] # 7 days: Sun, Mon, Tue, Wed, Thu, Fri, Sat

# AI Management Schemas
class AIProviderBase(BaseModel):
    name: str
    type: str # 'openai', 'gemini', 'deepseek', 'dashscope', 'zhipu'
    model_kind: str = "text" # 'text' | 'multimodal'
    base_url: Optional[str] = None
    api_key: str
    model: str
    is_active: bool = False

class AIProviderTestRequest(BaseModel):
    name: str
    type: str # 'openai', 'gemini', 'deepseek', 'dashscope', 'zhipu'
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
    type: str # 'keyword', 'regex', 'length'
    content: str # JSON list of rules
    action: str # 'block', 'mask', 'warn'
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


# AI Audit Log Schemas
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
    """Query parameters for AI audit logs"""
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    actor_id: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    source: str = "db"  # db, loki, or all
    limit: int = 100
    offset: int = 0


# AI Model Quota Schemas
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
    
    # Computed fields for dashboard
    peak_daily_tokens: Optional[int] = 0
    current_daily_tokens: Optional[int] = 0
    period_tokens: Optional[int] = 0 # Total tokens in the filtered period
    is_active: bool = False # Whether the model is currently configured in AIProvider

    class Config:
        from_attributes = True


# Todo Schemas
class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "pending"
    priority: Optional[int] = 2  # 0=Emergency, 1=High, 2=Medium, 3=Low
    due_at: Optional[datetime] = None
    assignee_id: Optional[int] = None

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    due_at: Optional[datetime] = None
    assignee_id: Optional[int] = None

class Todo(TodoBase):
    id: int
    creator_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    # Optional nested user info for display
    assignee_name: Optional[str] = None
    creator_name: Optional[str] = None

    class Config:
        from_attributes = True

class PaginatedTodoResponse(BaseModel):
    items: List[Todo]
    total: int
    page: int
    page_size: int


class TodoStatsResponse(BaseModel):
    scope: str  # active | all
    total: int
    emergency: int
    high: int
    medium: int
    low: int
    unclassified: int
    pending: int
    in_progress: int
    completed: int
    canceled: int
