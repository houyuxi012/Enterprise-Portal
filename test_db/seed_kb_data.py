"""
Knowledge Base 测试数据初始化脚本
- 插入示例文档 (KBDocument)
- 插入示例分段 (KBChunk)，embedding 使用零向量占位
- 插入模拟检索日志 (KBQueryLog)
"""
import asyncio
import json
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from database import DATABASE_URL
from models import KBDocument, KBChunk, KBQueryLog, User

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

EMBEDDING_DIM = 768
ZERO_VEC = [0.0] * EMBEDDING_DIM

# ──── 示例文档 ────

SAMPLE_DOCS = [
    {
        "title": "员工考勤管理制度",
        "source_type": "md",
        "tags": ["制度", "考勤", "人事"],
        "acl": ["*"],
        "chunks": [
            {
                "section": "第一章 总则",
                "content": "为规范公司员工考勤管理，维护正常工作秩序，根据国家相关法律法规，结合公司实际情况，特制定本制度。本制度适用于公司全体员工（含试用期员工）。考勤周期为自然月，每月 1 日至最后一日。"
            },
            {
                "section": "第二章 工作时间",
                "content": "标准工作时间为每周一至周五，上午 9:00 — 12:00，下午 13:30 — 18:00。弹性工作制部门可在 8:00–10:00 间打卡，满 8 小时即可。午休时间为 12:00 — 13:30，不计入工时。核心工作时间段（10:00–12:00，14:00–17:00）禁止安排非紧急外出。"
            },
            {
                "section": "第三章 请假流程",
                "content": "请假需提前在 OA 系统提交申请，三天以内由直属主管审批，三天以上需部门总监审批，五天以上需 HR 副总裁审批。病假需附三甲医院证明。年假按工龄计算：1–10 年 5 天，10–20 年 10 天，20 年以上 15 天。年假不可跨年累积，特殊情况需 HR 审批。"
            },
            {
                "section": "第四章 加班与调休",
                "content": "加班需提前提交加班申请，由主管审批。工作日加班按 1.5 倍标准计算调休，法定节假日加班按 3 倍工资计算或折算调休。调休有效期为申请日起 3 个月内使用，逾期自动清零。每月加班上限不超过 36 小时。"
            },
        ],
    },
    {
        "title": "信息安全管理规范 v2.0",
        "source_type": "md",
        "tags": ["安全", "规范", "IT"],
        "acl": ["*"],
        "chunks": [
            {
                "section": "1. 概述",
                "content": "本规范旨在建立公司信息安全管理体系，保护公司数据资产安全。所有员工、外包人员、实习生均须遵守本规范。违规行为将依据公司奖惩条例处理，情节严重者追究法律责任。"
            },
            {
                "section": "2. 账户安全",
                "content": "密码策略：密码长度不少于 12 位，需包含大小写字母、数字、特殊字符中的至少三类。密码有效期 90 天，不可与近 5 次密码重复。禁止共享账户密码，禁止将密码记录在便利贴等不安全介质上。办公系统统一接入 SSO 单点登录，支持多因素认证(MFA)。"
            },
            {
                "section": "3. 数据分类与保护",
                "content": "公司数据分为四个等级：公开、内部、机密、绝密。机密及以上数据禁止通过外部邮箱、即时通讯工具传输。传输机密数据须使用加密通道（TLS 1.2+）。离职员工的数据访问权限须在离职当日 17:00 前全部关闭。"
            },
            {
                "section": "4. 办公设备管理",
                "content": "公司配发笔记本电脑须全盘加密(BitLocker/FileVault)。未经 IT 部门审批，不得连接私人存储设备。公司 WiFi 分为办公网络(Corp-Secure)和访客网络(Guest)，访客设备仅可连接 Guest 网络。设备丢失须在 2 小时内报告 IT 安全团队。"
            },
        ],
    },
    {
        "title": "企业门户系统操作手册",
        "source_type": "md",
        "tags": ["操作手册", "门户", "系统"],
        "acl": ["*"],
        "chunks": [
            {
                "section": "快速入门",
                "content": "打开浏览器访问 portal.company.com.cn 或内网地址 https://portal.internal。使用企业邮箱和 AD 域账号登录。首次登录后请在'个人中心'完善个人信息并设置头像。系统支持 Chrome、Edge、Firefox 浏览器，推荐使用 Chrome 最新版本。"
            },
            {
                "section": "新闻资讯模块",
                "content": "新闻资讯展示公司最新动态、行业资讯、技术分享等内容。支持按分类筛选，点击文章标题可查看详情。管理员可通过后台'内容管理 > 新闻资讯'发布、编辑、置顶或下架文章。文章支持 Markdown 格式，可插入图片和附件。"
            },
            {
                "section": "AI 助手使用指南",
                "content": "点击右下角悬浮球或导航栏的'AI 助手'图标可唤起智能对话窗口。AI 助手可回答公司制度问题、查询员工通讯录、搜索内部知识库文档。支持多轮对话，对话记录自动保存 30 天。敏感问题（如薪资、绩效）受安全策略保护，AI 不会回复。"
            },
        ],
    },
    {
        "title": "技术栈选型与架构决策记录",
        "source_type": "md",
        "tags": ["技术", "架构", "ADR"],
        "acl": ["role:PortalAdmin", "role:SuperAdmin"],
        "chunks": [
            {
                "section": "ADR-001: 后端框架选型",
                "content": "决策：选择 FastAPI 作为后端框架。原因：1) 原生 async 支持，适合 I/O 密集场景；2) 自动 OpenAPI 文档生成；3) Pydantic 数据验证。备选方案 Django REST Framework 因其同步模型被否决。Flask 因缺少内置数据验证被否决。"
            },
            {
                "section": "ADR-002: 向量数据库选型",
                "content": "决策：使用 pgvector 而非独立向量库。原因：1) 复用已有 PostgreSQL 实例，运维成本低；2) 支持 HNSW 索引，检索性能满足当前规模(<100K chunks)；3) ACL 过滤可与 SQL WHERE 子句结合。当文档规模超过 100 万分段时，考虑迁移至 Milvus/Qdrant。"
            },
            {
                "section": "ADR-003: Embedding 模型选型",
                "content": "决策：使用 Google Gemini text-embedding-004 (768维)。原因：1) 多语言支持优秀，中文检索准确率高；2) 免费配额满足初期需求 (1500 RPM)；3) 接口简洁，SDK 稳定。备选 OpenAI text-embedding-3-small 因成本原因未选用。本地部署 sentence-transformers 方案因 GPU 资源不足搁置。"
            },
        ],
    },
    {
        "title": "新员工入职指南",
        "source_type": "text",
        "tags": ["入职", "HR", "指南"],
        "acl": ["*"],
        "chunks": [
            {
                "section": "入职第一天",
                "content": "报到时间为上午 9:00，请携带身份证原件、学历证明原件、银行卡复印件、一寸照片 2 张前往人力资源部办理入职手续。入职当天将领取员工工牌、笔记本电脑、办公用品。IT 部门将协助配置企业邮箱、VPN、开发环境等。"
            },
            {
                "section": "培训安排",
                "content": "入职第一周为集中培训期。Day 1: 公司文化与组织架构介绍；Day 2: 规章制度与信息安全培训；Day 3: 业务系统与工具培训；Day 4-5: 部门专项培训与导师 1v1。培训期间需完成线上学习平台的必修课程（共 8 门），通过考核后方可转正。"
            },
        ],
    },
]

