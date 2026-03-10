from __future__ import annotations

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    BigInteger,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from core.database import Base
from core.time_utils import utc_now
from shared.base_models import todo_dept_assignees, todo_user_assignees


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    account = Column(String(128), unique=True, index=True)
    job_number = Column(String(64), unique=True, index=True)
    name = Column(String(128), index=True)
    gender = Column(String(16))
    department = Column(String(128), index=True)
    primary_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    role = Column(String(128))
    email = Column(String(255), unique=True, index=True)
    phone = Column(String(32))
    location = Column(String(255))
    avatar = Column(String(512))
    avatar_hash = Column(String(64), nullable=True, index=True)
    status = Column(String(32))


class NewsItem(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    summary = Column(Text)
    category = Column(String(64))
    date = Column(Date)
    author = Column(String(128))
    image = Column(String(512))
    is_top = Column(Boolean, default=False)


class QuickTool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), index=True)
    url = Column(String(1024))
    category = Column(String(64))
    description = Column(String(255))
    image = Column(String(512), nullable=True)
    sort_order = Column(Integer, default=0)
    visible_to_departments = Column(Text, nullable=True)


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    tag = Column(String(64))
    title = Column(String(255))
    content = Column(Text)
    time = Column(String(64))
    created_at = Column(DateTime(timezone=True), nullable=True, default=utc_now, index=True)
    color = Column(String(32))
    is_urgent = Column(Boolean, default=False)


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.id"), nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "announcement_id", name="uq_announcement_read_user_announcement"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(20), nullable=False, default="info")
    action_url = Column(String(1024), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    receipts = relationship("NotificationReceipt", back_populates="notification", cascade="all, delete-orphan")


class NotificationReceipt(Base):
    __tablename__ = "notification_receipts"

    id = Column(BigInteger, primary_key=True, index=True)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    notification = relationship("Notification", back_populates="receipts")

    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_receipt_notification_user"),
    )


class CarouselItem(Base):
    __tablename__ = "carousel_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    image = Column(String(512))
    url = Column(String(1024))
    badge = Column(String(64))
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)


class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id = Column(Integer, primary_key=True, index=True)
    original_name = Column(String(255))
    stored_name = Column(String(255), unique=True, index=True)
    bucket = Column(String(128))
    size = Column(Integer)
    content_type = Column(String(255))
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), index=True)


class KBDocument(Base):
    __tablename__ = "kb_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    source_type = Column(String(20), default="text")
    content = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)
    app_id = Column(String(50), default="portal", index=True)
    acl = Column(Text, default='["*"]')
    status = Column(String(20), default="processing", index=True)
    chunk_count = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)

    chunks = relationship("KBChunk", back_populates="document", cascade="all, delete-orphan")


class KBChunk(Base):
    __tablename__ = "kb_chunks"

    id = Column(BigInteger, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("kb_documents.id", ondelete="CASCADE"), index=True)
    section = Column(String(255), nullable=True)
    content = Column(Text)
    chunk_index = Column(Integer, default=0)
    embedding = Column(Vector(768))
    created_at = Column(DateTime(timezone=True), nullable=True)

    document = relationship("KBDocument", back_populates="chunks")


class KBQueryLog(Base):
    __tablename__ = "kb_query_logs"

    id = Column(BigInteger, primary_key=True, index=True)
    query = Column(Text)
    top_score = Column(Float, nullable=True)
    hit_level = Column(String(10), nullable=True)
    hit_doc_ids = Column(Text, nullable=True)
    called_llm = Column(Boolean, default=False)
    trace_id = Column(String(64), index=True, nullable=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=True)


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text, nullable=True)
    status = Column(String(32), default="pending", index=True)
    priority = Column(Integer, default=2)
    due_at = Column(DateTime(timezone=True), nullable=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    assigned_users = relationship("User", secondary=todo_user_assignees, backref="assigned_todos")
    assigned_departments = relationship("Department", secondary=todo_dept_assignees, backref="assigned_todos")
    creator = relationship("User", foreign_keys=[creator_id], backref="created_todos")
