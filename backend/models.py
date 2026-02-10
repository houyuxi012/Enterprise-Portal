from sqlalchemy import Column, Integer, String, Text, Boolean, Date, ForeignKey, Table, DateTime, Float, UniqueConstraint, JSON
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
    app_id = Column(String(50), index=True, default="portal")  # Multi-tenant isolation
    code = Column(String, index=True)  # e.g. "portal.user.edit"
    description = Column(String)
    created_at = Column(DateTime(timezone=True), nullable=True)
    
    __table_args__ = (
        UniqueConstraint('app_id', 'code', name='uq_perm_app_code'),
    )

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(String(50), index=True, default="portal")  # Multi-tenant isolation
    code = Column(String, index=True)  # e.g. "admin"
    name = Column(String)
    limit_scope = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), nullable=True)
    
    permissions = relationship("Permission", secondary=role_permissions, backref="roles")
    
    __table_args__ = (
        UniqueConstraint('app_id', 'code', name='uq_role_app_code'),
    )

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
    visible_to_departments = Column(Text, nullable=True) # JSON list of allowed department names

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
    
    roles = relationship("Role", secondary=user_roles, backref="users")

    @property
    def role(self):
        """
        Deprecated: Compatibility property for legacy 'role' field.
        Returns 'admin' if user has admin role, else 'user'.
        """
        if self.roles:
            for r in self.roles:
                if r.code == 'admin':
                    return 'admin'
        return 'user'

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
    domain = Column(String, default="BUSINESS", index=True) # BUSINESS / IAM / SYSTEM / AI
    timestamp = Column(String)

class LogForwardingConfig(Base):
    __tablename__ = "log_forwarding_config"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String) # SYSLOG, WEBHOOK
    endpoint = Column(String)
    port = Column(Integer, nullable=True)
    secret_token = Column(String, nullable=True)
    enabled = Column(Boolean, default=False)
    # 要外发的日志类型 (JSON array): ["BUSINESS", "SYSTEM", "ACCESS", "AI", "LOGIN"]
    log_types = Column(String, nullable=True, default='["BUSINESS","SYSTEM","ACCESS"]')

class CarouselItem(Base):
    __tablename__ = "carousel_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    image = Column(String)
    url = Column(String)
    badge = Column(String)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)



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


class AIAuditLog(Base):
    """
    AI 审计日志表 - 用于合规追责与复盘
    注意: 严禁存储 API Key/Token 明文，严禁保存 prompt/output 全文
    """
    __tablename__ = "ai_audit_log"

    # 标识字段
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(64), unique=True, index=True)  # UUID
    ts = Column(DateTime(timezone=True), index=True)  # 时间戳
    
    # 环境信息
    env = Column(String(20), default='production')  # dev/staging/production
    service = Column(String(50), default='enterprise-portal')
    request_id = Column(String(64), nullable=True)  # X-Request-ID
    trace_id = Column(String(64), index=True, nullable=True)  # 全链路追踪
    
    # 用户信息
    actor_type = Column(String(20))  # user/admin/system/api
    actor_id = Column(Integer, nullable=True, index=True)
    actor_ip = Column(String(45), nullable=True)
    session_id = Column(String(128), nullable=True)
    
    # 资源信息
    resource_type = Column(String(50), default='ai_chat')  # ai_chat/ai_completion
    resource_id = Column(String(128), nullable=True)  # provider+model 标识
    action = Column(String(50))  # CHAT/COMPLETION/IMAGE_GEN/SEARCH
    
    # AI 提供商信息
    provider = Column(String(50), index=True, nullable=True)  # gemini/openai/deepseek
    model = Column(String(100), nullable=True)
    api_key_fingerprint = Column(String(16), nullable=True)  # SHA256[:16]，不可逆
    
    # 安全策略结果
    input_policy_result = Column(String(20), nullable=True)   # ALLOW/BLOCK/MASK/WARN
    output_policy_result = Column(String(20), nullable=True)  # ALLOW/BLOCK/MASK
    policy_hits = Column(Text, nullable=True)  # JSON: ["keyword:xxx", "regex:yyy"]
    
    # 性能指标
    latency_ms = Column(Integer, nullable=True)
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    
    # 状态与错误
    status = Column(String(20), index=True)  # SUCCESS/BLOCKED/ERROR/TIMEOUT
    error_code = Column(String(50), nullable=True)
    error_reason = Column(Text, nullable=True)
    
    # 内容指纹 (用于去重与异常检测，不可逆)
    prompt_hash = Column(String(64), nullable=True)   # SHA256
    output_hash = Column(String(64), nullable=True)   # SHA256
    
    # 元数据 (JSON): RAG 引用、搜索结果、上下文 IDs 等
    meta_info = Column(JSON, nullable=True)
    
    # 脱敏预览 (可选，仅前 200 字符)
    prompt_preview = Column(String(200), nullable=True)
    
    # 来源标识 (硬编码，非猜测)
    source = Column(String(20), default='ai_audit')


class AIModelQuota(Base):
    __tablename__ = "ai_model_quotas"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String, unique=True, index=True)
    daily_token_limit = Column(Integer, default=0)  # 每日 Token 限额 (0表示无限制)
    daily_request_limit = Column(Integer, default=0) # 每日调用次数限额
    updated_at = Column(DateTime(timezone=True), nullable=True)


# ──── Knowledge Base Models ────
from pgvector.sqlalchemy import Vector

class KBDocument(Base):
    """知识库文档元数据"""
    __tablename__ = "kb_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    source_type = Column(String(20), default="text")  # md, pdf, text
    content = Column(Text, nullable=True)  # 原始文档内容（用于无损重建索引）
    tags = Column(Text, nullable=True)  # JSON list
    app_id = Column(String(50), default="portal", index=True)
    acl = Column(Text, default='["*"]')  # JSON list: ["*"] = public, ["role:admin"]
    status = Column(String(20), default="processing", index=True)  # processing/ready/error
    chunk_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)

    chunks = relationship("KBChunk", back_populates="document", cascade="all, delete-orphan")


class KBChunk(Base):
    """文档分段 + 向量"""
    __tablename__ = "kb_chunks"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("kb_documents.id", ondelete="CASCADE"), index=True)
    section = Column(String, nullable=True)
    content = Column(Text)
    chunk_index = Column(Integer, default=0)
    embedding = Column(Vector(768))  # Gemini text-embedding-004 = 768 dims
    created_at = Column(DateTime(timezone=True), nullable=True)

    document = relationship("KBDocument", back_populates="chunks")


class KBQueryLog(Base):
    """KB 检索审计日志"""
    __tablename__ = "kb_query_logs"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text)
    top_score = Column(Float, nullable=True)
    hit_level = Column(String(10), nullable=True)  # strong/weak/miss
    hit_doc_ids = Column(Text, nullable=True)  # JSON list
    called_llm = Column(Boolean, default=False)
    trace_id = Column(String(64), index=True, nullable=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
