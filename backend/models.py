from sqlalchemy import Column, Integer, String, Text, Boolean, Date
from database import Base

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    role = Column(String)
    department = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    avatar = Column(String)
    status = Column(String)

class NewsItem(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    summary = Column(Text)
    category = Column(String)
    date = Column(Date)
    author = Column(String)
    image = Column(String)

class QuickTool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    icon_name = Column(String) # Storing lucide icon name
    url = Column(String)
    color = Column(String)
    category = Column(String)
    description = Column(String)

class Announcement(Base):
    __tablename__ = "announcements"
    
    id = Column(Integer, primary_key=True, index=True)
    tag = Column(String)
    title = Column(String)
    content = Column(Text)
    time = Column(String) # Keeping as string for "20 mins ago" etc for now, or timestamp later
    color = Column(String)
    is_urgent = Column(Boolean, default=False)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="user") # "admin" or "user"
