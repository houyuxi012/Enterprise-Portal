from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
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
from shared.base_models import todo_dept_assignees, todo_user_assignees


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    account = Column(String, unique=True, index=True)
    job_number = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    gender = Column(String)
    department = Column(String, index=True)
    primary_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True, index=True)
    role = Column(String)
    email = Column(String, unique=True, index=True)
    phone = Column(String)
    location = Column(String)
    avatar = Column(String)
    avatar_hash = Column(String(64), nullable=True, index=True)
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
    icon_name = Column(String)
    url = Column(String)
    color = Column(String)
    category = Column(String)
    description = Column(String)
    image = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    visible_to_departments = Column(Text, nullable=True)


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    tag = Column(String)
    title = Column(String)
    content = Column(Text)
    time = Column(String)
    created_at = Column(DateTime(timezone=True), nullable=True, default=datetime.utcnow, index=True)
    color = Column(String)
    is_urgent = Column(Boolean, default=False)


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    announcement_id = Column(Integer, ForeignKey("announcements.id"), nullable=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "announcement_id", name="uq_announcement_read_user_announcement"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(20), nullable=False, default="info")
    action_url = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)

    receipts = relationship("NotificationReceipt", back_populates="notification", cascade="all, delete-orphan")


class NotificationReceipt(Base):
    __tablename__ = "notification_receipts"

    id = Column(Integer, primary_key=True, index=True)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)

    notification = relationship("Notification", back_populates="receipts")

    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_receipt_notification_user"),
    )


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
    stored_name = Column(String, unique=True, index=True)
    bucket = Column(String)
    size = Column(Integer)
    content_type = Column(String)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), index=True)


class KBDocument(Base):
    __tablename__ = "kb_documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
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

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("kb_documents.id", ondelete="CASCADE"), index=True)
    section = Column(String, nullable=True)
    content = Column(Text)
    chunk_index = Column(Integer, default=0)
    embedding = Column(Vector(768))
    created_at = Column(DateTime(timezone=True), nullable=True)

    document = relationship("KBDocument", back_populates="chunks")


class KBQueryLog(Base):
    __tablename__ = "kb_query_logs"

    id = Column(Integer, primary_key=True, index=True)
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
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, default="pending", index=True)
    priority = Column(Integer, default=2)
    due_at = Column(DateTime(timezone=True), nullable=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_users = relationship("User", secondary=todo_user_assignees, backref="assigned_todos")
    assigned_departments = relationship("Department", secondary=todo_dept_assignees, backref="assigned_todos")
    creator = relationship("User", foreign_keys=[creator_id], backref="created_todos")

