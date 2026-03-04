from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


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
    status: Optional[str] = "Active"


class EmployeeCreate(EmployeeBase):
    pass


class Employee(EmployeeBase):
    id: int
    auth_source: Optional[str] = "local"
    totp_enabled: Optional[bool] = False

    class Config:
        from_attributes = True


class EmployeeCreateResult(Employee):
    portal_initial_password: Optional[str] = None
    portal_account_auto_created: bool = False


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


class QuickToolBase(BaseModel):
    name: str
    icon_name: str
    url: str
    color: str
    category: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = 0
    visible_to_departments: Optional[str] = None


class QuickToolCreate(QuickToolBase):
    pass


class QuickTool(QuickToolBase):
    id: int

    class Config:
        from_attributes = True


class AnnouncementBase(BaseModel):
    tag: str
    title: str
    content: str
    color: str
    is_urgent: bool = False


class AnnouncementCreate(AnnouncementBase):
    pass


class Announcement(AnnouncementBase):
    id: int
    time: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AnnouncementReadStateUpdate(BaseModel):
    announcement_ids: list[int] = []


class AnnouncementReadStateResponse(BaseModel):
    announcement_ids: list[int] = []


class NotificationBase(BaseModel):
    title: str
    message: str
    type: str = "info"
    action_url: Optional[str] = None


class NotificationPushRequest(NotificationBase):
    user_ids: list[int] = []
    broadcast: bool = False


class NotificationItem(NotificationBase):
    id: int
    created_at: Optional[datetime] = None
    is_read: bool = False
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationReadStateUpdate(BaseModel):
    notification_ids: list[int] = []


class NotificationReadStateResponse(BaseModel):
    notification_ids: list[int] = []


class NotificationUnreadCount(BaseModel):
    unread_count: int = 0


class NotificationPushResult(BaseModel):
    notification_id: int
    recipient_count: int


class AIChatRequest(BaseModel):
    prompt: str = Field("", max_length=4000)
    history: Optional[list[dict]] = None
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


class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "pending"
    priority: Optional[int] = 2
    due_at: Optional[datetime] = None
    assignee_user_ids: list[int] = []
    assignee_dept_ids: list[int] = []


class TodoCreate(TodoBase):
    pass


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    due_at: Optional[datetime] = None
    assignee_user_ids: Optional[list[int]] = None
    assignee_dept_ids: Optional[list[int]] = None


class TodoUserResponse(BaseModel):
    id: int
    name: Optional[str] = None
    username: str

    class Config:
        from_attributes = True


class TodoDeptResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class Todo(TodoBase):
    id: int
    creator_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    assigned_users: list[TodoUserResponse] = []
    assigned_departments: list[TodoDeptResponse] = []
    creator_name: Optional[str] = None

    class Config:
        from_attributes = True


class PaginatedTodoResponse(BaseModel):
    items: list[Todo]
    total: int
    page: int
    page_size: int


class TodoStatsResponse(BaseModel):
    scope: str
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

