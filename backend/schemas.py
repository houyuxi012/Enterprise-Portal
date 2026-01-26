from pydantic import BaseModel
from typing import Optional, List
from datetime import date

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

class EmployeeBase(BaseModel):
    name: str
    role: str
    department: str
    email: str
    avatar: str
    status: str

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(EmployeeBase):
    pass

class Employee(EmployeeBase):
    id: int

    class Config:
        from_attributes = True

class NewsItemBase(BaseModel):
    title: str
    summary: str
    category: str
    date: date
    author: str
    image: str

class NewsItemCreate(NewsItemBase):
    pass

class NewsItemUpdate(NewsItemBase):
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
    category: str
    description: str

class QuickToolCreate(QuickToolBase):
    pass

class QuickTool(QuickToolBase):
    id: int

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    prompt: str

class ChatResponse(BaseModel):
    response: str