# ──── 模拟检索日志 ────

SAMPLE_QUERIES = [
    ("年假怎么计算", "strong", 0.91),
    ("密码多久换一次", "strong", 0.88),
    ("如何请假", "strong", 0.93),
    ("加班调休有效期多久", "strong", 0.85),
    ("公司 WiFi 密码是什么", "weak", 0.72),
    ("入职需要带什么材料", "strong", 0.89),
    ("后端为什么用 FastAPI", "strong", 0.87),
    ("向量数据库怎么选的", "strong", 0.84),
    ("怎么使用 AI 助手", "strong", 0.90),
    ("公司食堂在哪里", "miss", 0.42),
    ("项目进度怎么查看", "miss", 0.38),
    ("笔记本电脑需要加密吗", "strong", 0.86),
    ("数据泄露怎么处理", "weak", 0.73),
    ("调休过期了怎么办", "weak", 0.68),
    ("考勤打卡时间", "strong", 0.92),
    ("外包人员需要遵守信息安全规范吗", "strong", 0.83),
    ("公司最近有什么新闻", "miss", 0.35),
    ("报销流程是什么", "miss", 0.41),
    ("IT 设备报修流程", "miss", 0.33),
    ("员工培训考核怎么算通过", "weak", 0.71),
]


def _join_doc_content(chunks: list[dict]) -> str:
    parts = []
    for item in chunks:
        section = (item.get("section") or "").strip()
        content = (item.get("content") or "").strip()
        if section:
            parts.append(f"## {section}\n{content}".strip())
        else:
            parts.append(content)
    return "\n\n".join([p for p in parts if p]).strip()


