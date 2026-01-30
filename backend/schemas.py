from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

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
    job_number: str
    name: str
    gender: str
    department: str
    role: str
    email: str
    phone: str
    location: Optional[str] = None
    avatar: Optional[str] = None
    # status field removed

class EmployeeCreate(EmployeeBase):
    pass

class Employee(EmployeeBase):
    id: int
    class Config:
        from_attributes = True

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

class Permission(PermissionBase):
    id: int
    class Config:
        from_attributes = True

class RoleBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None

class RoleCreate(RoleBase):
    permission_ids: List[int] = []

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None

class Role(RoleBase):
    id: int
    permissions: List[Permission] = []
    class Config:
        from_attributes = True

# User Schemas
class UserBase(BaseModel):
    username: str
    email: str
    name: Optional[str] = None
    avatar: Optional[str] = None
    is_active: Optional[bool] = True
    role: Optional[str] = "user"


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

# AI Schemas
class AIChatRequest(BaseModel):
    prompt: str
    history: Optional[List[dict]] = None

class AIChatResponse(BaseModel):
    response: str

class PasswordResetRequest(BaseModel):
    username: str
    new_password: Optional[str] = "123456"

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

# AI Management Schemas
class AIProviderBase(BaseModel):
    name: str
    type: str # 'openai', 'gemini', 'deepseek', 'dashscope', 'zhipu'
    base_url: Optional[str] = None
    api_key: str
    model: str
    is_active: bool = False

class AIProviderCreate(AIProviderBase):
    pass

class AIProviderUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None

class AIProvider(AIProviderBase):
    id: int
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

