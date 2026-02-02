from sqlalchemy import Column, Integer, String, DateTime, Text, Index, JSON
from sqlalchemy.sql import func
from database import Base


class IAMAuditLog(Base):
    """IAM 行为审计日志 (P2 Compliance)"""
    __tablename__ = "iam_audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # 操作者
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(100), nullable=True)
    
    # 行为标识: iam.login.success, iam.role.assign, etc.
    action = Column(String(100), index=True)
    
    # 操作目标
    target_type = Column(String(50))  # user, role, permission
    target_id = Column(Integer, nullable=True)
    target_name = Column(String(100), nullable=True)
    
    # 结果
    result = Column(String(20), default="success")  # success / fail
    reason = Column(String(255), nullable=True)     # fail reason
    
    # 详情 (JSON)
    detail = Column(JSON, nullable=True)
    
    # 来源信息
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(Text, nullable=True)
    trace_id = Column(String(100), nullable=True)
    
    __table_args__ = (
        Index('ix_iam_audit_action_ts', 'action', 'timestamp'),
        Index('ix_iam_audit_user_ts', 'user_id', 'timestamp'),
    )
