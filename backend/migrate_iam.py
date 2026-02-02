"""
IAM 数据迁移脚本
为现有 Permission 和 Role 数据添加 app_id 默认值
"""
import asyncio
from sqlalchemy import text
from database import async_engine, Base
import models  # 导入以注册所有模型

async def migrate():
    async with async_engine.begin() as conn:
        # 1. 添加 app_id 列（如果不存在）
        print("检查并添加 app_id 列...")
        
        # SQLite 不支持 ALTER TABLE ADD COLUMN IF NOT EXISTS
        # 所以我们需要检查列是否存在
        try:
            # 检查 permissions 表
            result = await conn.execute(text("PRAGMA table_info(permissions)"))
            perm_cols = [row[1] for row in result.fetchall()]
            
            if 'app_id' not in perm_cols:
                await conn.execute(text("ALTER TABLE permissions ADD COLUMN app_id VARCHAR(50) DEFAULT 'portal'"))
                print("✅ permissions.app_id 已添加")
            else:
                print("ℹ️ permissions.app_id 已存在")
                
            if 'created_at' not in perm_cols:
                await conn.execute(text("ALTER TABLE permissions ADD COLUMN created_at DATETIME"))
                print("✅ permissions.created_at 已添加")
            else:
                print("ℹ️ permissions.created_at 已存在")
                
            # 检查 roles 表
            result = await conn.execute(text("PRAGMA table_info(roles)"))
            role_cols = [row[1] for row in result.fetchall()]
            
            if 'app_id' not in role_cols:
                await conn.execute(text("ALTER TABLE roles ADD COLUMN app_id VARCHAR(50) DEFAULT 'portal'"))
                print("✅ roles.app_id 已添加")
            else:
                print("ℹ️ roles.app_id 已存在")
                
            if 'created_at' not in role_cols:
                await conn.execute(text("ALTER TABLE roles ADD COLUMN created_at DATETIME"))
                print("✅ roles.created_at 已添加")
            else:
                print("ℹ️ roles.created_at 已存在")
                
        except Exception as e:
            print(f"❌ 迁移失败: {e}")
            raise
            
        # 2. 更新现有数据的 app_id 为 'portal'
        print("更新现有数据...")
        await conn.execute(text("UPDATE permissions SET app_id = 'portal' WHERE app_id IS NULL"))
        await conn.execute(text("UPDATE roles SET app_id = 'portal' WHERE app_id IS NULL"))
        print("✅ 现有数据已更新")
        
        # 3. 创建索引（如果不存在）
        try:
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_permissions_app_id ON permissions(app_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_roles_app_id ON roles(app_id)"))
            print("✅ 索引已创建")
        except Exception as e:
            print(f"ℹ️ 索引可能已存在: {e}")
            
        print("🎉 IAM 数据迁移完成!")

if __name__ == "__main__":
    asyncio.run(migrate())
