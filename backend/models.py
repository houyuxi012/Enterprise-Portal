from sqlalchemy import Column, Integer, String, Text, Boolean, Date, ForeignKey, Table
from sqlalchemy.orm import relationship
from database import Base

# Association Tables
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id'), primary_key=True)
)

user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('role_id', Integer, ForeignKey('roles.id'), primary_key=True)
)

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True) # e.g. "sys:user:edit"
    description = Column(String)

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True) # e.g. "admin"
    name = Column(String)
    limit_scope = Column(Boolean, default=False) # potentially for future scope limits
    
    permissions = relationship("Permission", secondary=role_permissions, backref="roles")

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    account = Column(String, unique=True, index=True) # 账户
    job_number = Column(String, unique=True, index=True) # 工号
    name = Column(String, index=True) # 姓名
    gender = Column(String) # 性别
    department = Column(String, index=True) # 部门
    role = Column(String) # 职位
    email = Column(String, unique=True, index=True) # 邮箱
    phone = Column(String) # 手机号码
    location = Column(String) # 办公地
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
    role = Column(String, default="user") # Deprecated, keeping for migration safety for now
    
    roles = relationship("Role", secondary=user_roles, backref="users")

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
