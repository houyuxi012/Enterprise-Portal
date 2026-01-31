from sqlalchemy import Column, Integer, String, Text, Boolean, Date, ForeignKey, Table, DateTime, Float
from sqlalchemy.orm import relationship, backref
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
    is_top = Column(Boolean, default=False)

class QuickTool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    icon_name = Column(String) # Storing lucide icon name
    url = Column(String)
    color = Column(String)
    category = Column(String)
    description = Column(String)
    image = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)

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
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    role = Column(String, default="user") # Deprecated, keeping for migration safety for now
    
    roles = relationship("Role", secondary=user_roles, backref="users")

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)

    value = Column(String)

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    manager = Column(String, nullable=True)
    description = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    
    # Self-referential relationship for tree structure
    children = relationship("Department", back_populates="parent")
    parent = relationship("Department", remote_side=[id], back_populates="children")

class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, index=True) # INFO, WARN, ERROR
    module = Column(String, index=True)
    message = Column(Text)
    timestamp = Column(String)
    
    # Extended Access Log Fields
    ip_address = Column(String, nullable=True)
    request_path = Column(String, nullable=True)
    method = Column(String, nullable=True)
    status_code = Column(Integer, nullable=True)
    response_time = Column(Float, nullable=True)
    request_size = Column(Integer, nullable=True)
    user_agent = Column(String, nullable=True)

class BusinessLog(Base):
    __tablename__ = "business_logs"

    id = Column(Integer, primary_key=True, index=True)
    operator = Column(String, index=True)
    action = Column(String, index=True) # e.g. "CREATE_USER"
    target = Column(String, nullable=True) # e.g. "user:1"
    ip_address = Column(String, nullable=True)
    status = Column(String) # SUCCESS, FAIL
    detail = Column(Text, nullable=True)
    trace_id = Column(String, index=True, nullable=True)
    source = Column(String, default="WEB", nullable=True)  # 日志来源: WEB, API, SYSTEM, LOKI
    timestamp = Column(String)

class LogForwardingConfig(Base):
    __tablename__ = "log_forwarding_config"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String) # SYSLOG, WEBHOOK
    endpoint = Column(String)
    port = Column(Integer, nullable=True)
    secret_token = Column(String, nullable=True)
    enabled = Column(Boolean, default=False)

class CarouselItem(Base):
    __tablename__ = "carousel_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    image = Column(String)
    url = Column(String)
    badge = Column(String)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

class LoginAuditLog(Base):
    __tablename__ = "login_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True) # Valid user ID if exists
    username = Column(String, index=True) # Input username
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    success = Column(Boolean, default=False, index=True)
    reason = Column(String, nullable=True) 
    trace_id = Column(String, index=True, nullable=True)
    created_at = Column(String, index=True)

class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id = Column(Integer, primary_key=True, index=True)
    original_name = Column(String)
    stored_name = Column(String, unique=True, index=True) # UUID filename
    bucket = Column(String)
    size = Column(Integer)
    content_type = Column(String)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), index=True)

class AIProvider(Base):
    __tablename__ = "ai_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # e.g. "Gemini Pro", "DeepSeek V3"
    type = Column(String) # 'openai', 'gemini', 'deepseek', 'dashscope', 'zhipu'
    base_url = Column(String, nullable=True) # Custom endpoint
    api_key = Column(String) # Encrypted or raw (demo: raw)
    model = Column(String) # e.g. "gemini-pro", "deepseek-chat"
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=True)

class AISecurityPolicy(Base):
    __tablename__ = "ai_security_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String) # 'keyword', 'regex', 'length'
    content = Column(Text) # JSON list of rules
    action = Column(String) # 'block', 'mask', 'warn'
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
