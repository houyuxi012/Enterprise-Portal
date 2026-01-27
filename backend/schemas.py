from pydantic import BaseModel
from typing import Optional, List
from datetime import date

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
    location: str
    avatar: str
    status: str

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

# User Schemas
class UserBase(BaseModel):
    username: str
    email: str
    is_active: Optional[bool] = True
    role: Optional[str] = "user"

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    class Config:
        from_attributes = True

# AI Schemas
class AIChatRequest(BaseModel):
    prompt: str
    history: Optional[List[dict]] = None

class AIChatResponse(BaseModel):
    response: str