async def _resolve_seed_user_ids(session: AsyncSession) -> tuple[int | None, list[int]]:
    admin_res = await session.execute(select(User.id).where(User.username == "admin"))
    admin_id = admin_res.scalar_one_or_none()

    user_res = await session.execute(
        select(User.id).where(User.is_active == True).order_by(User.id.asc())
    )
    user_ids = [int(row[0]) for row in user_res.all()]
    return (int(admin_id) if admin_id else None), user_ids


async def _upsert_documents(session: AsyncSession, now: datetime, created_by: int | None) -> list[int]:
    doc_ids: list[int] = []
    for idx, doc_data in enumerate(SAMPLE_DOCS):
        created_at = now - timedelta(days=len(SAMPLE_DOCS) - idx)
        tags_json = json.dumps(doc_data["tags"], ensure_ascii=False)
        acl_json = json.dumps(doc_data["acl"], ensure_ascii=False)
        content = _join_doc_content(doc_data["chunks"])

        existing_res = await session.execute(
            select(KBDocument).where(KBDocument.title == doc_data["title"])
        )
        doc = existing_res.scalars().first()

        if not doc:
            doc = KBDocument(
                title=doc_data["title"],
                source_type=doc_data["source_type"],
                content=content,
                tags=tags_json,
                acl=acl_json,
                status="ready",
                chunk_count=len(doc_data["chunks"]),
                created_by=created_by,
                created_at=created_at,
            )
            session.add(doc)
            await session.flush()
        else:
            doc.source_type = doc_data["source_type"]
            doc.content = content
            doc.tags = tags_json
            doc.acl = acl_json
            doc.status = "ready"
            doc.chunk_count = len(doc_data["chunks"])
            if doc.created_by is None and created_by is not None:
                doc.created_by = created_by
            if doc.created_at is None:
                doc.created_at = created_at
            await session.execute(delete(KBChunk).where(KBChunk.doc_id == doc.id))

        for ci, chunk_data in enumerate(doc_data["chunks"]):
            session.add(
                KBChunk(
                    doc_id=doc.id,
                    section=chunk_data["section"],
                    content=chunk_data["content"],
                    chunk_index=ci,
                    embedding=ZERO_VEC,
                    created_at=doc.created_at,
                )
            )

        doc_ids.append(doc.id)
        print(f"  > Upsert document [{doc.id}] {doc.title} ({len(doc_data['chunks'])} chunks)")

    return doc_ids


async def seed_kb_data():
    print("Beginning KB Data Seeding...")
    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        created_by, user_ids = await _resolve_seed_user_ids(session)

        # 1. Upsert 文档 + 分段
        doc_ids = await _upsert_documents(session, now, created_by)
        await session.commit()
        print(f"Upserted {len(doc_ids)} documents with chunks.")

        # 2. 清理旧 seed 检索日志，避免重复膨胀
        await session.execute(delete(KBQueryLog).where(KBQueryLog.trace_id.like("seed-kb-%")))
        await session.commit()

        # 3. 插入模拟检索日志（最近 7 天）
        logs = []
        for day_offset in range(7, -1, -1):
            day = now - timedelta(days=day_offset)
            daily_count = random.randint(8, 20)

            for _ in range(daily_count):
                q = random.choice(SAMPLE_QUERIES)
                # 添加一定随机性到分数
                score = q[2] + random.uniform(-0.05, 0.05)
                score = max(0.0, min(1.0, score))
                hit_level = q[1]

                log = KBQueryLog(
                    query=q[0],
                    top_score=round(score, 4),
                    hit_level=hit_level,
                    hit_doc_ids=json.dumps(random.sample(doc_ids, min(3, len(doc_ids)))),
                    called_llm=hit_level != "strong",
                    trace_id=f"seed-kb-{uuid.uuid4()}",
                    user_id=random.choice(user_ids) if user_ids else None,
                    created_at=day.replace(
                        hour=random.randint(8, 18),
                        minute=random.randint(0, 59),
                        second=random.randint(0, 59),
                    ),
                )
                logs.append(log)

        session.add_all(logs)
        await session.commit()
        print(f"Inserted {len(logs)} query logs.")

    print("KB Seeding Complete!")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_kb_data())
